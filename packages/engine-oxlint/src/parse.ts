import { EngineError, toRepoRelative, type RawDiagnostic, type RawSeverity } from '@misaon/slop-gate-core'

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
  labels?: Array<{ label?: string; span: OxlintSpan }>
}
type OxlintPayload = { diagnostics?: OxlintDiagnostic[]; number_of_rules?: number }

const CODE_PATTERN = /^([a-z0-9-]+)\(([^)]+)\)$/

/**
 * The synthetic rule id the adapter assigns a code-less, error-severity diagnostic — oxlint's own shape for
 * "this file does not parse". Matched to the `oxlint/parse-error` entry in the registry
 * (packages/core/src/registry/entries.ts), which maps it to `correctness.parse-error`. Scoped to error
 * severity only: a code-less diagnostic at any other severity is unobserved behaviour today.
 */
export const PARSE_ERROR_RULE_ID = 'parse-error'

/**
 * Diagnostic scope → the scope `oxlint --rules` spells the same rule with, for the two plugins where the two
 * disagree on more than punctuation. The registry is generated from `--rules`, and `normalizeDiagnostics`
 * looks entries up by exact `engineRuleId`, dropping anything it cannot find — so without this every finding
 * from these plugins is silently discarded. Measured against oxlint 1.76.0 on five public Next.js
 * repositories: **389 `next(...)` findings, all dropped**, from 21 rules `recommended` holds at `error`.
 *
 * The mirror of the generator's `HYPHENATED_SCOPE` (`jsx_a11y` → `jsx-a11y`, `react_perf` → `react-perf`),
 * living here rather than there because these two cannot be fixed at generation time: oxlint's *config*
 * parser rejects `plugins: ["next"]` outright (*Unknown plugin: 'next'*), so `nextjs` is the only spelling
 * that can be written into a config while `next` is the only spelling that ever comes back out of a
 * diagnostic. `react-hooks` is accepted by both and mapped anyway, so one table holds every case. Complete,
 * not guessed: across two large monorepos with all seven categories enabled, these are the only two `code`
 * prefixes with no counterpart in `--rules`.
 */
const CATALOGUE_SCOPE: Readonly<Record<string, string>> = {
  next: 'nextjs',
  'react-hooks': 'react',
}

/** oxlint's core rules are configured bare; plugin rules are configured as `plugin/rule`. */
export function toEngineRuleId(code: string): string | null {
  const match = CODE_PATTERN.exec(code)
  if (match === null) return null
  const [, plugin, rule] = match
  if (plugin === 'eslint') return rule!
  return `${CATALOGUE_SCOPE[plugin!] ?? plugin}/${rule}`
}

/**
 * engineRuleId → the text of the label that marks the **offending** node, for the rules where that is not
 * the first label oxlint emits.
 *
 * A diagnostic's range is what everything downstream anchors to: the position a reporter prints, and —
 * through `normalizedWindow` — the fingerprint a baseline is keyed on (spec §10.1). Anchoring on a node the
 * finding is merely *about* therefore costs more than a misleading line number: the fingerprint then tracks
 * a line the user has no reason to touch, and two findings sharing one enclosing scope collapse onto the
 * same window, distinguishable only by `occurrenceIndex` — so adding a third shifts the other two and churns
 * the baseline.
 *
 * `unicorn/consistent-function-scoping` is the case. It emits `Outer scope where this function is defined`
 * first whenever the enclosing scope is nameable, and the offending inner function second; oxlint's own
 * `json`, `unix`, `github` and `checkstyle` reporters all print the first label's position, and its
 * `default` (graphical) reporter prints the second.
 *
 * **Additive by construction**, which is the whole point of the shape: a rule absent from this table keeps
 * `labels[0]`, and a rule *in* it whose declared text is not among the labels — an oxc reword — falls back
 * to `labels[0]` too, so the blast radius is exactly the rules named here. Keyed on the label *text* rather
 * than on an index because oxlint's label array is not sorted by offset (`eslint/no-duplicate-imports` emits
 * 4:40 before 3:31), so an index would be a bet on an ordering nothing upstream promises.
 *
 * Measured over this repository with `-D all` and all eleven plugins: of 453 multi-label diagnostics across
 * eight rules, **the first label is the offending node in all eight**. Both index-free heuristics were
 * rejected on that set — "take the last label" moves all 453, "take the narrowest span" moves 234.
 */
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

  // oxlint can print a plain-text preamble before the JSON — notably `No files found to lint.` when a batch
  // path no longer exists, which is routine in a caching linter. Parsing from the first brace keeps a
  // vanished file from destroying the whole batch under a misdiagnosing error.
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
  // otherwise-silent failures loud: a category we forgot to disable leaking rules in (count too high), and
  // an elected rule oxlint never activated (count too low).
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
    // Dropping a code-less diagnostic silently would mean a file that fails to parse produces zero
    // diagnostics and is then cached as clean. See PARSE_ERROR_RULE_ID.
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
