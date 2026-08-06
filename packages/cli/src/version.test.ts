import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { readCliVersion } from './version.ts'

test('reads the same version this package.json declares', () => {
  const packageDir = import.meta.dirname
  const { version } = JSON.parse(readFileSync(join(packageDir, '../package.json'), 'utf8')) as { version: string }
  expect(readCliVersion()).toBe(version)
})

test('returns a plain semver-looking string', () => {
  expect(readCliVersion()).toMatch(/^\d+\.\d+\.\d+/)
})
