import { expect, test } from 'vitest'
import { filterOwned, isOwned } from './ownership.ts'
import type { RuleRef } from './types.ts'

const owners = new Map<string, RuleRef>([
  ['dead-code.unused-variable', { engine: 'oxlint', engineRuleId: 'no-unused-vars' }],
  ['dead-code.unused-import', { engine: 'knip', engineRuleId: 'unused-export' }],
])

test('accepts a diagnostic from the elected owner', () => {
  expect(isOwned(owners, { concept: 'dead-code.unused-variable', engine: 'oxlint', engineRuleId: 'no-unused-vars' })).toBe(true)
})

test('rejects a diagnostic for a concept owned by another engine', () => {
  expect(isOwned(owners, { concept: 'dead-code.unused-import', engine: 'oxlint', engineRuleId: 'no-unused-vars' })).toBe(false)
})

test('rejects a diagnostic for a concept nobody owns', () => {
  expect(isOwned(owners, { concept: 'style.no-var', engine: 'oxlint', engineRuleId: 'no-var' })).toBe(false)
})

test('filters a mixed batch down to owned diagnostics', () => {
  const batch = [
    { concept: 'dead-code.unused-variable', engine: 'oxlint' as const, engineRuleId: 'no-unused-vars', id: 'keep' },
    { concept: 'dead-code.unused-import', engine: 'oxlint' as const, engineRuleId: 'no-unused-vars', id: 'drop' },
  ]
  expect(filterOwned(owners, batch).map((d) => d.id)).toEqual(['keep'])
})
