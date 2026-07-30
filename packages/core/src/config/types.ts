import type { ConceptId } from '../concepts/catalogue.ts'
import type { EngineId } from '../registry/types.ts'

export type RuleLevel = 'off' | 'info' | 'warn' | 'error'

export type RuleSetting = RuleLevel | readonly [RuleLevel, Record<string, unknown>]

export type EngineRuleKey = `${EngineId}/${string}`

export type RuleKey = ConceptId | EngineRuleKey

export type RuleMap = Partial<Record<RuleKey, RuleSetting>>

export type OverrideBlock = {
  readonly files: readonly string[]
  readonly rules: RuleMap
}

export type PresetName = 'recommended' | 'strict' | 'slop'

export type EngineOptions = { readonly enabled?: boolean | 'auto' }

export type SlopGateConfig = {
  readonly extends?: readonly PresetName[]
  readonly workspaces?: 'auto' | readonly string[]
  readonly rules?: RuleMap
  readonly overrides?: readonly OverrideBlock[]
  readonly owners?: Partial<Record<ConceptId, EngineId>>
  readonly engines?: Partial<Record<EngineId, EngineOptions>>
  readonly ignore?: readonly string[]
}

const RULE_LEVELS: readonly RuleLevel[] = ['off', 'info', 'warn', 'error']

export function isRuleLevel(value: unknown): value is RuleLevel {
  return typeof value === 'string' && RULE_LEVELS.includes(value as RuleLevel)
}

export function splitRuleSetting(setting: RuleSetting): {
  level: RuleLevel
  options: Record<string, unknown>
} {
  return Array.isArray(setting)
    ? { level: setting[0], options: setting[1] }
    : { level: setting as RuleLevel, options: {} }
}
