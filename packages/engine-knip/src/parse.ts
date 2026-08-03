import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { EngineError, createLineIndex, toRepoRelative, type LineIndex, type RawDiagnostic } from '@misaon/slop-gate-core'
import { KNIP_ISSUE_TYPES, isSurfacedIssueType, type KnipIssueType } from './issue-types.ts'

type KnipItem = {
  name: string
  /** knip's own `parentSymbol` — the enum or namespace an unused member belongs to. */
  namespace?: string
  line?: number
  col?: number
  pos?: number
}

/**
 * One row per file. Every *reported* issue type is present as a key (empty array when that file has
 * none of it), which is what lets `assertReportedTypes` below verify the materialised `include`
 * actually took effect — knip has no `number_of_rules` counter the way oxlint does, but the row's own
 * key set is the same evidence in a different shape.
 *
 * `duplicates` (and the excluded `cycles`) are arrays *of arrays*: one inner array per group of
 * symbols that are duplicates of each other. Every other type is a flat array. Confirmed both from
 * knip's own `reporters/json.js` (`symbols.map(convert)` for exactly those two, `convert(issue)` for
 * the rest) and from captured output.
 */
type KnipEntry = { file: string } & Partial<Record<KnipIssueType, KnipItem[] | KnipItem[][]>>

type KnipReport = { issues?: KnipEntry[] }

/**
 * Message text per surfaced issue type, deliberately keeping knip's own vocabulary ("Unused file",
 * "Unlisted binary") rather than inventing engine-independent prose: the concept id is already the
 * engine-independent name (spec §5.1), and a user cross-checking a finding against a bare `knip` run
 * — which is exactly what someone doubting a dead-code report does — should meet the same words.
 */
const DESCRIBE: Readonly<Record<KnipIssueType, (item: KnipItem) => string>> = {
  files: () => 'Unused file: not reachable from any entry point.',
  dependencies: (item) => `Unused dependency \`${item.name}\`.`,
  devDependencies: (item) => `Unused devDependency \`${item.name}\`.`,
  unlisted: (item) => `Unlisted dependency \`${item.name}\`: imported but not declared in package.json.`,
  binaries: (item) => `Unlisted binary \`${item.name}\`: used in a script but not provided by any dependency.`,
  unresolved: (item) => `Unresolved import \`${item.name}\`.`,
  exports: (item) => `Unused export \`${item.name}\`.`,
  types: (item) => `Unused exported type \`${item.name}\`.`,
  enumMembers: (item) => `Unused exported enum member \`${qualify(item)}\`.`,
  duplicates: (item) => `Duplicate export \`${item.name}\`.`,
  // Present so the record is total over `KnipIssueType` — `isSurfacedIssueType` filters every one of
  // these out long before a description is ever asked for. See issue-types.ts for why each is excluded.
  nsExports: (item) => `Unused export \`${item.name}\` in a used namespace.`,
  nsTypes: (item) => `Unused exported type \`${item.name}\` in a used namespace.`,
  namespaceMembers: (item) => `Unused exported namespace member \`${qualify(item)}\`.`,
  cycles: (item) => `Circular dependency through \`${item.name}\`.`,
  catalog: (item) => `Unused catalog entry \`${item.name}\`.`,
  catalogReferences: (item) => `Unresolved catalog reference \`${item.name}\`.`,
  optionalPeerDependencies: (item) => `Referenced optional peer dependency \`${item.name}\`.`,
}

const qualify = (item: KnipItem): string => (item.namespace === undefined ? item.name : `${item.namespace}.${item.name}`)

/**
 * Parses knip's `--reporter json` output into `RawDiagnostic`s.
 *
 * **Positions.** knip reports `line`/`col` (1-based) and `pos` (0-based) in **UTF-16 code units** —
 * verified directly against a fixture whose declaration sits after an astral-plane emoji and several
 * two-byte characters: knip said `col: 43` where the UTF-16 column is 43, the byte column 49 and the
 * codepoint column 42. That is spec §10's own column convention, so `LineIndex.offsetAt` converts it
 * to the byte offsets `RawDiagnostic.range` requires with no adjustment — identical to what
 * `engine-tsc`'s parser does, and for the identical reason.
 *
 * knip gives no *length* for a finding, only a start, so every positioned diagnostic gets a
 * deliberate one-character range (same trade, and same documented limitation, as `engine-tsc`).
 * `files` and `binaries` carry no position at all — a whole-file finding and a `package.json`-script
 * finding respectively — and get `{ start: 0, end: 0 }`, which normalizes to line 1, column 1.
 *
 * **Duplicate findings across files are kept, deliberately.** knip reports the same logical problem
 * once per referencing file: an `express` import missing from `package.json` in three source files is
 * three rows, each with its own real position (measured — this is exactly what the srvc-bat grounding
 * run showed). They stay three diagnostics rather than being collapsed into one, because slop-gate's
 * whole diagnostic model is per-(file, range): a single collapsed finding would have to pick one file
 * arbitrarily, and — decisively — an inline `sgate-disable-*` for `deps.unlisted-dependency` on one
 * import site would then silently govern, or fail to govern, the other two. knip already deduplicates
 * *within* a file (its issue store is keyed by file then symbol), so no two of the three are ever the
 * same position.
 *
 * @yields One `RawDiagnostic` per knip issue item, in knip's own row order.
 */
