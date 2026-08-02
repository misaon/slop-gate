import { createLineIndex, EngineError, type ByteRange, type RawDiagnostic } from '@misaon/slop-gate-core'
import { DISABLED_INTEGRATION_RULES, MESSAGE_EXCLUSIONS, MESSAGE_REWRITES } from './rules.ts'

/** One element of `actionlint -format '{{json .}}'`. Field names are actionlint's own. */
export type ActionlintError = {
  readonly message: string
  readonly filepath: string
  readonly line: number
  readonly column: number
  readonly kind: string
  readonly end_column?: number
  readonly snippet?: string
}

export type ParseActionlintOptions = {
  /** Absolute paths stripped out of messages, longest first. Always includes the run's root. */
  readonly absolutePrefixes: readonly string[]
  readonly enabled: (engineRuleId: string) => boolean
  /** The file's text, or `undefined` if it could not be read. Only called for files with findings. */
  readonly readSource: (relativePath: string) => string | undefined
}

const encoder = new TextEncoder()

/**
 * `actionlint -format '{{json .}}'` output as a list. Separate from `parseActionlintOutput` because
 * the caller needs the file names before it can supply their text: `rangeOf` works on source, and
 * only the files that actually produced a finding are worth reading.
 *
 * Clean output is the empty string rather than `[]` when no file was linted, so an empty document is
 * no findings, not a malformed one.
 */
export function readActionlintErrors(stdout: string): readonly ActionlintError[] {
  const trimmed = stdout.trim()
  if (trimmed === '') return []
  try {
    return JSON.parse(trimmed) as readonly ActionlintError[]
  } catch (error) {
    throw new EngineError('actionlint', `could not parse actionlint JSON output: ${String(error)}`, { cause: error })
  }
}

export function parseActionlintOutput(
  errors: readonly ActionlintError[],
  options: ParseActionlintOptions,
): RawDiagnostic[] {
  const diagnostics: RawDiagnostic[] = []
  for (const error of errors) {
    if (DISABLED_INTEGRATION_RULES.includes(error.kind)) {
      throw new EngineError(
        'actionlint',
        `actionlint reported a \`${error.kind}\` finding, which means \`-${error.kind}=\` stopped disabling that ` +
          'integration. Findings from a second tool would arrive with no registry entry, no concept and nothing ' +
          'able to explain them, and would appear or vanish depending on whether that tool happens to be installed.',
      )
    }
    // Unelected rules — and any rule a newer actionlint has grown that this registry does not know —
    // are dropped here. actionlint cannot be asked for a subset, so this is the only place selection
    // can happen; see `ACTIONLINT_RULES`.
    if (!options.enabled(error.kind)) continue
    if (MESSAGE_EXCLUSIONS.some((exclusion) => exclusion.engineRuleId === error.kind && exclusion.pattern.test(error.message))) {
      continue
    }

    const file = toPosix(error.filepath)
    const source = options.readSource(file)
    diagnostics.push({
      engineRuleId: error.kind,
      message: rewrite(error.kind, sanitize(error.message, options.absolutePrefixes)),
      // actionlint has no severity of its own: every check it makes is reported the same way, and the
      // registry's `severityDefault` is the only thing that decides how a finding is shown.
      severity: 'error',
      file,
      range: rangeOf(error, source),
    })
  }
  return diagnostics
}

/**
 * actionlint's `line`/`column` translated into a UTF-8 byte range.
 *
 * **`end_column` is deliberately not used, and it is wrong in two independent ways.** First the
 * units: `column` is a 1-based *byte* offset into the line — `getIndicator` slices with
 * `line[Column-1:]`, which is Go string indexing — while `end_column` is `len(indicator)`, and the
 * indicator is built from `runewidth.StringWidth`, i.e. *display columns*. They agree for ASCII,
 * which is why the discrepancy is invisible on almost every workflow, and diverge on any line with a
 * wide or multi-byte character before or inside the token: a CJK character is 2 display columns and
 * 3 bytes. Second, even on pure ASCII it is *inclusive* — measured against 1.7.12, an 11-character
 * token at `column: 23` reports `end_column: 33` — so using it as an exclusive end is off by one as
 * well.
 *
 * The end is therefore derived from the source instead, by the same rule actionlint's own indicator
 * uses: from the start byte, take everything up to the first space, tab or line break. That
 * reproduces the underline actionlint would have drawn, in bytes, for every input.
 *
 * `line: 0, column: 0` means "no position at all" rather than "the first character" — actionlint
 * emits it when a failure happens before any node has a location (the unresolved-anchor case the M0
 * follow-ups record). It maps to an empty range at the top of the file.
 */
export function rangeOf(error: Pick<ActionlintError, 'line' | 'column'>, source: string | undefined): ByteRange {
  if (source === undefined || error.line <= 0) return { start: 0, end: 0 }

  const index = createLineIndex(source)
  const lineRange = index.rangeOfLine(error.line)
  const start = Math.min(lineRange.start + Math.max(error.column, 1) - 1, lineRange.end)
  const rest = index.sliceBytes({ start, end: lineRange.end })
  const stop = rest.search(/[ \t\r\n]/)
  const token = stop === -1 ? rest : rest.slice(0, stop)
  return { start, end: start + encoder.encode(token).length }
}

/**
 * Removes machine-specific absolute paths from a message.
 *
 * Not cosmetic: `RawDiagnostic.message` reaches fingerprints (§10.1), the cache key and the baseline,
 * so a message carrying `/Users/someone/project/...` makes all three machine-specific — two
 * developers checking out the same commit would compute different fingerprints for the same finding.
 * actionlint puts absolute paths in at least two messages today (`could not parse action metadata in
 * "…"`, `the action is defined at "…"`), and this strips by prefix rather than by known message so a
 * future one is covered without a code change.
 */
export function sanitize(message: string, absolutePrefixes: readonly string[]): string {
  let result = message
  for (const prefix of [...absolutePrefixes].filter((p) => p !== '').sort((a, b) => b.length - a.length)) {
    result = result.split(prefix).join('')
    result = result.split(toPosix(prefix)).join('')
  }
  // A stripped prefix leaves the separator that followed it: `"/root/x/y"` becomes `"/x/y"`.
  return result.replaceAll('"/', '"').replaceAll('"\\', '"')
}

function rewrite(engineRuleId: string, message: string): string {
  for (const candidate of MESSAGE_REWRITES) {
    if (candidate.engineRuleId !== engineRuleId) continue
    const match = message.match(candidate.pattern)
    if (match !== null) return candidate.rewrite(match)
  }
  return message
}

/** `RawDiagnostic.file` is repo-relative with POSIX separators; actionlint uses the host's. */
function toPosix(path: string): string {
  return path.replaceAll('\\', '/')
}
