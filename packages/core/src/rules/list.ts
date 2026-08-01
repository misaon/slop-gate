import picomatch from 'picomatch'
import { SLOP_GATE_SERVICED_CONCEPTS } from '../concepts/catalogue.ts'
import type { RuleLevel } from '../config/types.ts'
import type { EngineId, RuleRef } from '../registry/types.ts'
import { compareStrings } from '../ordering.ts'
import type { ResolvedRun } from '../run/resolve-run.ts'
import { resolveEnablement, type ConceptEnablement } from './enablement.ts'

export type RulesListEntry = {
  concept: string
  /** `concept`'s first dotted segment (`dead-code.unused-variable` → `dead-code`) — every concept
   *  id has one by construction (`concepts/validate.ts`), used to group the listing. */
  group: string
  /** Never `'off'`: only concepts `resolver.anyEnabledConcepts` contains are listed at all. */
  level: Exclude<RuleLevel, 'off'>
  owner: RuleRef | null
  servicedBySlopGate: boolean
  uncovered: boolean
  /**
   * True when `owner` is null for a reason *other* than a genuine coverage gap: this repository
   * simply contains no files in a language any candidate applies to (see `ElectionResult.uncovered`'s
   * own doc comment — the same distinction, read here rather than re-derived: an enabled,
   * non-serviced concept with no owner is uncovered unless this is set, and never both). Verified
   * running the real CLI on this repository: 173 of `recommended`'s 271 enabled concepts land here
   * — mostly JSX/Vue/accessibility rules a TypeScript CLI's own file set never exercises — and
   * rendering them as a bare "(no elected owner)" reads as a bug, not the expected, harmless gap it
   * actually is.
   */
  languageMismatch: boolean
  /** How many other candidates lost arbitration for this concept — `election.suppressed` entries
   *  naming it, not a boolean, so a listing can distinguish "one overlap" from "four". */
  suppressedCount: number
  enablement: ConceptEnablement
}

export type RulesListOptions = {
  /** A glob (picomatch, no special file-path handling) matched against `concept`. */
  only?: string
  /** Keep only concepts this run currently elects `engine` to own. */
  engine?: EngineId
  /** Keep only concepts with no elected owner. */
  uncoveredOnly?: boolean
}

/**
 * One row per concept `resolver.anyEnabledConcepts` contains — the effective ruleset spec §5.4
 * promises, not the full ~850-entry registry (most of which is either inapplicable here or not the
 * elected owner of anything). Filtering happens here, over the full list, rather than in the CLI
 * layer, so `--format json` and `--format pretty` are guaranteed to agree on which rows exist.
 */
export function buildRulesList(resolved: ResolvedRun, options: RulesListOptions = {}): RulesListEntry[] {
  const suppressedCounts = new Map<string, number>()
  for (const record of resolved.election.suppressed) {
    suppressedCounts.set(record.concept, (suppressedCounts.get(record.concept) ?? 0) + 1)
  }

  const isMatch = options.only === undefined ? null : picomatch(options.only)

  const entries: RulesListEntry[] = []
  for (const concept of resolved.resolver.anyEnabledConcepts) {
    if (isMatch !== null && !isMatch(concept)) continue
    const owner = resolved.election.owners.get(concept) ?? null
    if (options.engine !== undefined && owner?.engine !== options.engine) continue
    const uncovered = resolved.election.uncovered.includes(concept)
    if (options.uncoveredOnly === true && !uncovered) continue
    const servicedBySlopGate = SLOP_GATE_SERVICED_CONCEPTS.has(concept)

    entries.push({
      concept,
      group: concept.split('.')[0]!,
      level: resolved.resolver.maxLevelOf(concept) as Exclude<RuleLevel, 'off'>,
      owner,
      servicedBySlopGate,
      uncovered,
      // Necessarily the case whenever a non-serviced concept has no owner and is not uncovered:
      // `electOwners` only ever leaves both false when some candidate is fully capable (engine
      // participates, no missing capability, not deprecated) and fails solely on language — the
      // exact condition that keeps a concept out of `uncovered` in the first place.
      languageMismatch: owner === null && !uncovered && !servicedBySlopGate,
      suppressedCount: suppressedCounts.get(concept) ?? 0,
      enablement: resolveEnablement(resolved.resolver, concept),
    })
  }

  entries.sort((a, b) => compareStrings(a.concept, b.concept))
  return entries
}
