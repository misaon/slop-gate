import type { ProvenanceLayer, ProvenanceStep, RuleSetResolver } from '../config/resolve.ts'
import type { RuleKey, RuleLevel, RuleOptions, RuleSetting } from '../config/types.ts'
import { splitRuleSetting } from '../config/types.ts'

export type OverrideMention = { layer: ProvenanceLayer; source: string; setting: RuleSetting }

export type ConceptEnablement = {
  enabled: boolean
  level: RuleLevel
  options: RuleOptions
  optionsFrom: { layer: ProvenanceLayer; source: string } | undefined
  baseProvenance: readonly ProvenanceStep[]
  overrides: readonly OverrideMention[]
}

export function resolveEnablement(resolver: RuleSetResolver, concept: string): ConceptEnablement {
  return {
    enabled: resolver.anyEnabledConcepts.has(concept),
    level: resolver.maxLevelOf(concept),
    options: resolver.optionsOf(concept),
    optionsFrom: resolver.base.rules.get(concept as RuleKey)?.optionsFrom,
    baseProvenance: resolver.base.rules.get(concept as RuleKey)?.provenance ?? [],
    overrides: resolver.overridesFor(concept),
  }
}

export function wasEnabledBeforeBeingDisabled(baseProvenance: readonly ProvenanceStep[]): boolean {
  if (baseProvenance.length === 0) return false
  const last = baseProvenance.at(-1)!
  if (splitRuleSetting(last.setting).level !== 'off') return false
  return baseProvenance.some((step) => splitRuleSetting(step.setting).level !== 'off')
}
