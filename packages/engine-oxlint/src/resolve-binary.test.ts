import { expect, test } from 'vitest'
import { resolveOxlintBinary } from './resolve-binary.ts'

/**
 * `oxlint/bin/oxlint` is an extensionless `#!/usr/bin/env node` script. POSIX can spawn it directly
 * because the kernel honours the shebang; Windows cannot — there is no OS-level shebang support, so
 * handing it the bare resolved path fails with ENOENT even though the file exists (see
 * resolve-binary.ts's doc comment and the report for the full chain of evidence). The fix is to
 * spawn the script through `process.execPath` instead of asking the OS to interpret the file, and
 * that must hold unconditionally — this function does not (and must not) branch on `process.platform`,
 * because a POSIX-only fast path would silently reintroduce exactly this bug for Windows again
 * without any of the tests that run here ever noticing.
 *
 * `process.platform` is stubbed per case rather than skipped off-Windows specifically so this guard
 * cannot regress to "only proven on the machine that already works": if a future change reintroduces
 * a `process.platform === 'win32'` branch, stubbing each of these values in turn exercises exactly
 * that branch from this POSIX test runner and would fail the same way real Windows CI would.
 */
const PLATFORMS = ['win32', 'darwin', 'linux', 'freebsd'] as const satisfies readonly NodeJS.Platform[]

/** Forces the branch `resolveOxlintBinary` takes when oxlint isn't resolvable from here at all. */
const throwingResolver = (): never => {
  throw new Error('Cannot find module oxlint/package.json')
}

/** Simulates a resolvable `oxlint` package whose `bin/oxlint` file is itself missing on disk. */
const resolvedPackageJsonForMissingBin = (): string => '/some/install/oxlint/package.json'
const fileNeverExists = (): boolean => false

for (const platform of PLATFORMS) {
  test(`resolves to a directly-spawnable command (not the bare script path) when process.platform is ${platform}`, () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
    try {
      const resolved = resolveOxlintBinary()

      // The command must be a real, directly-executable binary — `process.execPath` always is, on
      // every platform (it is how Node itself was launched) — never the raw, extensionless
      // `oxlint/bin/oxlint` script path, which is exactly what broke on Windows.
      expect(resolved.command).toBe(process.execPath)
      expect(resolved.command).not.toMatch(/oxlint[\\/]bin[\\/]oxlint$/)

      // The resolved script is passed as an argument to that command, not spawned on its own.
      expect(resolved.prefixArgs).toHaveLength(1)
      expect(resolved.prefixArgs[0]).toMatch(/oxlint[\\/]bin[\\/]oxlint$/)
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })
}

test('falls back to the bare "oxlint" command with no prefix args when resolution fails entirely', () => {
  // Uses the injectable resolver parameter to force the fallback rather than actually uninstalling
  // oxlint or mocking node:module — see resolve-binary.ts's doc comment for why the fallback stays an
  // unprefixed bare command: unlike the resolved case, we don't know what "oxlint" refers to here
  // (global install, shim, alias, ...), so there is nothing to safely wrap with `process.execPath`.
  expect(resolveOxlintBinary(throwingResolver)).toEqual({ command: 'oxlint', prefixArgs: [] })
})

test('falls back to the bare "oxlint" command when the package resolves but bin/oxlint itself is missing', () => {
  // Regression pin for a gap the `node <script>` strategy itself introduces (see resolve-binary.ts's
  // doc comment): Node's own "cannot find module" launch failure exits with the *numeric* code `1`,
  // colliding with oxlint's "exited 1 because it found lint issues" convention. Without this
  // existence check, a corrupted install (package.json resolves, bin/oxlint does not) would silently
  // report "zero findings" instead of a genuine EngineError.
  expect(resolveOxlintBinary(resolvedPackageJsonForMissingBin, fileNeverExists)).toEqual({
    command: 'oxlint',
    prefixArgs: [],
  })
})

test('resolves the real installed oxlint package to its bin/oxlint script', () => {
  // Integration-flavoured sanity check with the real, default resolver (no stubbing): pins that the
  // resolved script path actually ends where oxlint's own package.json says its `bin` entry lives,
  // so the platform-matrix tests above aren't accidentally asserting a stubbed-away tautology.
  const resolved = resolveOxlintBinary()
  expect(resolved.command).toBe(process.execPath)
  expect(resolved.prefixArgs[0]).toMatch(/oxlint[\\/]bin[\\/]oxlint$/)
})
