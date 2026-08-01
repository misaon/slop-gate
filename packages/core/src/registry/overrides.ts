import type { ConceptId } from '../concepts/catalogue.ts'
import type { Severity } from '../diagnostics/types.ts'
import type { ClassifyRule } from './types.ts'

/**
 * A correction applied on top of the registry generator's mechanical default
 * (`concept = <oxlint category>.<kebab value>`, see `packages/core/scripts/generate-registry.ts`).
 *
 * Every field is optional: supply only what needs to differ from the mechanical value. The two
 * fields below are the ones that carry real judgement and cannot be derived from
 * `oxlint --rules --format json` alone —
 *
 * - `concepts` (with `classify` alongside it for a multi-concept rule): the whole point of a
 *   concept is that two rules detecting the same thing share one (see the design plan's decision
 *   2), and no mechanical scheme can know that in advance. This is also how a rule already tracked
 *   under a deliberately-chosen name — `no-dupe-keys` as `correctness.no-duplicate-object-key`,
 *   `no-eval` as `security.eval-usage` — keeps that name instead of reverting to the raw rule id.
 * - `severityDefault`: the mechanical default (`correctness` category → `error`, everything else →
 *   `warn`) is right for all but one seeded case (`no-unused-vars`, judged a hygiene issue rather
 *   than a certain bug despite being oxlint's `correctness` category).
 */
export type RuleOverride = {
  readonly concepts?: readonly ConceptId[]
  readonly classify?: readonly ClassifyRule[]
  readonly severityDefault?: Severity
}

/**
 * Keyed by the oxlint `engineRuleId` exactly as the generator derives it mechanically — bare value
 * for the `eslint` scope (`no-debugger`), `${scope}/${value}` otherwise (`typescript/no-explicit-any`),
 * with `jsx_a11y`/`react_perf` already hyphenated to `jsx-a11y`/`react-perf` (see the generator's
 * `engineRuleIdOf`, and the note above `HYPHENATED_SCOPE` there for why). That is the same string
 * that ends up as the generated `RuleEntry.engineRuleId`, so an override here always matches one
 * concrete generated entry — there is no separate raw-catalogue spelling to remember.
 *
 * Hand-authored, committed, and reviewed one entry at a time — this is where the human judgement
 * decision 2 describes actually lives. Populated in the registry-generation plan's Task 2.
 */
export const RULE_OVERRIDES: Readonly<Record<string, RuleOverride>> = {}