export async function* parseKnipOutput(
  stdout: string,
  rootDir: string,
  expected?: { issueTypes: readonly string[] },
): AsyncGenerator<RawDiagnostic> {
  const trimmed = stdout.trim()
  if (trimmed === '') throw new EngineError('knip', 'knip produced no output at all')

  // knip writes progress and configuration hints to stderr, not stdout, and `--reporter json` is the
  // only stdout writer — but `indexOf('{')` costs nothing and matches how `parseOxlintOutput` already
  // survives a plain-text preamble, so a future knip version that prints a banner does not take a run down.
  const jsonStart = trimmed.indexOf('{')
  if (jsonStart === -1) {
    throw new EngineError('knip', `knip produced no json output: ${trimmed.slice(0, 200)}`)
  }

  let report: KnipReport
  try {
    report = JSON.parse(trimmed.slice(jsonStart)) as KnipReport
  } catch (cause) {
    throw new EngineError('knip', `could not parse knip json output: ${trimmed.slice(0, 200)}`, { cause })
  }
  if (!Array.isArray(report.issues)) {
    throw new EngineError('knip', 'knip json output has no issues array')
  }

  assertReportedTypes(report.issues, expected)

  const lineIndexes = new Map<string, LineIndex>()
  const indexFor = async (file: string): Promise<LineIndex> => {
    const cached = lineIndexes.get(file)
    if (cached !== undefined) return cached
    const index = createLineIndex(await readFile(join(rootDir, file), 'utf8'))
    lineIndexes.set(file, index)
    return index
  }

  for (const entry of report.issues) {
    const file = toRepoRelative(entry.file, rootDir)
    for (const issueType of KNIP_ISSUE_TYPES) {
      if (!isSurfacedIssueType(issueType)) continue
      const items = entry[issueType]
      if (items === undefined) continue

      for (const item of flatten(items)) {
        let range = { start: 0, end: 0 }
        if (item.line !== undefined && item.col !== undefined) {
          const index = await indexFor(file)
          const start = index.offsetAt({ line: item.line, column: item.col })
          range = { start, end: index.offsetAt({ line: item.line, column: item.col + 1 }) }
        }

        yield {
          engineRuleId: issueType,
          message: DESCRIBE[issueType](item),
          // knip has no severity of its own: every issue type is reported flatly, and the level comes
          // entirely from the resolved ruleset downstream. `'warning'` is the honest neutral value —
          // `RawDiagnostic.severity` is required by the interface and read by nothing today (recorded
          // in the M0 follow-ups' "Decide rather than defer again").
          severity: 'warning',
          file,
          range,
        }
      }
    }
  }
}

const flatten = (items: KnipItem[] | KnipItem[][]): KnipItem[] =>
  items.flatMap((item) => (Array.isArray(item) ? item : [item]))

/**
 * The knip counterpart of `parseOxlintOutput`'s `number_of_rules` check, and it exists for the same
 * two silent failures: a category leaking in that arbitration never elected, and an elected category
 * knip never actually reported on. knip publishes no rule count, but its JSON reporter seeds every row
 * with an empty array for each *reported* type (`initRow`, `knip/dist/reporters/json.js`), so a row's
 * own key set is a complete, first-hand statement of what the run was configured to report.
 *
 * Only checkable when there is at least one row: a completely clean repository yields `issues: []`,
 * which says nothing either way and must not be treated as a mismatch.
 */
function assertReportedTypes(entries: readonly KnipEntry[], expected?: { issueTypes: readonly string[] }): void {
  const first = entries[0]
  if (expected === undefined || first === undefined) return

  const known = new Set<string>(KNIP_ISSUE_TYPES)
  const reported = Object.keys(first).filter((key) => known.has(key)).sort()
  const wanted = [...expected.issueTypes].sort()
  if (reported.join(',') === wanted.join(',')) return

  throw new EngineError(
    'knip',
    `expected knip to report [${wanted.join(', ')}], it reported [${reported.join(', ')}]. ` +
      'The materialised config is not selecting exactly the elected ruleset.',
  )
}
