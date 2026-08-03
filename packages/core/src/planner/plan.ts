import { LEVEL_STRENGTH, type RuleLevel, type RuleOptions } from '../config/types.ts'
import type { RuleSetResolver } from '../config/resolve.ts'
import type { FileInventory, InventoryFile } from '../discovery/types.ts'
import type { Engine, EngineRuleSelection, EngineRuleSetting } from '../engine/types.ts'
import { compareStrings } from '../ordering.ts'
import type { ElectionResult } from '../registry/elect.ts'
import { ruleRefKey, type EngineId } from '../registry/types.ts'

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
  // A concept can have several owners now, one per language group, so this is a nested walk rather
  // than a map iteration. Each owning rule still contributes the concept exactly once — the level a
  // rule runs at is a property of the concepts it owns, not of how many languages it owns them for.
  const conceptsByRule = new Map<string, string[]>()
  for (const [concept, ownership] of input.election.owners) {
    for (const { owner } of ownership) {
      const key = ruleRefKey(owner)
      conceptsByRule.set(key, [...(conceptsByRule.get(key) ?? []), concept])
    }
  }

  const assignments: EngineAssignment[] = []

  for (const engine of [...input.engines].sort((a, b) => compareStrings(a.id, b.id))) {
    const engineRuleIds = input.election.selection.get(engine.id)
    if (engineRuleIds === undefined || engineRuleIds.size === 0) continue

    const supported = new Set(engine.capabilities.languages)
    const files = input.inventory.files.filter((file) => supported.has(file.language))
    if (files.length === 0) continue

    const selection = new Map<string, EngineRuleSetting>()
    for (const engineRuleId of [...engineRuleIds].sort(compareStrings)) {
      const concepts = conceptsByRule.get(`${engine.id}/${engineRuleId}`) ?? []
      const level = strongestLevel(concepts, input.resolver)
      // A guard, not the mechanism, and worth saying so: `RuleSetResolver.anyEnabledConcepts` already
      // drops an `off` concept before `electOwners` can elect a rule for it, so this branch is
      // unreachable through the normal path — `plan.test.ts` has to force the election to exercise it.
      // It stays because it is the last place that can keep an `off` setting from reaching an adapter,
      // and it is what lets `EngineRuleSelection` promise that presence means enabled.
      if (level === 'off') continue
      selection.set(engineRuleId, [level, ...optionsFor(concepts, input.resolver)])
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

/**
 * Options are a property of a *rule*, but they are configured on a *concept*, and one rule can own
 * several — `no-unused-vars` owns both `dead-code.unused-variable` and `dead-code.unused-import`.
 * A rule whose concepts carry two different option lists has no correct answer, only a determinate
 * one: sorted concept order, first specifier wins. Sorted so the outcome cannot depend on registry
 * declaration order, the same property `electOwners` maintains for arbitration.
 *
 * That situation is a registry smell rather than a configuration a user should be able to reach
 * quietly — reporting it belongs with the other `config.*` governance diagnostics and is recorded
 * as a follow-up, not left to be discovered.
 */
function optionsFor(concepts: readonly string[], resolver: RuleSetResolver): RuleOptions {
  for (const concept of [...concepts].sort(compareStrings)) {
    const options = resolver.optionsOf(concept)
    if (options.length > 0) return options
  }
  return []
}
