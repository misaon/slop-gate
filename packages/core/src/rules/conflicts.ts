import type { SuppressionRecord } from '../registry/elect.ts'
import type { ResolvedRun } from '../run/resolve-run.ts'

export type RulesConflicts = {
  /** One record per losing candidate — `election.suppressed`, unchanged. A concept with more than
   *  one loser (three or more candidates contesting it) appears here more than once, by design: a
   *  reader wants the reason for *each* suppressed rule, not a pre-grouped summary that hides how
   *  many there were. */
  suppressed: readonly SuppressionRecord[]
  /** `resolver.base.unknownKeys` — a config key that names neither a concept nor a rule any
   *  participating engine provides ("dead overrides", spec §5.4). */
  deadOverrides: readonly string[]
}

/**
 * Almost a pure formatter: every field here is already sitting on the resolved run, computed once
 * by config resolution and arbitration. Kept as its own function (rather than having the CLI reach
 * into `resolved.election`/`resolved.resolver` directly) so the two-field shape `rules conflicts`
 * renders is named and versioned in one place, the same way `RulesListEntry`/`ConceptWhy` are.
 */
export function buildRulesConflicts(resolved: ResolvedRun): RulesConflicts {
  return {
    suppressed: resolved.election.suppressed,
    deadOverrides: resolved.resolver.base.unknownKeys,
  }
}
