import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { createLineIndex, EngineError, type LineIndex, type RawDiagnostic, type RawSeverity } from '@misaon/slop-gate-core'

/**
 * The single synthetic engine rule id every `tsc` diagnostic is attributed to, regardless of its own
 * TS error code (TS2307, TS2322, ...). See the `tsc/type-error` entry in
 * `packages/core/src/registry/entries.manual.ts` for why one rule id — and one concept,
 * `types.type-error` — covers the whole domain rather than mapping each code to its own concept.
 */
export const TYPE_ERROR_RULE_ID = 'type-error'

/**
 * `tsc`'s plain-text (non-`--pretty`) diagnostic format, reverse-engineered against the real 5.9.3
 * binary rather than assumed (see `.superpowers/engine-tsc-report.md` for the full captured-output
 * log). Two shapes:
 *
 * - **Located**: `<file>(<line>,<column>): error TS<code>: <message>` — a real source position.
 * - **Global**: `error TS<code>: <message>` — no location at all. Observed for "the tsconfig itself
 *   could not be found or read" (TS5058, TS5057) and "the resolved tsconfig matches zero input files"
 *   (TS18003) — `tsc` could not productively check *anything* under this configuration, which is a
 *   different kind of failure than "here is a type error in one specific file". Since `RawDiagnostic.file`
 *   is a required, non-optional `string` (there is no file to attribute one of these to), a global
 *   diagnostic cannot become a `RawDiagnostic` at all — it is surfaced as an `EngineError` instead,
 *   the same way oxlint's own parser throws when it cannot find any parseable output.
 *
 * **A located diagnostic is not always one line.** Confirmed directly: `TS2769` (overload mismatch)
 * and other multi-candidate diagnostics continue onto further lines, each indented two or four spaces
 * with **no** `file(line,col):` prefix of their own — indentation is the only signal that a line
 * belongs to the diagnostic above it rather than starting a new one. Every line that does not match
 * either shape above is folded into the currently-open diagnostic's message, trimmed and newline-
 * joined; a line before any diagnostic has opened (stray banner/debug output, if anything ever writes
 * one to stdout) is silently ignored rather than thrown on — the caller only reaches this parser after
 * its own exit-code check already decided this was a legitimate run, not a crash.
 */
const LOCATED = /^(.*)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*)$/
const GLOBAL = /^(error|warning) (TS\d+): (.*)$/

const SEVERITIES: Readonly<Record<string, RawSeverity>> = { error: 'error', warning: 'warning' }

type OpenDiagnostic =
  | { kind: 'located'; file: string; line: number; column: number; code: string; severity: RawSeverity; messageLines: string[] }
  | { kind: 'global'; code: string; severity: RawSeverity; messageLines: string[] }

type LocatedDiagnostic = {
  file: string
  line: number
  column: number
  code: string
  severity: RawSeverity
  message: string
}

/**
 * Parses `tsc`'s plain-text stdout into `RawDiagnostic`s, reading each referenced file's own source
 * (relative to `rootDir`) to convert `tsc`'s 1-based (line, column) — already UTF-16 code units, spec
 * §10's own convention — into the byte offsets `RawDiagnostic.range` requires. This is the one thing
 * oxlint's parser never needs: oxlint hands back byte spans directly.
 *
 * `tsc`'s plain-text output carries no *length* for a diagnostic, only its starting position — unlike
 * oxlint's `{ offset, length }` span. `--pretty` mode's code frame does show an underline width, but
 * parsing two different tsc output shapes to reconcile one position is worse than the alternative:
 * every diagnostic here gets a deliberate one-character range at its reported column. Documented, not
 * hidden — a future improvement could shell out to `--pretty` as well purely to recover underline
 * widths, at the cost of a second invocation.
 *
 * @yields One `RawDiagnostic` per located diagnostic tsc reported, in the order tsc printed them.
 */
export async function* parseTscOutput(stdout: string, rootDir: string): AsyncGenerator<RawDiagnostic> {
  const trimmed = stdout.trim()
  if (trimmed === '') return

  const globals: string[] = []
  const located: LocatedDiagnostic[] = []
  let current: OpenDiagnostic | null = null

  const flush = (): void => {
    if (current === null) return
    const message = current.messageLines.join('\n')
    if (current.kind === 'global') {
      globals.push(`${current.code}: ${message}`)
    } else {
      located.push({
        file: current.file,
        line: current.line,
        column: current.column,
        code: current.code,
        severity: current.severity,
        message,
      })
    }
    current = null
  }

  for (const rawLine of stdout.split(/\r?\n/)) {
    if (rawLine.trim() === '') continue

    const locatedMatch = LOCATED.exec(rawLine)
    if (locatedMatch) {
      flush()
      const [, file, line, column, severityWord, code, message] = locatedMatch as unknown as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
      current = {
        kind: 'located',
        file: toRepoRelative(file, rootDir),
        line: Number(line),
        column: Number(column),
        code,
        severity: SEVERITIES[severityWord] ?? 'error',
        messageLines: [message],
      }
      continue
    }

    const globalMatch = GLOBAL.exec(rawLine)
    if (globalMatch) {
      flush()
      const [, severityWord, code, message] = globalMatch as unknown as [string, string, string, string]
      current = { kind: 'global', code, severity: SEVERITIES[severityWord] ?? 'error', messageLines: [message] }
      continue
    }

    if (current !== null) current.messageLines.push(rawLine.trim())
  }
  flush()

  if (globals.length > 0) {
    throw new EngineError('tsc', globals.join('\n'))
  }

  const lineIndexes = new Map<string, LineIndex>()
  const indexFor = async (file: string): Promise<LineIndex> => {
    const cached = lineIndexes.get(file)
    if (cached !== undefined) return cached
    const source = await readFile(join(rootDir, file), 'utf8')
    const index = createLineIndex(source)
    lineIndexes.set(file, index)
    return index
  }

  for (const diagnostic of located) {
    const index = await indexFor(diagnostic.file)
    const start = index.offsetAt({ line: diagnostic.line, column: diagnostic.column })
    const end = index.offsetAt({ line: diagnostic.line, column: diagnostic.column + 1 })

    yield {
      engineRuleId: TYPE_ERROR_RULE_ID,
      // The TS code is folded into the message, not dropped: there is nowhere else for it to go
      // (`RawDiagnostic` has no separate code field, unlike oxlint's rule ids), and keeping it is what
      // makes the reported message greppable against the identical text the user's own editor or CI
      // already shows for the same error.
      message: `${diagnostic.code}: ${diagnostic.message}`,
      severity: diagnostic.severity,
      file: diagnostic.file,
      range: { start, end },
    }
  }
}

/** Mirrors `engine-oxlint`'s own `toRepoRelative` (parse.ts): tsc reports paths relative to its own
 *  cwd when one is already relative (see resolve-binary.ts's caller, which always sets `cwd:
 *  context.rootDir`), so the common case is a plain passthrough; an absolute path (defensive — not
 *  observed in practice given that cwd convention, but cheap to handle) is converted the same way. */
function toRepoRelative(filename: string, rootDir: string): string {
  const normalized = filename.replaceAll('\\', '/')
  const root = rootDir.replaceAll('\\', '/')
  if (!normalized.startsWith('/') && !/^[a-z]:\//i.test(normalized)) return normalized
  return relative(root, normalized).replaceAll('\\', '/')
}
