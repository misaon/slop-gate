import { join } from 'node:path'
import { expect, test } from 'vitest'
import { resolveScriptBin } from './resolve-script-bin.ts'

const PLATFORMS = ['win32', 'darwin', 'linux', 'freebsd'] as const satisfies readonly NodeJS.Platform[]

const installDir = '/some/install/widget'
const resolvedPackageJson = (): string => `${installDir}/package.json`
const fileAlwaysExists = (): boolean => true
const fileNeverExists = (): boolean => false
const throwingResolver = (): never => {
  throw new Error('Cannot find module widget/package.json')
}

for (const platform of PLATFORMS) {
  test(`resolves to a directly-spawnable command when process.platform is ${platform}`, () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
    try {
      const resolved = resolveScriptBin({
        packageJsonSpecifier: 'widget/package.json',
        binSegments: ['bin', 'widget'],
        resolvePackageJson: resolvedPackageJson,
        fileExists: fileAlwaysExists,
      })

      expect(resolved?.command).toBe(process.execPath)
      expect(resolved?.prefixArgs).toEqual([join(installDir, 'bin', 'widget')])
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })
}

test('resolves to nothing when resolution fails entirely, rather than to a bare command on `PATH`', () => {
  expect(
    resolveScriptBin({
      packageJsonSpecifier: 'widget/package.json',
      binSegments: ['bin', 'widget'],
      resolvePackageJson: throwingResolver,
    }),
  ).toBeUndefined()
})

test('resolves to nothing when the package resolves but its bin script is missing', () => {
  expect(
    resolveScriptBin({
      packageJsonSpecifier: 'widget/package.json',
      binSegments: ['bin', 'widget'],
      resolvePackageJson: resolvedPackageJson,
      fileExists: fileNeverExists,
    }),
  ).toBeUndefined()
})

test('defaults fileExists to the real filesystem check when not supplied', () => {
  expect(
    resolveScriptBin({
      packageJsonSpecifier: 'widget/package.json',
      binSegments: ['bin', 'widget'],
      resolvePackageJson: resolvedPackageJson,
    }),
  ).toBeUndefined()
})

test('joins multi-segment bin paths', () => {
  const resolved = resolveScriptBin({
    packageJsonSpecifier: 'widget/package.json',
    binSegments: ['dist', 'bin', 'widget.js'],
    resolvePackageJson: resolvedPackageJson,
    fileExists: fileAlwaysExists,
  })
  expect(resolved?.prefixArgs).toEqual([join(installDir, 'dist', 'bin', 'widget.js')])
})
