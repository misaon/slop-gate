import type { LanguageId } from '../languages.ts'
import type { ConceptOwnership } from './elect.ts'
import type { EngineId } from './types.ts'

export type OwnershipCandidate = {
  concept: string
  engine: EngineId
  engineRuleId: string
  language?: LanguageId
}

export type OwnerMap = ReadonlyMap<string, readonly ConceptOwnership[]>

export function isOwned(owners: OwnerMap, candidate: OwnershipCandidate): boolean {
  const ownership = owners.get(candidate.concept) ?? []
  const contested = ownership.length > 1
  return ownership.some(
    ({ owner, languages }) =>
      owner.engine === candidate.engine &&
      owner.engineRuleId === candidate.engineRuleId &&
      (!contested || candidate.language === undefined || languages.includes(candidate.language)),
  )
}

export function filterOwned<T extends OwnershipCandidate>(owners: OwnerMap, candidates: readonly T[]): T[] {
  return candidates.filter((candidate) => isOwned(owners, candidate))
}

export function owningEngines(owners: OwnerMap, concept: string): readonly EngineId[] {
  return (owners.get(concept) ?? []).map(({ owner }) => owner.engine)
}
