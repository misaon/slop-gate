import { EngineError, toRepoRelative, type RawDiagnostic, type RawSeverity } from '@misaon/slop-gate-core'

type OxlintSpan = { offset: number; length: number }
type OxlintDiagnostic = {
  message: string
  code?: string
  severity: string
  url?: string
  help?: string
  filename: string
  labels?: Array<{ label?: string; span: OxlintSpan }>
}
type OxlintPayload = { diagnostics?: OxlintDiagnostic[]; number_of_rules?: number }

const CODE_PATTERN = /^([a-z0-9-]+)\(([^)]+)\)$/

export const PARSE_ERROR_RULE_ID = 'parse-error'

const CATALOGUE_SCOPE: Readonly<Record<string, string>> = {
  next: 'nextjs',
  'react-hooks': 'react',
}

export function toEngineRuleId(code: string): string | null {
  const match = CODE_PATTERN.exec(code)
  if (match === null) return null
  const [, plugin, rule] = match
  if (plugin === 'eslint') return rule!
  return `${CATALOGUE_SCOPE[plugin!] ?? plugin}/${rule}`
}

export const ANCHOR_LABELS: Readonly<Record<string, string>> = {
  'unicorn/consistent-function-scoping': 'This function does not use any variables from the parent function',
}

const SEVERITIES: Readonly<Record<string, RawSeverity>> = {
  error: 'error',
  warning: 'warning',
  warn: 'warning',
  advice: 'advice',
  info: 'info',
}

export function parseOxlintOutput(
  stdout: string,
  rootDir: string,
  expected?: { ruleCount: number },
): RawDiagnostic[] {
  const trimmed = stdout.trim()
  if (trimmed === '') return []

  const jsonStart = trimmed.indexOf('{')
  if (jsonStart === -1) {
    throw new EngineError('oxlint', `oxlint produced no json output: ${trimmed.slice(0, 200)}`)
  }

  let parsed: OxlintPayload
  try {
    parsed = JSON.parse(trimmed.slice(jsonStart)) as OxlintPayload
  } catch (cause) {
    throw new EngineError('oxlint', `could not parse oxlint json output: ${trimmed.slice(0, 200)}`, { cause })
  }
  if (!Array.isArray(parsed.diagnostics)) {
    throw new EngineError('oxlint', 'oxlint json output has no diagnostics array')
  }

  if (expected !== undefined && parsed.number_of_rules !== expected.ruleCount) {
    throw new EngineError(
      'oxlint',
      `expected ${expected.ruleCount} rule(s) to run, oxlint ran ${parsed.number_of_rules}. ` +
        `The materialised config is not selecting exactly the elected ruleset.`,
    )
  }

  const results: RawDiagnostic[] = []
  for (const diagnostic of parsed.diagnostics) {
    const severity = SEVERITIES[diagnostic.severity] ?? 'warning'
    const engineRuleId =
      diagnostic.code === undefined
        ? severity === 'error'
          ? PARSE_ERROR_RULE_ID
          : null
        : toEngineRuleId(diagnostic.code)
    if (engineRuleId === null) continue

    const span = anchorSpan(diagnostic, engineRuleId)
    if (span === undefined) continue

    results.push({
      engineRuleId,
      message: diagnostic.message,
      severity,
      file: toRepoRelative(diagnostic.filename, rootDir),
      range: { start: span.offset, end: span.offset + span.length },
      ...(diagnostic.help === undefined ? {} : { help: diagnostic.help }),
      ...(diagnostic.url === undefined ? {} : { docsUrl: diagnostic.url }),
    })
  }
  return results
}

function anchorSpan(diagnostic: OxlintDiagnostic, engineRuleId: string): OxlintSpan | undefined {
  const wanted = ANCHOR_LABELS[engineRuleId]
  if (wanted !== undefined) {
    const declared = diagnostic.labels?.find((label) => label.label === wanted)
    if (declared !== undefined) return declared.span
  }
  return diagnostic.labels?.[0]?.span
}
