import { expect, test } from 'vitest'
import { SLOP_GATE_SERVICED_CONCEPTS, isConceptId } from '../concepts/catalogue.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { PRESETS } from './presets.ts'
import { isRuleLevel, splitRuleSetting, type RuleKey, type RuleSetting } from './types.ts'

const allKeys = Object.values(PRESETS).flatMap((map) => Object.keys(map) as RuleKey[])

test('every preset key is a known concept', () => {
  expect(allKeys.filter((key) => !isConceptId(key))).toEqual([])
})

test('every preset level is valid', () => {
  for (const [name, map] of Object.entries(PRESETS)) {
    for (const [key, setting] of Object.entries(map)) {
      expect(isRuleLevel(splitRuleSetting(setting!).level), `${name}/${key}`).toBe(true)
    }
  }
})

test('no preset enables a concept no shipped rule can detect', () => {
  const detectable = new Set(RULE_ENTRIES.flatMap((entry) => entry.concepts as readonly string[]))
  // `SLOP_GATE_SERVICED_CONCEPTS`, not a list repeated here: a concept the orchestrator services
  // itself has no `RuleEntry` by construction (`ConceptDefinition.servicedBySlopGate`), and a
  // hand-maintained copy of that set turns adding one into an unrelated test failure.
  const orphaned = allKeys.filter((key) => !detectable.has(key) && !SLOP_GATE_SERVICED_CONCEPTS.has(key))
  expect(orphaned).toEqual([])
})

test('strict is at least as strict as recommended', () => {
  const rank = { off: 0, info: 1, warn: 2, error: 3 } as const
  for (const [key, setting] of Object.entries(PRESETS.recommended)) {
    const strictSetting = PRESETS.strict[key as RuleKey]
    expect(strictSetting, key).toBeDefined()
    const before = rank[splitRuleSetting(setting!).level]
    const after = rank[splitRuleSetting(strictSetting!).level]
    expect(after, key).toBeGreaterThanOrEqual(before)
  }
})

test('splitRuleSetting normalises both shapes', () => {
  expect(splitRuleSetting('warn')).toEqual({ level: 'warn', options: {} })
  expect(splitRuleSetting(['error', { max: 80 }])).toEqual({ level: 'error', options: { max: 80 } })
})

test('splitRuleSetting reads level and options from the tuple in order', () => {
  const setting: RuleSetting = ['error', { max: 80, allow: ['a'] }]
  const { level, options } = splitRuleSetting(setting)

  expect(level).toBe('error')
  expect(options).toEqual({ max: 80, allow: ['a'] })
})
