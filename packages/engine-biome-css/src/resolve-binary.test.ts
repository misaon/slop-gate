import { existsSync } from 'node:fs'
import { expect, test } from 'vitest'
import { resolveBiomeBinary } from './resolve-binary.ts'

test('resolves the installed biome bin script and runs it through this node', () => {
  const invocation = resolveBiomeBinary()
  expect(invocation?.command).toBe(process.execPath)
  expect(invocation?.prefixArgs).toHaveLength(1)
  expect(invocation?.prefixArgs[0]).toMatch(/biome/)
  expect(existsSync(invocation!.prefixArgs[0]!)).toBe(true)
})

test('resolves package.json directly, needing no exports workaround', () => {
  expect(() => resolveBiomeBinary(() => require.resolve('@biomejs/biome/package.json'))).not.toThrow()
})

test('resolves to nothing when the package cannot be resolved, rather than to a `biome` on PATH', () => {
  const invocation = resolveBiomeBinary(() => {
    throw new Error('not installed')
  })
  expect(invocation).toBeUndefined()
})

test('resolves to nothing when the bin script is missing from disk', () => {
  const invocation = resolveBiomeBinary(
    () => '/somewhere/@biomejs/biome/package.json',
    () => false,
  )
  expect(invocation).toBeUndefined()
})
