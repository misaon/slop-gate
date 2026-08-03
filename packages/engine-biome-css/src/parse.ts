import { EngineError, compareStrings, createLineIndex, type RawDiagnostic, type RawSeverity } from '@misaon/slop-gate-core'
import { ruleByCategory } from './rules.ts'

type BiomePosition = { line: number; column: number }
type BiomeAdvice = { start?: BiomePosition; end?: BiomePosition; text?: string }
type BiomeDiagnostic = {
  severity: string
  message: string
  /** `lint/<group>/<rule>` for a rule finding, `parse` for a syntax error, bare `lint` for the oversize warning. */
  category: string
  location?: { path?: string; start?: BiomePosition; end?: BiomePosition }
  advices?: BiomeAdvice[]
}
type BiomeSummary = { unchanged?: number; skipped?: number; diagnosticsNotPrinted?: number }
type BiomeReport = { summary?: BiomeSummary; diagnostics?: BiomeDiagnostic[] }

/**
 * The synthetic rule id for a stylesheet Biome could not parse.
 *
 * Deliberately **not** `correctness.parse-error`, the concept oxlint and the schema engine share.
 * That concept means "this file is broken"; this one means "this file was not analysed", and on real
 * input the difference is the whole finding. All 125 parse errors across 1729 production stylesheets
 * came from 26 `.css` files that are not plain CSS at all — zulip's PostCSS `$variables` and
 * `%placeholder` selectors, pdf.js's Firefox-only `-moz-pref()` — every one of which compiles and
 * ships. Reporting those as broken CSS would be wrong 125 times out of 125.
 *
 * It is still reported, and it is in `recommended`, because the alternative is worse: a repository
 * whose stylesheets this engine cannot read would otherwise come back clean. One finding per file
 * rather than per error, at `warn`, saying what actually happened.
 */
export const CSS_PARSE_ERROR_RULE_ID = 'css-parse-error'

const PARSE_CATEGORY = 'parse'

/**
 * Biome's own reports *about* suppression comments — `suppressions/unused` when a `biome-ignore`
 * matches no diagnostic, and its siblings.
 *
 * Dropped, because `findForeignSuppressions` already reports every `biome-ignore` in the file,
 * used or unused, and these would double-report the subset Biome happens to notice. Note what they
 * do **not** provide, which is the thing that would have made the adapter's own scan unnecessary: a
 * suppression that *is* doing its job produces no diagnostic in this namespace or any other.
 */
const SUPPRESSION_CATEGORY_PREFIX = 'suppressions/'

/**
 * Biome's severity words. `information`/`hint` are not observed on CSS findings today — every CSS
 * rule reports `error` or `warning` — but they are in Biome's own vocabulary, and mapping them costs
 * two lines against silently widening every unrecognised severity to `warning`.
 */
const SEVERITIES: Readonly<Record<string, RawSeverity>> = {
  fatal: 'error',
  error: 'error',
  warning: 'warning',
  information: 'info',
  info: 'info',
  hint: 'advice',
}

export type ParseOptions = {
  /** The stylesheet's own text, for converting Biome's line/column into byte offsets. */
  read: (file: string) => string | undefined
  /**
   * The `engineRuleId`s the materialised config actually enabled. Biome's JSON carries no
   * `number_of_rules`, so there is nothing to compare a count against the way `engine-oxlint` does;
   * checking each finding against the selection is the same guard from the other end.
   */
  enabled: ReadonlySet<string>
  /**
   * How many files the batch handed to Biome. Compared against `summary.unchanged`, which is this
   * engine's only guard against a silently skipped file — see `parseBiomeOutput`.
   */
  expectedFileCount: number
}

/**
 * Parses `--reporter=json` output into raw diagnostics.
 *
 * **Byte offsets are computed here, because no Biome reporter emits them.** All nine give
 * `{line, column}` only — checked directly against json, json-pretty, sarif, rdjson, gitlab,
 * checkstyle, github, junit and concise — so the adapter converts, and it must convert with
 * `offsetAtCodepointColumn` rather than `offsetAt`: Biome counts columns in **Unicode codepoints**,
 * not the UTF-16 code units the rest of this codebase and every LSP-shaped tool use. Measured
 * against 2.5.6 with three astral characters ahead of a finding: expected UTF-16 column 28,
 * codepoint column 25, Biome reported 25. The two units agree on every input without an astral
 * character, which is exactly why the distinction has to be made explicitly rather than noticed.
 */
