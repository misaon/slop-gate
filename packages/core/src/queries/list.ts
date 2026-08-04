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
  group: string
  level: Exclude<RuleLevel, 'off'>
  ownership: readonly ConceptOwnership[]
  servicedBySlopGate: boolean
  uncovered: boolean
  languageMismatch: boolean
  overlapCount: number
  enablement: ConceptEnablement
}

export type RulesListOptions = {
  only?: string
  engine?: EngineId
  uncoveredOnly?: boolean
}

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
      languageMismatch: ownership.length === 0 && !uncovered && !servicedBySlopGate,
      overlapCount: overlapCounts.get(concept) ?? 0,
      enablement: resolveEnablement(resolved.resolver, concept),
    })
  }

  entries.sort((a, b) => compareStrings(a.concept, b.concept))
  return entries
}
