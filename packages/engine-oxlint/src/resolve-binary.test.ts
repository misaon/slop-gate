import { expect, test } from 'vitest'
import { resolveOxlintBinary } from './resolve-binary.ts'

const PLATFORMS = ['win32', 'darwin', 'linux', 'freebsd'] as const satisfies readonly NodeJS.Platform[]

const throwingResolver = (): never => {
  throw new Error('Cannot find module oxlint/package.json')
}

const resolvedPackageJsonForMissingBin = (): string => '/some/install/oxlint/package.json'
const fileNeverExists = (): boolean => false

for (const platform of PLATFORMS) {
  test(`resolves to a directly-spawnable command (not the bare script path) when process.platform is ${platform}`, () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
    try {
      const resolved = resolveOxlintBinary()

      expect(resolved?.command).toBe(process.execPath)
      expect(resolved?.command).not.toMatch(/oxlint[\\/]bin[\\/]oxlint$/)

      expect(resolved?.prefixArgs).toHaveLength(1)
      expect(resolved?.prefixArgs[0]).toMatch(/oxlint[\\/]bin[\\/]oxlint$/)
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })
}

test('resolves to nothing when the bundled oxlint cannot be resolved, rather than to one on PATH', () => {
  expect(resolveOxlintBinary(throwingResolver)).toBeUndefined()
})

test('resolves to nothing when the package resolves but bin/oxlint itself is missing', () => {
  expect(resolveOxlintBinary(resolvedPackageJsonForMissingBin, fileNeverExists)).toBeUndefined()
})

test('resolves the real installed oxlint package to its bin/oxlint script', () => {
  const resolved = resolveOxlintBinary()
  expect(resolved?.command).toBe(process.execPath)
  expect(resolved?.prefixArgs[0]).toMatch(/oxlint[\\/]bin[\\/]oxlint$/)
})
