import { expect, test } from 'vitest'
import { SLOP_GATE_SERVICED_CONCEPTS, isConceptId } from '../concepts/catalogue.ts'
import { compareStrings } from '../ordering.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { PRESETS } from './presets.ts'
import { OPTIONED_RECOMMENDED_RULES } from './rule-options.ts'
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

test('every optioned rule reaches recommended and strict with its options intact', () => {
  const entries = Object.entries(OPTIONED_RECOMMENDED_RULES)
  expect(entries.length).toBeGreaterThan(0)

  for (const [concept, rule] of entries) {
    expect(PRESETS.recommended[concept as RuleKey], concept).toEqual(rule.setting)
    expect(PRESETS.strict[concept as RuleKey], concept).toEqual(rule.setting)
    expect(splitRuleSetting(rule.setting).options, concept).not.toEqual([])
    expect(rule.reason.length, concept).toBeGreaterThan(200)
  }
})

test('check-tag-names admits the tags TSDoc standardises and JSDoc already accepts', () => {
  const setting = OPTIONED_RECOMMENDED_RULES['correctness.check-tag-names']?.setting
  expect(setting).toBeDefined()
  const [options] = splitRuleSetting(setting as RuleSetting).options ?? []
  const { definedTags } = options as { definedTags: readonly string[] }

  for (const tag of ['typeParam', 'privateRemarks', 'defaultValue', 'experimental', 'remarks', 'return']) {
    expect(definedTags, tag).toContain(tag)
  }
  expect(definedTags).not.toContain('schema')
})

test('splitRuleSetting normalises both shapes', () => {
  expect(splitRuleSetting('warn')).toEqual({ level: 'warn', options: undefined })
  expect(splitRuleSetting(['warn'])).toEqual({ level: 'warn', options: [] })
  expect(splitRuleSetting(['error', { max: 80 }])).toEqual({ level: 'error', options: [{ max: 80 }] })
})

test('splitRuleSetting reads level and options from the tuple in order', () => {
  const setting: RuleSetting = ['error', { max: 80, allow: ['a'] }]
  const { level, options } = splitRuleSetting(setting)

  expect(level).toBe('error')
  expect(options).toEqual([{ max: 80, allow: ['a'] }])
})

test('splitRuleSetting keeps a positional option list positional', () => {
  expect(splitRuleSetting(['warn', 'smart']).options).toEqual(['smart'])
  expect(splitRuleSetting(['warn', 'always', { null: 'ignore' }]).options).toEqual(['always', { null: 'ignore' }])
})

test('essential is recommended filtered to its error rules, so the two can never disagree', () => {
  const essentialKeys = Object.keys(PRESETS.essential).sort(compareStrings)
  const errorsInRecommended = Object.entries(PRESETS.recommended)
    .filter(([, setting]) => (Array.isArray(setting) ? setting[0] : setting) === 'error')
    .map(([concept]) => concept)
    .sort(compareStrings)

  expect(essentialKeys).toEqual(errorsInRecommended)
  expect(essentialKeys.length).toBeGreaterThan(0)
})

test('essential carries each rule at the level recommended gave it, options and all', () => {
  for (const [concept, setting] of Object.entries(PRESETS.essential)) {
    expect(setting).toEqual(PRESETS.recommended[concept as RuleKey])
  }
})

test('essential is strictly smaller than recommended, which is the point of it', () => {
  expect(Object.keys(PRESETS.essential).length).toBeLessThan(Object.keys(PRESETS.recommended).length)
})
