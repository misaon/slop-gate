import { relative } from 'node:path'
import { EngineError, type RawDiagnostic, type RawSeverity } from '@misaon/slop-gate-core'

type OxlintSpan = { offset: number; length: number }
type OxlintDiagnostic = {
  message: string
  // Absent, not just unparseable, for a parse error: oxlint reports a syntax error as a diagnostic
  // like every other, but with no `code` at all — there is no rule to name.
  code?: string
  severity: string
  url?: string
  help?: string
  filename: string
  labels?: Array<{ span: OxlintSpan }>
}
type OxlintPayload = { diagnostics?: OxlintDiagnostic[]; number_of_rules?: number }

const CODE_PATTERN = /^([a-z0-9-]+)\(([^)]+)\)$/

/**
 * The synthetic rule id the adapter assigns a code-less, error-severity diagnostic — oxlint's own
 * shape for "this file does not parse". Matched to the `oxlint/parse-error` entry in the registry
 * (packages/core/src/registry/entries.ts), which maps it to `correctness.parse-error`. Scoped to
 * error severity only: a code-less diagnostic at any other severity is unobserved behaviour today,
 * so it is left alone rather than guessed at.
 */
export const PARSE_ERROR_RULE_ID = 'parse-error'

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

export function parseOxlintOutput(
  stdout: string,
  rootDir: string,
  expected?: { ruleCount: number },
): RawDiagnostic[] {
  const trimmed = stdout.trim()
  if (trimmed === '') return []

  // oxlint can print a plain-text preamble before the JSON — notably `No files found to lint.`
  // when a batch path no longer exists, which is routine in a caching linter. Parsing from the
  // first brace keeps a vanished file from destroying the whole batch under a misdiagnosing error.
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

  // Every payload reports how many rules actually ran. Comparing it to the elected count turns two
  // otherwise-silent failures loud: a category we forgot to disable leaking rules in (count too
  // high), and an elected rule oxlint never activated (count too low).
  if (expected !== undefined && parsed.number_of_rules !== expected.ruleCount) {
    throw new EngineError(
      'oxlint',
      `expected ${expected.ruleCount} rule(s) to run, oxlint ran ${parsed.number_of_rules}. ` +
        `The materialised config is not selecting exactly the elected ruleset.`,
    )
  }

  const results: RawDiagnostic[] = []
  for (const diagnostic of parsed.diagnostics) {
    const span = diagnostic.labels?.[0]?.span
    if (span === undefined) continue

    const severity = SEVERITIES[diagnostic.severity] ?? 'warning'
    // A parse error has no rule to name, so `code` is absent rather than unparseable. Dropping it
    // silently (the pre-existing behaviour for `toEngineRuleId(undefined)`) means a file that fails
    // to parse produces zero diagnostics and is then cached as clean. See PARSE_ERROR_RULE_ID.
    const engineRuleId =
      diagnostic.code === undefined
        ? severity === 'error'
          ? PARSE_ERROR_RULE_ID
          : null
        : toEngineRuleId(diagnostic.code)
    if (engineRuleId === null) continue

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

function toRepoRelative(filename: string, rootDir: string): string {
  const normalized = filename.replaceAll('\\', '/')
  const root = rootDir.replaceAll('\\', '/')
  if (!normalized.startsWith('/') && !/^[a-z]:\//i.test(normalized)) return normalized
  return relative(root, normalized).replaceAll('\\', '/')
}
