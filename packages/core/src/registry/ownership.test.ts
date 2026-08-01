import { expect, test } from 'vitest'
import { filterOwned, isOwned, owningEngines, type OwnerMap } from './ownership.ts'

const owners: OwnerMap = new Map([
  ['dead-code.unused-variable', [{ owner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' }, languages: ['ts'] }]],
  ['dead-code.unused-import', [{ owner: { engine: 'knip', engineRuleId: 'unused-export' }, languages: ['ts'] }]],
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

test('respects the language a concept is owned for', () => {
  // The whole point of `(concept, language)` ownership: the same rule owns `correctness.parse-error`
  // for `ts` and not for `yaml`, and a finding is kept or dropped on that basis alone.
  const split: OwnerMap = new Map([
    [
      'correctness.parse-error',
      [
        { owner: { engine: 'oxlint' as const, engineRuleId: 'parse-error' }, languages: ['ts' as const] },
        { owner: { engine: 'schema' as const, engineRuleId: 'parse-error' }, languages: ['yaml' as const] },
      ],
    ],
  ])
  const candidate = { concept: 'correctness.parse-error', engine: 'oxlint' as const, engineRuleId: 'parse-error' }

  expect(isOwned(split, { ...candidate, language: 'ts' })).toBe(true)
  expect(isOwned(split, { ...candidate, language: 'yaml' })).toBe(false)
  // No language named means "owned anywhere", which is what a caller with no file in hand wants.
  expect(isOwned(split, candidate)).toBe(true)
})

test('ignores the language when a single rule owns the concept outright', () => {
  // The language dimension exists to pick between owners. With one owner there is nobody to pick
  // between, and enforcing it anyway drops legitimate findings: a project engine reports against
  // files it was never handed — `tsc` naming `tsconfig.json`, language `jsonc`, is the real case —
  // and its rule's `languages` list will never mention them.
  const sole: OwnerMap = new Map([
    ['types.type-error', [{ owner: { engine: 'tsc' as const, engineRuleId: 'type-error' }, languages: ['ts' as const] }]],
  ])

  expect(
    isOwned(sole, { concept: 'types.type-error', engine: 'tsc', engineRuleId: 'type-error', language: 'jsonc' }),
  ).toBe(true)
})

test('lists every engine owning a concept, so a split concept is judged by both', () => {
  const split: OwnerMap = new Map([
    [
      'correctness.parse-error',
      [
        { owner: { engine: 'oxlint' as const, engineRuleId: 'parse-error' }, languages: ['ts' as const] },
        { owner: { engine: 'schema' as const, engineRuleId: 'parse-error' }, languages: ['yaml' as const] },
      ],
    ],
  ])

  expect(owningEngines(split, 'correctness.parse-error')).toEqual(['oxlint', 'schema'])
  expect(owningEngines(split, 'style.no-var')).toEqual([])
})
