import { expect, test } from 'vitest'
import { arbitrateEdits, rangesConflict } from './arbitrate.ts'
import type { CandidateEdit } from './types.ts'

const edit = (over: Partial<CandidateEdit> & Pick<CandidateEdit, 'range'>): CandidateEdit => ({
  file: 'src/a.ts',
  replacement: 'X',
  kind: 'safe',
  ruleRefKey: 'oxlint/m-rule',
  concept: 'correctness.m',
  priority: 50,
  severity: 'warn',
  ...over,
})

const ids = (edits: readonly CandidateEdit[]): string[] => edits.map((e) => e.ruleRefKey)

test('disjoint edits are all applied, sorted by start offset', () => {
  const later = edit({ range: { start: 20, end: 25 }, ruleRefKey: 'oxlint/b' })
  const earlier = edit({ range: { start: 5, end: 8 }, ruleRefKey: 'oxlint/a' })

  const result = arbitrateEdits([later, earlier], 100)

  expect(ids(result.applied)).toEqual(['oxlint/a', 'oxlint/b'])
  expect(result.dropped).toEqual([])
})

test('exactly adjacent ranges do not overlap and are both applied', () => {
  const first = edit({ range: { start: 4, end: 10 }, ruleRefKey: 'oxlint/a' })
  const second = edit({ range: { start: 10, end: 14 }, ruleRefKey: 'oxlint/b' })

  const result = arbitrateEdits([first, second], 100)

  expect(ids(result.applied)).toEqual(['oxlint/a', 'oxlint/b'])
  expect(result.dropped).toEqual([])
})

test('a fully nested range loses to the enclosing one when the enclosing one has higher priority', () => {
  const outer = edit({ range: { start: 4, end: 30 }, ruleRefKey: 'oxlint/outer', priority: 90 })
  const inner = edit({ range: { start: 10, end: 14 }, ruleRefKey: 'oxlint/inner', priority: 10 })

  const result = arbitrateEdits([inner, outer], 100)

  expect(ids(result.applied)).toEqual(['oxlint/outer'])
  expect(result.dropped).toHaveLength(1)
  expect(result.dropped[0]?.edit.ruleRefKey).toBe('oxlint/inner')
  expect(result.dropped[0]?.reason).toBe('overlap')
  expect(result.dropped[0]?.winner?.ruleRefKey).toBe('oxlint/outer')
})

test('a fully nested range wins over the enclosing one when it has higher priority', () => {
  const outer = edit({ range: { start: 4, end: 30 }, ruleRefKey: 'oxlint/outer', priority: 10 })
  const inner = edit({ range: { start: 10, end: 14 }, ruleRefKey: 'oxlint/inner', priority: 90 })

  const result = arbitrateEdits([outer, inner], 100)

  expect(ids(result.applied)).toEqual(['oxlint/inner'])
  expect(result.dropped[0]?.edit.ruleRefKey).toBe('oxlint/outer')
})

test('partially overlapping ranges: registry priority decides', () => {
  const low = edit({ range: { start: 4, end: 12 }, ruleRefKey: 'oxlint/low', priority: 10 })
  const high = edit({ range: { start: 8, end: 20 }, ruleRefKey: 'oxlint/high', priority: 60 })

  expect(ids(arbitrateEdits([low, high], 100).applied)).toEqual(['oxlint/high'])
})

test('equal priority falls through to severity', () => {
  const warn = edit({ range: { start: 4, end: 12 }, ruleRefKey: 'oxlint/a-warn', severity: 'warn' })
  const error = edit({ range: { start: 8, end: 20 }, ruleRefKey: 'oxlint/z-error', severity: 'error' })

  expect(ids(arbitrateEdits([warn, error], 100).applied)).toEqual(['oxlint/z-error'])
})

test('equal priority and severity falls through to rule id, ascending', () => {
  const first = edit({ range: { start: 4, end: 12 }, ruleRefKey: 'oxlint/aaa' })
  const second = edit({ range: { start: 8, end: 20 }, ruleRefKey: 'oxlint/bbb' })

  expect(ids(arbitrateEdits([second, first], 100).applied)).toEqual(['oxlint/aaa'])
})

test('the result does not depend on input order', () => {
  const a = edit({ range: { start: 0, end: 10 }, ruleRefKey: 'oxlint/a', priority: 30 })
  const b = edit({ range: { start: 5, end: 15 }, ruleRefKey: 'oxlint/b', priority: 70 })
  const c = edit({ range: { start: 12, end: 20 }, ruleRefKey: 'oxlint/c', priority: 50 })

  const forward = arbitrateEdits([a, b, c], 100)
  const backward = arbitrateEdits([c, b, a], 100)

  expect(ids(forward.applied)).toEqual(ids(backward.applied))
  expect(ids(forward.applied)).toEqual(['oxlint/b'])
})

