import { createLineIndex, EngineError, toPosix, type ByteRange, type RawDiagnostic } from '@misaon/slop-gate-core'
import { EMBEDDED_SHELLCHECK_PREFIX, SOURCE_EXCLUSIONS } from './rules.ts'

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
  readonly readSource: (relativePath: string) => string | undefined
  readonly absolutePrefixes: readonly string[]
}

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
      severity: 'error',
      file,
      range: instructionKeywordRange(finding, source),
    })
  }
  return diagnostics
}

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

export function stripPrefixes(file: string, absolutePrefixes: readonly string[]): string {
  const posix = toPosix(file)
  for (const prefix of [...absolutePrefixes].filter((p) => p !== '').sort((a, b) => b.length - a.length)) {
    const root = toPosix(prefix)
    const withSlash = root.endsWith('/') ? root : `${root}/`
    if (posix.startsWith(withSlash)) return posix.slice(withSlash.length)
  }
  return posix
}

