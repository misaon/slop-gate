import { existsSync } from 'node:fs'
import { basename, join, sep } from 'node:path'
import { expect, test } from 'vitest'
import { resolveAstGrepBinary } from './resolve-binary.ts'

const CLI_MANIFEST = '/repo/node_modules/@ast-grep/cli/package.json'

/**
 * Expected paths are composed with `join`/`basename` rather than written with literal slashes,
 * because the separator belongs to the *host* running the tests, not to the platform being stubbed:
 * `resolveAstGrepBinary` calls the real `node:path`, so a Windows runner yields backslashes no matter
 * what `platform` is set to here. A literal `/repo/...` asserts the runner's separator instead of the
 * behaviour and fails everywhere on Windows — which is how this file first went red, and is the third
 * time this repository has made the mistake.
 */
const at = (...segments: readonly string[]): string => join('/repo', 'node_modules', ...segments)

const stubs = (overrides: Parameters<typeof resolveAstGrepBinary>[0] = {}) => ({
  platform: 'darwin',
  arch: 'arm64',
  isGlibc: () => true,
  resolveCliPackageJson: () => CLI_MANIFEST,
  resolveFromCli: (specifier: string) => `/repo/node_modules/.pnpm/${specifier.split('/')[1]}/${specifier}`,
  fileExists: () => true,
  ...overrides,
})

test('resolves the platform package binary and spawns it directly, with no node prefix', () => {
  // The whole reason this adapter does not use `resolveScriptBin`: the file it resolves is a native
  // executable, and `node <mach-o file>` fails. See resolve-binary.ts for why the *other* candidate
  // path (`@ast-grep/cli/ast-grep`) is a native binary or a JS shim depending on whether a
  // lifecycle script ran, which pnpm 10 blocks by default.
  const invocation = resolveAstGrepBinary(stubs())

  expect(invocation?.prefixArgs).toEqual([])
  expect(invocation?.command).toBe(at('.pnpm', 'cli-darwin-arm64', '@ast-grep', 'cli-darwin-arm64', 'ast-grep'))
})

test('asks for the .exe on windows', () => {
  const invocation = resolveAstGrepBinary(stubs({ platform: 'win32', arch: 'x64' }))
  expect(basename(invocation!.command)).toBe('ast-grep.exe')
  expect(invocation!.command).toContain('cli-win32-x64-msvc')
})

test('falls back to PATH on musl linux, where upstream publishes no build at all', () => {
  // The `-gnu` optional dependency still *installs* on musl — its `os`/`cpu` constraints match, and
  // libc is not expressible there — so the binary is present and unrunnable. Upstream's own
  // postinstall makes the same libc check for the same reason.
  const invocation = resolveAstGrepBinary(stubs({ platform: 'linux', arch: 'x64', isGlibc: () => false }))
  expect(invocation).toEqual({ command: 'ast-grep', prefixArgs: [] })
})

test('uses the gnu build on glibc linux', () => {
  expect(resolveAstGrepBinary(stubs({ platform: 'linux', arch: 'arm64' }))?.command).toContain('cli-linux-arm64-gnu')
})

test('falls back to PATH for a platform upstream does not publish', () => {
  expect(resolveAstGrepBinary(stubs({ platform: 'freebsd', arch: 'x64' }))).toEqual({
    command: 'ast-grep',
    prefixArgs: [],
  })
})

test('resolves to nothing when the optional dependency was never installed', () => {
  // A supported platform whose platform package is absent is a broken install of a package this one
  // bundles, not a platform upstream left out — so a bare `ast-grep` here would be an unknown version
  // standing in for the pinned one. The two cases above keep the fallback; this one does not.
  const invocation = resolveAstGrepBinary(
    stubs({
      resolveFromCli: () => {
        throw new Error('MODULE_NOT_FOUND')
      },
    }),
  )
  expect(invocation).toBeUndefined()
})

test('resolves to nothing when the platform package resolves but its binary is missing', () => {
  expect(resolveAstGrepBinary(stubs({ fileExists: () => false }))).toBeUndefined()
})

test('resolves the real installed binary from this package, and it exists on disk', () => {
  // The unstubbed path, which is the one that actually matters and the one every stub above is a
  // model of. Also pins the pnpm-specific half: the platform package is a dependency of
  // `@ast-grep/cli` and is *not* reachable from this package's own directory under pnpm's layout,
  // so resolution has to be anchored at the CLI's directory rather than at ours.
  const invocation = resolveAstGrepBinary()

  expect(invocation?.prefixArgs).toEqual([])
  expect(invocation?.command).not.toBe('ast-grep')
  expect(invocation?.command).toContain(`@ast-grep${sep}cli-`)
  expect(existsSync(invocation!.command)).toBe(true)
})
