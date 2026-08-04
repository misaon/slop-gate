import { expect, test } from 'vitest'
import { RULE_ENTRIES } from '@misaon/slop-gate-core'
import { CSS_PARSE_ERROR_RULE_ID } from './parse.ts'
import {
  BIOME_CSS_RULE_IDS,
  EXCLUDED_RULES,
  EXCLUDED_RULE_IDS,
  FOREIGN_SUPPRESSION_RULE_ID,
  ruleByCategory,
  ruleByEngineRuleId,
} from './rules.ts'

const SYNTHETIC = [CSS_PARSE_ERROR_RULE_ID, FOREIGN_SUPPRESSION_RULE_ID]

const CSS_CAPABLE_RULES = [
  'noDeprecatedMediaType',
  'noDescendingSpecificity',
  'noDuplicateAtImportRules',
  'noDuplicateCustomProperties',
  'noDuplicateFontNames',
  'noDuplicateProperties',
  'noDuplicateSelectors',
  'noDuplicateSelectorsKeyframeBlock',
  'noEmptyBlock',
  'noEmptySource',
  'noExcessiveLinesPerFile',
  'noExcessiveSelectorClasses',
  'noHexColors',
  'noImportantInKeyframe',
  'noImportantStyles',
  'noInvalidDirectionInLinearGradient',
  'noInvalidGridAreas',
  'noInvalidPositionAtImportRule',
  'noIrregularWhitespace',
  'noMissingVarFunction',
  'noShorthandPropertyOverrides',
  'noUnknownAtRules',
  'noUnknownFunction',
  'noUnknownMediaFeatureName',
  'noUnknownProperty',
  'noUnknownPseudoClass',
  'noUnknownPseudoElement',
  'noUnknownTypeSelector',
  'noUnknownUnit',
  'noUnmatchableAnbSelector',
  'noUnusedClasses',
  'noUselessEscapeInString',
  'noValueAtRule',
  'useBaseline',
  'useGenericFontNames',
] as const

test('the shipped and excluded lists partition every CSS-capable Biome rule', () => {
  const covered = [...BIOME_CSS_RULE_IDS, ...EXCLUDED_RULE_IDS].sort()
  expect(covered).toEqual([...CSS_CAPABLE_RULES].sort())
})

test('no rule appears in both lists', () => {
  const both = [...BIOME_CSS_RULE_IDS].filter((id) => EXCLUDED_RULE_IDS.has(id))
  expect(both).toEqual([])
})

test('every excluded rule states a reason', () => {
  for (const excluded of EXCLUDED_RULES) {
    expect(excluded.reason.length).toBeGreaterThan(80)
  }
})

test('every shipped rule has a registry entry, and vice versa', () => {
  const entryIds = RULE_ENTRIES.filter((entry) => entry.engine === 'biome-css').map((entry) => entry.engineRuleId)
  expect(entryIds.filter((id) => !SYNTHETIC.includes(id)).sort()).toEqual([...BIOME_CSS_RULE_IDS].sort())
  for (const id of SYNTHETIC) expect(entryIds).toContain(id)
})

test('the synthetic reports are not biome rules', () => {
  for (const id of SYNTHETIC) {
    expect(BIOME_CSS_RULE_IDS.has(id)).toBe(false)
    expect(EXCLUDED_RULE_IDS.has(id)).toBe(false)
  }
})

test('no excluded rule leaked into the registry', () => {
  const entryIds = new Set(RULE_ENTRIES.filter((entry) => entry.engine === 'biome-css').map((entry) => entry.engineRuleId))
  for (const id of EXCLUDED_RULE_IDS) expect(entryIds.has(id)).toBe(false)
})

test('every biome-css registry entry claims css and only css', () => {
  for (const entry of RULE_ENTRIES.filter((e) => e.engine === 'biome-css')) {
    expect(entry.languages).toEqual(['css'])
  }
})

test('category strings match the shape the JSON reporter emits', () => {
  expect(ruleByEngineRuleId('noDuplicateProperties')?.category).toBe('lint/suspicious/noDuplicateProperties')
  expect(ruleByCategory('lint/suspicious/noDuplicateProperties')?.engineRuleId).toBe('noDuplicateProperties')
  expect(ruleByCategory('lint/suspicious/noUnknownUnit')).toBeUndefined()
})
