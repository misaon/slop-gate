import { createLineIndex, EngineError, toPosix, type ByteRange, type RawDiagnostic } from '@misaon/slop-gate-core'
import { EMBEDDED_SHELLCHECK_PREFIX, SOURCE_EXCLUSIONS } from './rules.ts'

/** One element of `hadolint -f json`. Field names are hadolint's own. */
export type HadolintFinding = {
  readonly code: string
  readonly file: string
  readonly line: number
  readonly column: number
  readonly level: string
  readonly message: string
}

export type ParseHadolintOptions = {
  readonly enabled: (engineRuleId: string) => boolean
  /** The file's text, or `undefined` if it could not be read. Only called for files with findings. */
  readonly readSource: (relativePath: string) => string | undefined
  /** Absolute paths stripped from `file`, longest first. */
  readonly absolutePrefixes: readonly string[]
}

/**
 * `hadolint -f json` output as a list. A clean run prints `[]` with no trailing newline; a run over zero
 * files prints nothing at all. Both are no findings rather than malformed output.
 */
export function readHadolintFindings(stdout: string): readonly HadolintFinding[] {
  const trimmed = stdout.trim()
  if (trimmed === '') return []
  try {
    return JSON.parse(trimmed) as readonly HadolintFinding[]
  } catch (error) {
    throw new EngineError('hadolint', `could not parse hadolint JSON output: ${String(error)}`, { cause: error })
  }
}

export function parseHadolintOutput(findings: readonly HadolintFinding[], options: ParseHadolintOptions): RawDiagnostic[] {
  const diagnostics: RawDiagnostic[] = []
  for (const finding of findings) {
    // hadolint's statically linked ShellCheck reports `SC####` for shell inside `RUN`. Dropped before the
    // selection check so the reason is one place rather than an absence — see rules.ts for the two
    // grounds (empty error tier, instruction-head positions).
    if (finding.code.startsWith(EMBEDDED_SHELLCHECK_PREFIX)) continue
    if (!options.enabled(finding.code)) continue

    const file = stripPrefixes(finding.file, options.absolutePrefixes)
    const source = options.readSource(file)
    if (SOURCE_EXCLUSIONS.some((exclusion) => exclusion.engineRuleId === finding.code && exclusion.matches(lineAt(source, finding.line)))) {
      continue
    }

    diagnostics.push({
      engineRuleId: finding.code,
      message: finding.message,
      // hadolint's own `level` is deliberately not mapped: its tiers do not track defect density —
      // `DL3020` is `error` and measured zero true positives across 275 files, while `DL4006` at
      // `warning` measured 78 — so the registry's `severityDefault` decides how a finding is shown.
      severity: 'error',
      file,
      range: instructionKeywordRange(finding, source),
    })
  }
  return diagnostics
}

/**
 * **`column` is not used, because hadolint does not populate it.** It is `1` in all 893 findings of the
 * 275-file corpus measurement, and the JSON carries no `endLine` or `endColumn` at all — every hadolint
 * position is a line reference and nothing more. So rather than a zero-width range at column 1, the range
 * covers the leading instruction token (`FROM`, `RUN`, `CMD`).
 *
 * Sound for the rules that ship, all of which are instruction-level by nature. *Not* sound for shell
 * inside `RUN`, where the offending line can be fifty lines below the instruction head — one of the two
 * reasons those findings are dropped entirely.
 */
export function instructionKeywordRange(finding: Pick<HadolintFinding, 'line'>, source: string | undefined): ByteRange {
  if (source === undefined || finding.line <= 0) return { start: 0, end: 0 }

  const index = createLineIndex(source)
  const lineRange = index.rangeOfLine(finding.line)
  const text = index.sliceBytes(lineRange)
  const leading = text.length - text.trimStart().length
  const start = lineRange.start + byteLength(text.slice(0, leading))
  const keyword = text.trimStart().split(/[ \t]/, 1)[0] ?? ''
  return { start, end: start + byteLength(keyword) }
}

const encoder = new TextEncoder()

function byteLength(value: string): number {
  return encoder.encode(value).length
}

function lineAt(source: string | undefined, line: number): string {
  if (source === undefined || line <= 0) return ''
  return source.split('\n')[line - 1] ?? ''
}

/**
 * hadolint echoes back whatever path it was handed, and it is handed absolute ones so that a batch
 * spanning directories is unambiguous. `RawDiagnostic.file` has to be repo-relative: the message and path
 * reach fingerprints (§10.1), the cache key and the baseline, so an absolute path would make all three
 * machine-specific.
 *
 * **Exported because `index.ts` needs the identical answer**, not a second implementation: it pre-reads
 * every file with a finding into a map keyed by this path, and `readSource` looks the text up by the path
 * this parser computes. Two spellings that agree today would, on drifting, make every lookup miss —
 * silently collapsing every hadolint finding to `{start:0,end:0}` and churning every baseline fingerprint.
 */
export function stripPrefixes(file: string, absolutePrefixes: readonly string[]): string {
  const posix = toPosix(file)
  for (const prefix of [...absolutePrefixes].filter((p) => p !== '').sort((a, b) => b.length - a.length)) {
    const root = toPosix(prefix)
    const withSlash = root.endsWith('/') ? root : `${root}/`
    if (posix.startsWith(withSlash)) return posix.slice(withSlash.length)
  }
  return posix
}

