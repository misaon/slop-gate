import { isOneOf } from '../guards.ts'
import type { ConceptId } from '../concepts/catalogue.ts'
import type { EngineId } from '../registry/types.ts'

export type RuleLevel = 'off' | 'info' | 'warn' | 'error'

export type RuleOptions = readonly unknown[]

export type RuleSetting = RuleLevel | readonly [RuleLevel, ...RuleOptions]

type EngineRuleKey = `${EngineId}/${string}`

export type RuleKey = ConceptId | EngineRuleKey

export type RuleMap = Partial<Record<RuleKey, RuleSetting>>

export type OverrideBlock = {
  readonly files: readonly string[]
  readonly rules: RuleMap
}

export type PresetName = 'essential' | 'recommended' | 'strict' | 'slop'

type EngineOptions = { readonly enabled?: boolean | 'auto' }

export type GeneratedPolicy = 'skip' | 'check'

export type SlopGateConfig = {
  readonly extends?: readonly PresetName[]
  readonly workspaces?: 'auto' | readonly string[]
  readonly rules?: RuleMap
  readonly overrides?: readonly OverrideBlock[]
  readonly owners?: Partial<Record<ConceptId, EngineId>>
  readonly engines?: Partial<Record<EngineId, EngineOptions>>
  readonly ignore?: readonly string[]
  readonly generated?: GeneratedPolicy
}

const RULE_LEVELS: readonly RuleLevel[] = ['off', 'info', 'warn', 'error']

export const LEVEL_STRENGTH: Readonly<Record<RuleLevel, number>> = { off: 0, info: 1, warn: 2, error: 3 }

export function isRuleLevel(value: unknown): value is RuleLevel {
  return typeof value === 'string' && isOneOf(value, RULE_LEVELS)
}

export function splitRuleSetting(setting: RuleSetting): {
  level: RuleLevel
  options: RuleOptions | undefined
} {
  return typeof setting === 'string'
    ? { level: setting, options: undefined }
    : { level: setting[0], options: setting.slice(1) }
}
