import { createRequire } from 'node:module'
import { expect, test } from 'vitest'
import { resolveKnipBinary, resolveKnipPackageJson } from './resolve-binary.ts'

/**
 * `knip/bin/knip.js` is a `#!/usr/bin/env node` script — confirmed by reading it directly. It is not
 * extensionless the way `oxlint/bin/oxlint` and `typescript/bin/tsc` are, and that difference is
 * *not* a reprieve on Windows: `CreateProcess` needs an executable image, and a `.js` file is no more
 * one than an extensionless script is (npm papers over this with generated `.cmd` shims in
 * `node_modules/.bin`, which is not what module resolution hands back). The same
 * `node <script>` invocation is therefore required, and this matrix pins it on every platform.
 */
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

      expect(resolved.command).toBe(process.execPath)
      expect(resolved.command).not.toMatch(/knip[\\/]bin[\\/]knip\.js$/)
      expect(resolved.prefixArgs).toHaveLength(1)
      expect(resolved.prefixArgs[0]).toMatch(/knip[\\/]bin[\\/]knip\.js$/)
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })
}

test("knip's own exports map does not expose ./package.json, so the naive specifier throws", () => {
  // The trap this package's resolver exists for. `oxlint` has the same shape for its *bin* path but
  // still exports `./package.json`; knip exports only `.` and `./session`, so even the manifest is
  // unreachable by specifier. If a future knip release adds the export this assertion fails, which is
  // the signal to simplify `resolveKnipPackageJson` back to the one-liner the other two adapters use.
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
  expect(resolved.command).toBe(process.execPath)
  expect(resolved.prefixArgs[0]).toMatch(/knip[\\/]bin[\\/]knip\.js$/)
})

test('falls back to the bare "knip" command with no prefix args when resolution fails entirely', () => {
  expect(resolveKnipBinary(throwingResolver)).toEqual({ command: 'knip', prefixArgs: [] })
})

test('falls back to the bare "knip" command when the package resolves but bin/knip.js is missing', () => {
  expect(resolveKnipBinary(resolvedPackageJsonForMissingBin, fileNeverExists)).toEqual({
    command: 'knip',
    prefixArgs: [],
  })
})
