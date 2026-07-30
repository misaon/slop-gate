import { LEVEL_STRENGTH, type RuleLevel } from '../config/types.ts'
import type { RuleSetResolver } from '../config/resolve.ts'
import type { FileInventory, InventoryFile } from '../discovery/types.ts'
import type { Engine, EngineRuleSelection } from '../engine/types.ts'
import { compareStrings } from '../ordering.ts'
import type { ElectionResult } from '../registry/elect.ts'
import type { EngineId } from '../registry/types.ts'

export type EngineAssignment = {
  readonly engineId: EngineId
  readonly selection: EngineRuleSelection
  readonly files: readonly InventoryFile[]
}

export type PlanInput = {
  engines: readonly Engine[]
  inventory: FileInventory
  election: ElectionResult
  resolver: RuleSetResolver
}

export function buildPlan(input: PlanInput): EngineAssignment[] {
  const conceptsByRule = new Map<string, string[]>()
  for (const [concept, owner] of input.election.owners) {
    const key = `${owner.engine}/${owner.engineRuleId}`
    conceptsByRule.set(key, [...(conceptsByRule.get(key) ?? []), concept])
  }

  const assignments: EngineAssignment[] = []

  for (const engine of [...input.engines].sort((a, b) => compareStrings(a.id, b.id))) {
    const ruleIds = input.election.selection.get(engine.id)
    if (ruleIds === undefined || ruleIds.size === 0) continue

    const supported = new Set(engine.capabilities.languages)
    const files = input.inventory.files.filter((file) => supported.has(file.language))
    if (files.length === 0) continue

    const selection = new Map<string, RuleLevel>()
    for (const ruleId of [...ruleIds].sort(compareStrings)) {
      const concepts = conceptsByRule.get(`${engine.id}/${ruleId}`) ?? []
      const level = strongestLevel(concepts, input.resolver)
      if (level !== 'off') selection.set(ruleId, level)
    }
    if (selection.size === 0) continue

    assignments.push({ engineId: engine.id, selection, files })
  }

  return assignments
}

function strongestLevel(concepts: readonly string[], resolver: RuleSetResolver): RuleLevel {
  let strongest: RuleLevel = 'off'
  for (const concept of concepts) {
    const level = resolver.maxLevelOf(concept)
    if (LEVEL_STRENGTH[level] > LEVEL_STRENGTH[strongest]) strongest = level
  }
  return strongest
}
