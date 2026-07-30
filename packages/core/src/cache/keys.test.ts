import { expect, test } from 'vitest'
import { deriveResultKey, hashContent, hashJson, hashRuleSelection, stableStringify } from './keys.ts'

const base = {
  engineId: 'oxlint',
  engineVersion: '1.75.0',
  engineRulesetHash: 'abc',
  fileHash: 'def',
  configHash: 'ghi',
}

test('hashes content deterministically', () => {
  expect(hashContent('a')).toBe(hashContent('a'))
  expect(hashContent('a')).not.toBe(hashContent('b'))
})

test('hashes a string and an equivalent byte array identically', () => {
  expect(hashContent('abc')).toBe(hashContent(new TextEncoder().encode('abc')))
})

test('stringifies objects with sorted keys so key order cannot change a hash', () => {
  expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  expect(hashJson({ b: 1, a: 2 })).toBe(hashJson({ a: 2, b: 1 }))
})

test('preserves array order when stringifying', () => {
  expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
})

test('hashes a rule selection independently of iteration order', () => {
  expect(hashRuleSelection(['b', 'a'])).toBe(hashRuleSelection(['a', 'b']))
  expect(hashRuleSelection(['a'])).not.toBe(hashRuleSelection(['a', 'b']))
})

test.each([
  ['engineId', { engineId: 'oxfmt' }],
  ['engineVersion', { engineVersion: '1.76.0' }],
  ['engineRulesetHash', { engineRulesetHash: 'changed' }],
  ['fileHash', { fileHash: 'changed' }],
  ['configHash', { configHash: 'changed' }],
])('a different %s produces a different key', (_label, patch) => {
  expect(deriveResultKey({ ...base, ...patch })).not.toBe(deriveResultKey(base))
})

test('the same inputs produce the same key', () => {
  expect(deriveResultKey(base)).toBe(deriveResultKey({ ...base }))
})

test('keys are filesystem-safe hex', () => {
  expect(deriveResultKey(base)).toMatch(/^[0-9a-f]{64}$/)
})

test('cannot be collided by shifting content across a component boundary', () => {
  const a = { ...base, engineId: 'a', engineVersion: 'b\0c' }
  const b = { ...base, engineId: 'a\0b', engineVersion: 'c' }

  expect(deriveResultKey(a)).not.toBe(deriveResultKey(b))
})
