import { isConceptId, SLOP_GATE_SERVICED_CONCEPTS } from '../concepts/catalogue.ts'
import type { RuleLevel } from '../config/types.ts'
import type {
  EnabledLevel,
  FrameworkEvidence,
  FrameworkId,
  FrameworkMeasurement,
  InapplicableFramework,
} from '../frameworks/types.ts'
import type { ConceptOwnership, DisplacedOwner, IneligibleCandidate, SuppressionRecord } from '../registry/elect.ts'
import type { EngineId, RuleEntry } from '../registry/types.ts'
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
  /**
   * Every rule owning this concept, with the languages each won. Usually one entry; more than one
   * means different engines own it for different languages, which is not a conflict — no file is
   * two languages. Empty means no owner, and `uncovered` says whether that is a real gap.
   */
  ownership: readonly ConceptOwnership[]
  suppressed: readonly SuppressionRecord[]
  ineligible: readonly IneligibleCandidate[]
  /**
   * Ownership an absent engine would have taken. Rendered as one extra line in the owners block —
   * the reader needs to know a better owner exists and is one install away, and needs it in the
   * same glance as the owners themselves.
   */
  displaced: readonly DisplacedOwner[]
  uncovered: boolean
  /**
   * Framework profiles with something to say about *this* concept, with the evidence behind each
   * (spec §23.4). `enablement.baseProvenance` already carries a `framework` step naming the profile;
   * this is what lets the renderer go from "off, because nestjs" to "off, because `@nestjs/core` is
   * declared in `package.json`" — the difference between a dead end and something the reader can act
   * on.
   *
   * Includes profiles that turned the concept *on*, and one whose setting lost the join to a louder
   * or quieter profile still appears here with the level it asked for: the reader comparing this
   * list against the provenance above is exactly how the precedence rule becomes checkable rather
   * than merely stated.
   */
  frameworks: readonly FrameworkReason[]
  /**
   * Additions refused for want of a measurement (`refuseEnable`). Empty for every shipped profile,
   * and surfaced anyway for the same reason `ignoredOverrideOptions` is: a profile that claims to
   * cover a concept and silently does not is the one failure a reader has no other way to see.
   */
  rejectedFrameworkAdditions: readonly RejectedFrameworkAddition[]
  /**
   * Profiles that were detected but stood down for want of a parameter. Not scoped to this concept —
   * a blocked profile has no adjustments to scope by, which is exactly the point: the user is seeing
   * the status-quo finding and deserves to be told which profile would have removed it and why it
   * could not.
   */
  inapplicableFrameworks: readonly InapplicableFramework[]
}

/** One framework's reason for its setting on one concept, joined to the evidence that detected it. */
type FrameworkReason = {
  id: FrameworkId
  summary: string
  reason: string
  /** `off` for a subtraction, otherwise the level this profile asked for. */
  setting: RuleLevel
  /**
   * The globs this profile confined its level to, when it named any. Rendered rather than folded into
   * the provenance table alone, because "off, because nextjs" and "off under `packages/ui/**`,
   * because nextjs" are different answers, and a reader looking at a finding *outside* those globs
   * needs to see at a glance that the profile is not the reason they still have it.
   */
  paths?: readonly string[]
  /** The count that earned an addition (`FrameworkMeasurement`). Absent for a subtraction. */
  measured?: FrameworkMeasurement
  evidence: readonly FrameworkEvidence[]
}

/** One addition that did not clear `refuseEnable`'s bar, and the profile that asked for it. */
type RejectedFrameworkAddition = {
  id: FrameworkId
  level: EnabledLevel
  refusal: string
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
    candidates: entries.filter((entry) => entry.concepts.includes(concept as never)),
    ownership: election.owners.get(concept) ?? [],
    suppressed: election.suppressed.filter((record) => record.concept === concept),
    ineligible: election.ineligible.filter((record) => record.concept === concept),
    displaced: election.displaced.filter((record) => record.concept === concept),
    uncovered: election.uncovered.includes(concept),
  }
}