test('a chain drops only the middle edit when the two ends do not touch each other', () => {
  const a = edit({ range: { start: 0, end: 10 }, ruleRefKey: 'oxlint/a', priority: 90 })
  const b = edit({ range: { start: 8, end: 22 }, ruleRefKey: 'oxlint/b', priority: 10 })
  const c = edit({ range: { start: 20, end: 30 }, ruleRefKey: 'oxlint/c', priority: 80 })

  const result = arbitrateEdits([a, b, c], 100)

  expect(ids(result.applied)).toEqual(['oxlint/a', 'oxlint/c'])
  expect(result.dropped.map((d) => d.edit.ruleRefKey)).toEqual(['oxlint/b'])
})

test('two zero-width insertions at the same offset conflict', () => {
  const a = edit({ range: { start: 7, end: 7 }, replacement: ';', ruleRefKey: 'oxlint/a', priority: 90 })
  const b = edit({ range: { start: 7, end: 7 }, replacement: ',', ruleRefKey: 'oxlint/b', priority: 10 })

  const result = arbitrateEdits([a, b], 100)

  expect(ids(result.applied)).toEqual(['oxlint/a'])
  expect(result.dropped[0]?.edit.ruleRefKey).toBe('oxlint/b')
})

test('a zero-width insertion at the start of a replacement conflicts with it', () => {
  const insert = edit({ range: { start: 7, end: 7 }, replacement: '_', ruleRefKey: 'oxlint/insert', priority: 10 })
  const replace = edit({ range: { start: 7, end: 12 }, replacement: 'name', ruleRefKey: 'oxlint/replace', priority: 90 })

  const result = arbitrateEdits([insert, replace], 100)

  expect(ids(result.applied)).toEqual(['oxlint/replace'])
})

test('zero-width insertions at different offsets are both applied', () => {
  const a = edit({ range: { start: 7, end: 7 }, replacement: ';', ruleRefKey: 'oxlint/a' })
  const b = edit({ range: { start: 9, end: 9 }, replacement: ';', ruleRefKey: 'oxlint/b' })

  expect(ids(arbitrateEdits([a, b], 100).applied)).toEqual(['oxlint/a', 'oxlint/b'])
})

test('an edit reaching past the end of the buffer is dropped, never clamped', () => {
  const beyond = edit({ range: { start: 90, end: 120 }, ruleRefKey: 'oxlint/beyond' })

  const result = arbitrateEdits([beyond], 100)

  expect(result.applied).toEqual([])
  expect(result.dropped[0]?.reason).toBe('out-of-range')
  expect(result.dropped[0]?.winner).toBeUndefined()
})

test('an inverted range is dropped as out of range', () => {
  const inverted = edit({ range: { start: 20, end: 10 }, ruleRefKey: 'oxlint/inverted' })

  expect(arbitrateEdits([inverted], 100).dropped[0]?.reason).toBe('out-of-range')
})

test('a negative start is dropped as out of range', () => {
  expect(arbitrateEdits([edit({ range: { start: -1, end: 4 } })], 100).dropped[0]?.reason).toBe('out-of-range')
})

test('an edit ending exactly at the end of the buffer is in range', () => {
  expect(arbitrateEdits([edit({ range: { start: 90, end: 100 } })], 100).applied).toHaveLength(1)
})

test('an out-of-range edit does not consume the overlap slot a valid edit needs', () => {
  const broken = edit({ range: { start: 0, end: 500 }, ruleRefKey: 'oxlint/broken', priority: 99 })
  const good = edit({ range: { start: 4, end: 8 }, ruleRefKey: 'oxlint/good', priority: 1 })

  const result = arbitrateEdits([broken, good], 100)

  expect(ids(result.applied)).toEqual(['oxlint/good'])
  expect(result.dropped.map((d) => d.reason)).toEqual(['out-of-range'])
})

test('rangesConflict treats touching ranges as disjoint and shared interiors as conflicting', () => {
  expect(rangesConflict({ start: 0, end: 5 }, { start: 5, end: 9 })).toBe(false)
  expect(rangesConflict({ start: 0, end: 5 }, { start: 4, end: 9 })).toBe(true)
  expect(rangesConflict({ start: 0, end: 9 }, { start: 3, end: 4 })).toBe(true)
  expect(rangesConflict({ start: 5, end: 5 }, { start: 5, end: 5 })).toBe(true)
  expect(rangesConflict({ start: 5, end: 5 }, { start: 6, end: 6 })).toBe(false)
})
