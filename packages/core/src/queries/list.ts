import picomatch from 'picomatch'
import { SLOP_GATE_SERVICED_CONCEPTS } from '../concepts/catalogue.ts'
import type { RuleLevel } from '../config/types.ts'
import type { ConceptOwnership } from '../registry/elect.ts'
import type { EngineId } from '../registry/types.ts'
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
  /**
   * Every rule owning this concept, one entry per rule with the languages it won. Empty when nothing owns it.
   * Almost always a single entry — a concept split across engines by language (oxlint owns
   * `correctness.parse-error` for TypeScript, the schema engine owns it for YAML) is the case this is a list for,
   * and the case a single `owner` field could only misreport.
   */
  ownership: readonly ConceptOwnership[]
  servicedBySlopGate: boolean
  uncovered: boolean
  /**
   * True when `ownership` is empty for a reason *other* than a genuine coverage gap: this repository simply
   * contains no files in a language any candidate applies to. Read off `ElectionResult.uncovered` rather than
   * re-derived — an enabled, non-serviced concept with no owner is uncovered unless this is set, and never both.
   * It is the common case, not an edge one: 173 of `recommended`'s 271 enabled concepts land here on this
   * repository, mostly JSX/Vue/accessibility rules a TypeScript CLI's own file set never exercises, and rendering
   * them as a bare "(no elected owner)" reads as a bug rather than the harmless gap it is.
   */
  languageMismatch: boolean
  overlapCount: number
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
 * One row per concept `resolver.anyEnabledConcepts` contains — the effective ruleset spec §5.4 promises, not the
 * full ~850-entry registry. Filtering happens here, over the full list, rather than in the CLI layer, so
 * `--format json` and `--format pretty` are guaranteed to agree on which rows exist.
 */
export function buildRulesList(resolved: ResolvedRun, options: RulesListOptions = {}): RulesListEntry[] {
  const overlapCounts = new Map<string, number>()
  for (const record of resolved.election.overlaps) {
    overlapCounts.set(record.concept, (overlapCounts.get(record.concept) ?? 0) + 1)
  }

  const isMatch = options.only === undefined ? null : picomatch(options.only)

  const entries: RulesListEntry[] = []
  for (const concept of resolved.resolver.anyEnabledConcepts) {
    if (isMatch !== null && !isMatch(concept)) continue
    const ownership = resolved.election.owners.get(concept) ?? []
    // `--engine` keeps a concept this engine owns *for any language*: one it owns only for YAML still counts.
    if (options.engine !== undefined && !ownership.some(({ owner }) => owner.engine === options.engine)) continue
    const uncovered = resolved.election.uncovered.includes(concept)
    if (options.uncoveredOnly === true && !uncovered) continue
    const servicedBySlopGate = SLOP_GATE_SERVICED_CONCEPTS.has(concept)

    entries.push({
      concept,
      group: concept.split('.')[0]!,
      level: resolved.resolver.maxLevelOf(concept) as Exclude<RuleLevel, 'off'>,
      ownership,
      servicedBySlopGate,
      uncovered,
      // Necessarily the case whenever a non-serviced concept has no owner and is not uncovered: `electOwners` only
      // ever leaves both false when some candidate is fully capable (engine participates, no missing capability,
      // not deprecated) and fails solely on language — the exact condition that keeps it out of `uncovered`.
      languageMismatch: ownership.length === 0 && !uncovered && !servicedBySlopGate,
      overlapCount: overlapCounts.get(concept) ?? 0,
      enablement: resolveEnablement(resolved.resolver, concept),
    })
  }

  entries.sort((a, b) => compareStrings(a.concept, b.concept))
  return entries
}
