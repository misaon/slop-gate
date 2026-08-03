import { existsSync } from 'node:fs'
import { expect, test } from 'vitest'
import { resolveBiomeBinary } from './resolve-binary.ts'

test('resolves the installed biome bin script and runs it through this node', () => {
  const invocation = resolveBiomeBinary()
  // `bin/biome` is an extensionless `#!/usr/bin/env node` script, which Windows cannot spawn
  // directly — so the resolved invocation is always `node <script>`, on every platform.
  expect(invocation?.command).toBe(process.execPath)
  expect(invocation?.prefixArgs).toHaveLength(1)
  expect(invocation?.prefixArgs[0]).toMatch(/biome/)
  expect(existsSync(invocation!.prefixArgs[0]!)).toBe(true)
})

test('resolves package.json directly, needing no exports workaround', () => {
  // Unlike `knip`, `@biomejs/biome` publishes no `exports` map, so the plain specifier resolves and
  // there is no `ERR_PACKAGE_PATH_NOT_EXPORTED` to route around. Pinned so an upstream release that
  // adds one is noticed here rather than at run time.
  expect(() => resolveBiomeBinary(() => require.resolve('@biomejs/biome/package.json'))).not.toThrow()
})

test('resolves to nothing when the package cannot be resolved, rather than to a `biome` on PATH', () => {
  const invocation = resolveBiomeBinary(() => {
    throw new Error('not installed')
  })
  expect(invocation).toBeUndefined()
})

test('resolves to nothing when the bin script is missing from disk', () => {
  // A corrupted or partial install. `node <missing script>` would exit 1 — indistinguishable from
  // "found findings" — and a bare `biome` would be some other version of Biome than the exact one
  // this package pins, so neither is an answer: the engine fails the run and says to reinstall.
  const invocation = resolveBiomeBinary(
    () => '/somewhere/@biomejs/biome/package.json',
    () => false,
  )
  expect(invocation).toBeUndefined()
})
