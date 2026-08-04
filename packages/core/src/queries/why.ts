import { isConceptId, SLOP_GATE_SERVICED_CONCEPTS, type ConceptId } from '../concepts/catalogue.ts'
import type { RuleLevel } from '../config/types.ts'
import type {
  EnabledLevel,
  FrameworkEvidence,
  FrameworkId,
  FrameworkMeasurement,
  InapplicableFramework,
} from '../frameworks/types.ts'
import type { ConceptOwnership, DisplacedOwner, IneligibleCandidate, RuleOverlap } from '../registry/elect.ts'
import type { EngineId, RuleEntry } from '../registry/types.ts'
import type { ResolvedRun } from '../run/resolve-run.ts'
import { resolveEnablement, type ConceptEnablement } from './enablement.ts'

export type ConceptWhy = {
  concept: string
  isKnownConcept: boolean
  servicedBySlopGate: boolean
  enablement: ConceptEnablement
  pinnedOwner: EngineId | undefined
  candidates: readonly RuleEntry[]
  ownership: readonly ConceptOwnership[]
  overlaps: readonly RuleOverlap[]
  ineligible: readonly IneligibleCandidate[]
  displaced: readonly DisplacedOwner[]
  uncovered: boolean
  frameworks: readonly FrameworkReason[]
  rejectedFrameworkAdditions: readonly RejectedFrameworkAddition[]
  inapplicableFrameworks: readonly InapplicableFramework[]
}

type FrameworkReason = {
  id: FrameworkId
  summary: string
  reason: string
  setting: RuleLevel
  paths?: readonly string[]
  measured?: FrameworkMeasurement
  evidence: readonly FrameworkEvidence[]
}

type RejectedFrameworkAddition = {
  id: FrameworkId
  level: EnabledLevel
  refusal: string
}

export function explainConcept(concept: string, resolved: ResolvedRun): ConceptWhy {
  const { resolver, election, entries, frameworks } = resolved
  return {
    frameworks: frameworks.applied.flatMap((application) =>
      application.adjustments.flatMap((adjustment) => {
        if (adjustment.kind === 'engine-setting' || adjustment.concept !== concept) return []
        return [
          {
            id: application.id,
            summary: application.summary,
            reason: adjustment.reason,
            setting: adjustment.kind === 'disable-concept' ? ('off' as const) : adjustment.level,
            ...(adjustment.paths === undefined ? {} : { paths: adjustment.paths }),
            ...(adjustment.kind === 'enable-concept' ? { measured: adjustment.measured } : {}),
            evidence: application.evidence,
          },
        ]
      }),
    ),
    rejectedFrameworkAdditions: frameworks.applied.flatMap((application) =>
      application.rejected
        .filter((rejection) => rejection.concept === concept)
        .map((rejection) => ({ id: application.id, level: rejection.level, refusal: rejection.refusal })),
    ),
    inapplicableFrameworks: frameworks.inapplicable,
    concept,
    isKnownConcept: isConceptId(concept),
    servicedBySlopGate: SLOP_GATE_SERVICED_CONCEPTS.has(concept),
    enablement: resolveEnablement(resolver, concept),
    pinnedOwner: resolver.base.pinnedOwners[concept],
    candidates: entries.filter((entry) => entry.concepts.includes(concept as ConceptId)),
    ownership: election.owners.get(concept) ?? [],
    overlaps: election.overlaps.filter((record) => record.concept === concept),
    ineligible: election.ineligible.filter((record) => record.concept === concept),
    displaced: election.displaced.filter((record) => record.concept === concept),
    uncovered: election.uncovered.includes(concept),
  }
}
