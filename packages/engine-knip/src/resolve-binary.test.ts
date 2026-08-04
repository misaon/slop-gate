import { createRequire } from 'node:module'
import { expect, test } from 'vitest'
import { resolveKnipBinary, resolveKnipPackageJson } from './resolve-binary.ts'

const PLATFORMS = ['win32', 'darwin', 'linux', 'freebsd'] as const satisfies readonly NodeJS.Platform[]

const throwingResolver = (): never => {
  throw new Error("Cannot find module 'knip'")
}
const resolvedPackageJsonForMissingBin = (): string => '/some/install/knip/package.json'
const fileNeverExists = (): boolean => false

for (const platform of PLATFORMS) {
  test(`resolves to a directly-spawnable command (not the bare script path) when process.platform is ${platform}`, () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
    try {
      const resolved = resolveKnipBinary()

      expect(resolved?.command).toBe(process.execPath)
      expect(resolved?.command).not.toMatch(/knip[\\/]bin[\\/]knip\.js$/)
      expect(resolved?.prefixArgs).toHaveLength(1)
      expect(resolved?.prefixArgs[0]).toMatch(/knip[\\/]bin[\\/]knip\.js$/)
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })
}

test("knip's own exports map does not expose ./package.json, so the naive specifier throws", () => {
  const require = createRequire(import.meta.url)
  expect(() => require.resolve('knip/package.json')).toThrow(/ERR_PACKAGE_PATH_NOT_EXPORTED|not defined by "exports"/)
})

test('resolveKnipPackageJson reaches the real manifest anyway, via the package entry point', () => {
  const resolved = resolveKnipPackageJson('knip/package.json')
  expect(resolved).toMatch(/knip[\\/]package\.json$/)
  expect(createRequire(import.meta.url)(resolved).name).toBe('knip')
})

test('resolves the real installed knip package to its bin/knip.js script', () => {
  const resolved = resolveKnipBinary()
  expect(resolved?.command).toBe(process.execPath)
  expect(resolved?.prefixArgs[0]).toMatch(/knip[\\/]bin[\\/]knip\.js$/)
})

test('resolves to nothing when the bundled knip cannot be resolved, rather than to one on PATH', () => {
  expect(resolveKnipBinary(throwingResolver)).toBeUndefined()
})

test('resolves to nothing when the package resolves but bin/knip.js is missing', () => {
  expect(resolveKnipBinary(resolvedPackageJsonForMissingBin, fileNeverExists)).toBeUndefined()
})
