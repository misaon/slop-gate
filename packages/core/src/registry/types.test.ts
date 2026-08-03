import { expect, test } from 'vitest'
import { parseRuleRefKey, ruleRefKey } from './types.ts'

test('round-trips a rule ref through its key', () => {
  const ref = { engine: 'oxlint', engineRuleId: 'no-unused-vars' } as const
  expect(parseRuleRefKey(ruleRefKey(ref))).toEqual(ref)
})

test('splits on the first slash, so a rule id containing one survives', () => {
  expect(parseRuleRefKey('eslint/@typescript-eslint/no-unused-vars')).toEqual({
    engine: 'eslint',
    engineRuleId: '@typescript-eslint/no-unused-vars',
  })
})

test('reads the orchestrator prefix, which is not an engine id', () => {
  expect(parseRuleRefKey('slop-gate/config.rule-overlap')).toEqual({ engine: 'slop-gate', engineRuleId: 'config.rule-overlap' })
})

test('an unqualified key has no engine and is entirely a rule id', () => {
  expect(parseRuleRefKey('no-unused-vars')).toEqual({ engine: '', engineRuleId: 'no-unused-vars' })
})
