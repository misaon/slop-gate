import type { RuleOverlap } from '../registry/elect.ts'
import type { ResolvedRun } from '../run/resolve-run.ts'

export type RulesConflicts = {
  overlaps: readonly RuleOverlap[]
  deadOverrides: readonly string[]
}

export function buildRulesConflicts(resolved: ResolvedRun): RulesConflicts {
  return {
    overlaps: resolved.election.overlaps,
    deadOverrides: resolved.resolver.base.unknownKeys,
  }
}
