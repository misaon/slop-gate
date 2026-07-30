import type { EngineId, RuleRef } from './types.ts'

export type OwnershipCandidate = {
  concept: string
  engine: EngineId
  engineRuleId: string
}

export function isOwned(owners: ReadonlyMap<string, RuleRef>, candidate: OwnershipCandidate): boolean {
  const owner = owners.get(candidate.concept)
  return owner?.engine === candidate.engine && owner.engineRuleId === candidate.engineRuleId
}

export function filterOwned<T extends OwnershipCandidate>(
  owners: ReadonlyMap<string, RuleRef>,
  candidates: readonly T[],
): T[] {
  return candidates.filter((candidate) => isOwned(owners, candidate))
}