export function parseBiomeOutput(report: string, options: ParseOptions): RawDiagnostic[] {
  const trimmed = report.trim()
  if (trimmed === '') return []

  let parsed: BiomeReport
  try {
    parsed = JSON.parse(trimmed) as BiomeReport
  } catch (cause) {
    throw new EngineError('biome-css', `could not parse biome json output: ${trimmed.slice(0, 200)}`, { cause })
  }
  if (!Array.isArray(parsed.diagnostics)) {
    throw new EngineError('biome-css', 'biome json output has no diagnostics array')
  }

  // The silent-skip guard, and it has to be `unchanged` rather than the counter named for the job.
  // A file above `files.maxSize` (1 MiB by default) is not linted, and Biome says so by emitting a
  // warning whose `message` is the **empty string** at line 0 column 0 while leaving `summary.skipped`
  // at 0 — so the run looks clean and nothing distinguishes an unread file from a tidy one. `unchanged`
  // is the count of files actually processed and is the only field that moves. The adapter passes
  // `--files-max-size` well above any real stylesheet, so this firing means something else changed.
  const unchanged = parsed.summary?.unchanged ?? 0
  if (unchanged !== options.expectedFileCount) {
    throw new EngineError(
      'biome-css',
      `expected biome to check ${options.expectedFileCount} file(s), biome checked ${unchanged}. ` +
        'A file was skipped without being reported — check `files.maxSize` and the batch paths.',
    )
  }
  // `--max-diagnostics=none` lifts Biome's default cap of 20. If this is ever non-zero the cap is
  // back and the run is quietly under-reporting.
  const notPrinted = parsed.summary?.diagnosticsNotPrinted ?? 0
  if (notPrinted !== 0) {
    throw new EngineError('biome-css', `biome withheld ${notPrinted} diagnostic(s); --max-diagnostics=none is not taking effect`)
  }

  // Biome recovers from a syntax error and keeps linting the partial tree: the 26 unparseable corpus
  // files produced 986 further findings between them. Those describe a document Biome could not fully
  // read, so the file's rule findings are dropped and replaced by the single not-analysed report
  // below. Collected first because a finding earlier in the array may belong to a file whose parse
  // error appears later.
  const unparseable = new Map<string, BiomeDiagnostic>()
  for (const diagnostic of parsed.diagnostics) {
    if (diagnostic.category !== PARSE_CATEGORY) continue
    const file = toRepoRelative(diagnostic.location?.path)
    if (file !== undefined && !unparseable.has(file)) unparseable.set(file, diagnostic)
  }

  const indexes = new Map<string, ReturnType<typeof createLineIndex> | undefined>()
  const indexOf = (file: string) => {
    if (!indexes.has(file)) {
      const source = options.read(file)
      indexes.set(file, source === undefined ? undefined : createLineIndex(source))
    }
    return indexes.get(file)
  }

  const rangeFromCodepointLocation = (file: string, location: BiomeDiagnostic['location']) => {
    const index = indexOf(file)
    if (index === undefined || location?.start === undefined) return { start: 0, end: 0 }
    const start = index.offsetAtCodepointColumn(location.start)
    const end = location.end === undefined ? start : index.offsetAtCodepointColumn(location.end)
    return { start, end: Math.max(start, end) }
  }

  const results: RawDiagnostic[] = []
  for (const diagnostic of parsed.diagnostics) {
    if (diagnostic.category === PARSE_CATEGORY) continue
    if (diagnostic.category.startsWith(SUPPRESSION_CATEGORY_PREFIX)) continue
    // The oversize-file warning arrives as a bare `lint` category with an empty message. There is no
    // rule behind it and `ruleByCategory` already returns `undefined`, but the guard above is what
    // actually catches the condition; this only keeps it from reaching the unelected-rule error below.
    if (diagnostic.category === 'lint' && diagnostic.message === '') continue

    const file = toRepoRelative(diagnostic.location?.path)
    if (file === undefined || unparseable.has(file)) continue

    const rule = ruleByCategory(diagnostic.category)
    // A finding under a rule the config did not enable means the config is not selecting the elected
    // set — a preset key leaking rules in, an upgrade renaming one, or a stray `biome.json` Biome
    // decided to merge. Loud rather than dropped: silently discarding it would let an unelected rule
    // run on every file forever while `sgate rules` reported it off.
    if (rule === undefined || !options.enabled.has(rule.engineRuleId)) {
      throw new EngineError(
        'biome-css',
        `biome reported a finding under '${diagnostic.category}', which this run never enabled. ` +
          'The materialised config is not selecting exactly the elected ruleset.',
      )
    }

    const help = diagnostic.advices?.find((advice) => typeof advice.text === 'string' && advice.text !== '')?.text
    results.push({
      engineRuleId: rule.engineRuleId,
      message: diagnostic.message,
      severity: SEVERITIES[diagnostic.severity] ?? 'warning',
      file,
      range: rangeFromCodepointLocation(file, diagnostic.location),
      ...(help === undefined ? {} : { help }),
    })
  }

  for (const [file, first] of [...unparseable].sort(([a], [b]) => compareStrings(a, b))) {
    results.push({
      engineRuleId: CSS_PARSE_ERROR_RULE_ID,
      message:
        `This stylesheet was not analysed: biome could not parse it. First error: ${first.message} ` +
        'A `.css` file written for a preprocessor (PostCSS variables, `@extend`, browser-specific ' +
        'directives) is the usual cause, and is not a defect in the file.',
      severity: 'warning',
      file,
      range: rangeFromCodepointLocation(file, first.location),
    })
  }
  return results
}

function toRepoRelative(path: string | undefined): string | undefined {
  // Biome reports paths exactly as they were passed on argv, and the adapter passes repo-relative
  // ones with `cwd` set to the repository root — so unlike oxlint's absolute filenames there is
  // nothing to relativise here, only separators to normalise for Windows.
  return path === undefined ? undefined : path.replaceAll('\\', '/')
}
