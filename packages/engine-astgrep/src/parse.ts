import { EngineError, toRepoRelative, type RawDiagnostic, type RawSeverity } from '@misaon/slop-gate-core'

type AstGrepMatch = {
  ruleId?: string
  message?: string
  note?: string | null
  severity?: string
  file?: string
  range?: { byteOffset?: { start?: number; end?: number } }
  replacement?: string
  replacementOffsets?: { start?: number; end?: number }
}

const SEVERITIES: Readonly<Record<string, RawSeverity>> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  hint: 'advice',
}

export function parseAstGrepOutput(stdout: string, rootDir: string): RawDiagnostic[] {
  const trimmed = stdout.trim()
  if (trimmed === '') return []

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (cause) {
    throw new EngineError('astgrep', `could not parse ast-grep json output: ${trimmed.slice(0, 200)}`, { cause })
  }
  if (!Array.isArray(parsed)) {
    throw new EngineError('astgrep', `ast-grep json output is not an array: ${trimmed.slice(0, 200)}`)
  }

  const results: RawDiagnostic[] = []
  for (const match of parsed as AstGrepMatch[]) {
    const start = match.range?.byteOffset?.start
    const end = match.range?.byteOffset?.end
    if (match.ruleId === undefined || match.file === undefined || start === undefined || end === undefined) continue

    results.push({
      engineRuleId: match.ruleId,
      message: match.message ?? match.ruleId,
      severity: SEVERITIES[match.severity ?? ''] ?? 'warning',
      file: toRepoRelative(match.file, rootDir),
      range: { start, end },
      ...(match.note === undefined || match.note === null ? {} : { help: match.note }),
      ...fixOf(match),
    })
  }
  return results
}

function fixOf(match: AstGrepMatch): { fix: { edits: { range: { start: number; end: number }; replacement: string }[] } } | Record<string, never> {
  const start = match.replacementOffsets?.start
  const end = match.replacementOffsets?.end
  if (match.replacement === undefined || start === undefined || end === undefined) return {}
  return { fix: { edits: [{ range: { start, end }, replacement: match.replacement }] } }
}

