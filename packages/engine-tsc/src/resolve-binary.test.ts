import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { ScriptBinInvocation } from '@misaon/slop-gate-core'
import { resolveTscAcrossWorkspaces, resolveTscBinary } from './resolve-binary.ts'

const PLATFORMS = ['win32', 'darwin', 'linux', 'freebsd'] as const satisfies readonly NodeJS.Platform[]

const throwingResolver = (): never => {
  throw new Error('Cannot find module typescript/package.json')
}
const resolvedPackageJsonForMissingBin = (): string => '/some/install/typescript/package.json'
const fileNeverExists = (): boolean => false

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-tsc-resolve-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

for (const platform of PLATFORMS) {
  test(`resolves to a directly-spawnable command (not the bare script path) when process.platform is ${platform}`, () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
    try {
      const resolved = resolveTscBinary(process.cwd())

      expect(resolved?.command).toBe(process.execPath)
      expect(resolved?.command).not.toMatch(/typescript[\\/]bin[\\/]tsc$/)
      expect(resolved?.prefixArgs).toHaveLength(1)
      expect(resolved?.prefixArgs[0]).toMatch(/typescript[\\/]bin[\\/]tsc$/)
    } finally {
      Object.defineProperty(process, 'platform', original)
    }
  })
}

test('resolves to nothing when the project has no `typescript`, rather than to a `tsc` on PATH', () => {
  expect(resolveTscBinary(dir, throwingResolver)).toBeUndefined()
})

test('resolves to nothing when the package resolves but bin/tsc itself is missing', () => {
  expect(resolveTscBinary(dir, resolvedPackageJsonForMissingBin, fileNeverExists)).toBeUndefined()
})

test('resolves the real installed typescript package to its bin/tsc script', () => {
  const resolved = resolveTscBinary(process.cwd())
  expect(resolved?.command).toBe(process.execPath)
  expect(resolved?.prefixArgs[0]).toMatch(/typescript[\\/]bin[\\/]tsc$/)
})

test('resolves the analysed project’s own typescript install, not wherever this package is installed', async () => {
  const fixtureTypescriptDir = join(dir, 'node_modules', 'typescript')
  await mkdir(join(fixtureTypescriptDir, 'bin'), { recursive: true })
  await writeFile(
    join(fixtureTypescriptDir, 'package.json'),
    JSON.stringify({ name: 'typescript', version: '9.9.9', bin: { tsc: './bin/tsc' } }),
  )
  await writeFile(join(fixtureTypescriptDir, 'bin', 'tsc'), '#!/usr/bin/env node\nimport "../lib/typescript.js";\n')

  const resolved = resolveTscBinary(dir)

  expect(resolved?.command).toBe(process.execPath)
  expect(resolved?.prefixArgs).toHaveLength(1)
  await expect(realpath(resolved!.prefixArgs[0]!)).resolves.toBe(
    await realpath(join(fixtureTypescriptDir, 'bin', 'tsc')),
  )
})

const invocationIn = (packageDir: string): ScriptBinInvocation => ({
  command: process.execPath,
  prefixArgs: [join(packageDir, 'node_modules', 'typescript', 'bin', 'tsc')],
})

test('resolves from a workspace package when the root manifest declares no typescript', () => {
  const resolution = resolveTscAcrossWorkspaces(
    '/repo',
    ['apps/api', 'packages/utils'],
    (from) => (from === '/repo' ? undefined : invocationIn(from)),
    () => '5.9.3',
  )

  expect(resolution).toEqual({ kind: 'resolved', invocation: invocationIn('apps/api'), version: '5.9.3', fromDir: 'apps/api' })
})

test('prefers the root install over any workspace package, so a pinned root wins', () => {
  const resolution = resolveTscAcrossWorkspaces('/repo', ['apps/api'], (from) => invocationIn(from), () => '5.9.3')

  expect(resolution).toMatchObject({ kind: 'resolved', fromDir: '/repo' })
})

test('refuses to choose when workspace packages disagree on the version', () => {
  const versions: Record<string, string> = {
    [join('apps/api', 'node_modules', 'typescript', 'bin', 'tsc')]: '5.9.3',
    [join('apps/web', 'node_modules', 'typescript', 'bin', 'tsc')]: '7.0.2',
  }

  const resolution = resolveTscAcrossWorkspaces(
    '/repo',
    ['apps/web', 'apps/api'],
    (from) => (from === '/repo' ? undefined : invocationIn(from)),
    (invocation) => versions[invocation.prefixArgs[0]!],
  )

  expect(resolution).toEqual({ kind: 'ambiguous', versions: ['5.9.3', '7.0.2'] })
})

test('reports missing when neither the root nor any workspace package has typescript', () => {
  expect(resolveTscAcrossWorkspaces('/repo', ['apps/api'], () => undefined, () => undefined)).toEqual({ kind: 'missing' })
})

test('resolves this repository from a workspace package with no stubbing at all', () => {
  const resolution = resolveTscAcrossWorkspaces(join(process.cwd(), 'packages', 'engine-tsc'), [])

  expect(resolution).toMatchObject({ kind: 'resolved' })
  expect(resolution.kind === 'resolved' && resolution.version).toMatch(/^\d+\.\d+\.\d+/)
})
