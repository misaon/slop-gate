import { isConceptId, SLOP_GATE_SERVICED_CONCEPTS } from '../concepts/catalogue.ts'
import type { IneligibleCandidate, SuppressionRecord } from '../registry/elect.ts'
import type { EngineId, RuleEntry, RuleRef } from '../registry/types.ts'
import type { ResolvedRun } from '../run/resolve-run.ts'
import { resolveEnablement, type ConceptEnablement } from './enablement.ts'

export type ConceptWhy = {
  concept: string
  /** False for a typo or a concept id this catalogue has never heard of — every other field is
   *  still populated (all empty/false), so a renderer can still say something coherent, but the
   *  caller should lead with this. */
  isKnownConcept: boolean
  /** True for a concept the orchestrator emits itself (e.g. `config.rule-overlap`) — no `RuleEntry`
   *  will ever claim it, and arbitration never runs for it at all. */
  servicedBySlopGate: boolean
  enablement: ConceptEnablement
  pinnedOwner: EngineId | undefined
  /** Every registry entry that declares this concept, applicable or not — the full candidate set
   *  `owner`/`suppressed`/`ineligible` below are each a partition of. */
  candidates: readonly RuleEntry[]
  owner: RuleRef | undefined
  suppressed: readonly SuppressionRecord[]
  ineligible: readonly IneligibleCandidate[]
  uncovered: boolean
}

/**
 * Assembles a full explanation for one concept from an already-resolved run — every field is a
 * lookup or a filter over `resolved.resolver`/`resolved.election`/`resolved.entries`, never a
 * re-derivation of arbitration. That is deliberate: a `why` that reimplemented election to explain
 * it would drift from the real thing the moment the two diverged, and then it would confidently
 * lie. If a question this function is asked to answer turns out not to be answerable from
 * `resolved` alone, the fix is to widen what `resolveRun`/`electOwners` record, not to compute a
 * second opinion here.
 */
export function explainConcept(concept: string, resolved: ResolvedRun): ConceptWhy {
  const { resolver, election, entries } = resolved
  return {
    concept,
    isKnownConcept: isConceptId(concept),
    servicedBySlopGate: SLOP_GATE_SERVICED_CONCEPTS.has(concept),
    enablement: resolveEnablement(resolver, concept),
    pinnedOwner: resolver.base.pinnedOwners[concept],
    candidates: entries.filter((entry) => entry.concepts.includes(concept as never)),
    owner: election.owners.get(concept),
    suppressed: election.suppressed.filter((record) => record.concept === concept),
    ineligible: election.ineligible.filter((record) => record.concept === concept),
    uncovered: election.uncovered.includes(concept),
  }
}
