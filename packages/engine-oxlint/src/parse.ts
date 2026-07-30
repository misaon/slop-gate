import { relative } from 'node:path'
import { EngineError, type RawDiagnostic, type RawSeverity } from '@misaon/slop-gate-core'

type OxlintSpan = { offset: number; length: number }
type OxlintDiagnostic = {
  message: string
  code: string
  severity: string
  url?: string
  help?: string
  filename: string
  labels?: Array<{ span: OxlintSpan }>
}

const CODE_PATTERN = /^([a-z0-9-]+)\(([^)]+)\)$/

/** oxlint's core rules are configured bare; plugin rules are configured as `plugin/rule`. */
export function toEngineRuleId(code: string): string | null {
  const match = CODE_PATTERN.exec(code)
  if (match === null) return null
  const [, plugin, rule] = match
  return plugin === 'eslint' ? rule! : `${plugin}/${rule}`
}

const SEVERITIES: Readonly<Record<string, RawSeverity>> = {
  error: 'error',
  warning: 'warning',
  warn: 'warning',
  advice: 'advice',
  info: 'info',
}

export function parseOxlintOutput(stdout: string, rootDir: string): RawDiagnostic[] {
  const trimmed = stdout.trim()
  if (trimmed === '') return []

  let parsed: { diagnostics?: OxlintDiagnostic[] }
  try {
    parsed = JSON.parse(trimmed) as { diagnostics?: OxlintDiagnostic[] }
  } catch (cause) {
    throw new EngineError('oxlint', `could not parse oxlint json output: ${trimmed.slice(0, 200)}`, { cause })
  }
  if (!Array.isArray(parsed.diagnostics)) {
    throw new EngineError('oxlint', 'oxlint json output has no diagnostics array')
  }

  const results: RawDiagnostic[] = []
  for (const diagnostic of parsed.diagnostics) {
    const span = diagnostic.labels?.[0]?.span
    const engineRuleId = toEngineRuleId(diagnostic.code)
    if (span === undefined || engineRuleId === null) continue

    results.push({
      engineRuleId,
      message: diagnostic.message,
      severity: SEVERITIES[diagnostic.severity] ?? 'warning',
      file: toRepoRelative(diagnostic.filename, rootDir),
      range: { start: span.offset, end: span.offset + span.length },
      ...(diagnostic.help === undefined ? {} : { help: diagnostic.help }),
      ...(diagnostic.url === undefined ? {} : { docsUrl: diagnostic.url }),
    })
  }
  return results
}

function toRepoRelative(filename: string, rootDir: string): string {
  const normalized = filename.replaceAll('\\', '/')
  const root = rootDir.replaceAll('\\', '/')
  if (!normalized.startsWith('/') && !/^[a-z]:\//i.test(normalized)) return normalized
  return relative(root, normalized).replaceAll('\\', '/')
}
