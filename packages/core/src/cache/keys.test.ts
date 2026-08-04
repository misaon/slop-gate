import { expect, test } from 'vitest'
import {
  deriveProjectResultKey,
  deriveResultKey,
  hashContent,
  hashJson,
  hashRuleSelection,
  stableStringify,
  type ProjectResultKeyInput,
} from './keys.ts'

const base = {
  engineId: 'oxlint',
  engineVersion: '1.75.0',
  engineRulesetHash: 'abc',
  filePath: 'src/a.ts',
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
  ['filePath', { filePath: 'legacy/a.ts' }],
  ['fileHash', { fileHash: 'changed' }],
  ['configHash', { configHash: 'changed' }],
])('a different %s produces a different key', (_label, patch) => {
  expect(deriveResultKey({ ...base, ...patch })).not.toBe(deriveResultKey(base))
})

test('two different paths with identical content produce different keys', () => {
  expect(deriveResultKey({ ...base, filePath: 'legacy/a.ts' })).not.toBe(
    deriveResultKey({ ...base, filePath: 'src/a.ts' }),
  )
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

const projectBase: ProjectResultKeyInput = {
  engineId: 'tsc',
  engineVersion: '5.9.3',
  engineRulesetHash: 'abc',
  configHash: 'ghi',
  files: [
    { path: 'src/a.ts', hash: 'hash-a' },
    { path: 'src/b.ts', hash: 'hash-b' },
  ],
}

test('the same inputs produce the same project key', () => {
  expect(deriveProjectResultKey(projectBase)).toBe(deriveProjectResultKey({ ...projectBase }))
})

test('a project key is independent of the order files were assigned in', () => {
  const reordered: ProjectResultKeyInput = { ...projectBase, files: [...projectBase.files].reverse() }
  expect(deriveProjectResultKey(reordered)).toBe(deriveProjectResultKey(projectBase))
})

test.each([
  ['engineId', { engineId: 'knip' }],
  ['engineVersion', { engineVersion: '5.9.4' }],
  ['engineRulesetHash', { engineRulesetHash: 'changed' }],
  ['configHash', { configHash: 'changed' }],
])('a different project %s produces a different key', (_label, patch) => {
  expect(deriveProjectResultKey({ ...projectBase, ...patch })).not.toBe(deriveProjectResultKey(projectBase))
})

test('adding a file to the project changes the key', () => {
  const withExtraFile: ProjectResultKeyInput = {
    ...projectBase,
    files: [...projectBase.files, { path: 'src/c.ts', hash: 'hash-c' }],
  }
  expect(deriveProjectResultKey(withExtraFile)).not.toBe(deriveProjectResultKey(projectBase))
})

test('changing one file’s hash changes the project key even though the file list is otherwise identical', () => {
  const changed: ProjectResultKeyInput = {
    ...projectBase,
    files: [{ path: 'src/a.ts', hash: 'different' }, projectBase.files[1]!],
  }
  expect(deriveProjectResultKey(changed)).not.toBe(deriveProjectResultKey(projectBase))
})

test('a project key never collides with a per-file key built from the same raw values', () => {
  const asFileKey = deriveResultKey({
    engineId: projectBase.engineId,
    engineVersion: projectBase.engineVersion,
    engineRulesetHash: projectBase.engineRulesetHash,
    filePath: 'src/a.ts',
    fileHash: 'hash-a',
    configHash: projectBase.configHash,
  })
  expect(deriveProjectResultKey(projectBase)).not.toBe(asFileKey)
})
