import { expect, test } from 'vitest'
import { resolveScriptBin } from './resolve-script-bin.ts'

/**
 * `oxlint/bin/oxlint` and `typescript/bin/tsc` are both extensionless `#!/usr/bin/env node` scripts.
 * POSIX can spawn either directly because the kernel honours the shebang; Windows cannot — there is
 * no OS-level shebang support, so handing either the bare resolved path fails with ENOENT even though
 * the file exists. The fix is to spawn the script through `process.execPath` instead of asking the OS
 * to interpret the file, and that must hold unconditionally: this function does not (and must not)
 * branch on `process.platform`, because a POSIX-only fast path would silently reintroduce exactly this
 * bug for Windows again without any of the tests here ever noticing.
 *
 * `process.platform` is stubbed per case rather than skipped off-Windows specifically so this guard
 * cannot regress to "only proven on the machine that already works" — mirrors
 * `engine-oxlint/src/resolve-binary.test.ts`'s own platform matrix, now exercising the shared function
 * both adapters actually call.
 */
const PLATFORMS = ['win32', 'darwin', 'linux', 'freebsd'] as const satisfies readonly NodeJS.Platform[]

const resolvedPackageJson = (): string => '/some/install/widget/package.json'
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
        fallbackCommand: 'widget',
        resolvePackageJson: resolvedPackageJson,
        fileExists: fileAlwaysExists,
      })

      expect(resolved.command).toBe(process.execPath)
      expect(resolved.prefixArgs).toEqual(['/some/install/widget/bin/widget'])
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })
}

test('falls back to the bare fallback command with no prefix args when resolution fails entirely', () => {
  expect(
    resolveScriptBin({
      packageJsonSpecifier: 'widget/package.json',
      binSegments: ['bin', 'widget'],
      fallbackCommand: 'widget',
      resolvePackageJson: throwingResolver,
    }),
  ).toEqual({ command: 'widget', prefixArgs: [] })
})

test('falls back to the bare fallback command when the package resolves but its bin script is missing', () => {
  expect(
    resolveScriptBin({
      packageJsonSpecifier: 'widget/package.json',
      binSegments: ['bin', 'widget'],
      fallbackCommand: 'widget',
      resolvePackageJson: resolvedPackageJson,
      fileExists: fileNeverExists,
    }),
  ).toEqual({ command: 'widget', prefixArgs: [] })
})

test('defaults fileExists to the real filesystem check when not supplied', () => {
  // No `fileExists` override: exercises the real `existsSync` default against a path that
  // definitely does not exist, proving the parameter is genuinely optional rather than required
  // in practice by every call site.
  expect(
    resolveScriptBin({
      packageJsonSpecifier: 'widget/package.json',
      binSegments: ['bin', 'widget'],
      fallbackCommand: 'widget',
      resolvePackageJson: resolvedPackageJson,
    }),
  ).toEqual({ command: 'widget', prefixArgs: [] })
})

test('joins multi-segment bin paths', () => {
  const resolved = resolveScriptBin({
    packageJsonSpecifier: 'widget/package.json',
    binSegments: ['dist', 'bin', 'widget.js'],
    fallbackCommand: 'widget',
    resolvePackageJson: resolvedPackageJson,
    fileExists: fileAlwaysExists,
  })
  expect(resolved.prefixArgs).toEqual(['/some/install/widget/dist/bin/widget.js'])
})
