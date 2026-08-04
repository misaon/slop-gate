import { existsSync } from 'node:fs'
import { basename, join, sep } from 'node:path'
import { expect, test } from 'vitest'
import { resolveAstGrepBinary } from './resolve-binary.ts'

const CLI_MANIFEST = '/repo/node_modules/@ast-grep/cli/package.json'

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
  const invocation = resolveAstGrepBinary()

  expect(invocation?.prefixArgs).toEqual([])
  expect(invocation?.command).not.toBe('ast-grep')
  expect(invocation?.command).toContain(`@ast-grep${sep}cli-`)
  expect(existsSync(invocation!.command)).toBe(true)
})
