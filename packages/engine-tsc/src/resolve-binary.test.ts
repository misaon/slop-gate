import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { resolveTscBinary } from './resolve-binary.ts'

/**
 * `typescript/bin/tsc`, like `oxlint/bin/oxlint`, is an extensionless `#!/usr/bin/env node` script —
 * confirmed by reading it directly (`node_modules/typescript/bin/tsc` in this repo). POSIX can spawn
 * it directly because the kernel honours the shebang; Windows cannot. Mirrors
 * `engine-oxlint/src/resolve-binary.test.ts`'s own platform matrix, now exercising the shared
 * `resolveScriptBin` (`@misaon/slop-gate-core`) through `resolveTscBinary`'s own defaults.
 */
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
      // Uses this repository's own default resolver (`rootDir` = the monorepo root, which has a real
      // `typescript` install) rather than a stub, so this also proves the default anchor works, not
      // just the platform-matrix branch on its own.
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
  // The engine turns this into a coverage gap naming `npm install -D typescript` (see its
  // `availability()`); what must never happen is a bare `tsc`, which would typecheck against whatever
  // version the machine has instead of the one the developer's own build reports.
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
  // The defining difference from `resolveOxlintBinary`: `typescript` is a peer dependency, resolved
  // relative to `rootDir` (the project being checked), not relative to this module's own location.
  // Proven end to end here with a self-contained fixture package rather than only via injected
  // resolver stubs — a distinct `typescript` install, inside a throwaway directory unrelated to this
  // monorepo, must be what gets found when `rootDir` points at it.
  const fixtureTypescriptDir = join(dir, 'node_modules', 'typescript')
  await mkdir(join(fixtureTypescriptDir, 'bin'), { recursive: true })
  await writeFile(
    join(fixtureTypescriptDir, 'package.json'),
    JSON.stringify({ name: 'typescript', version: '9.9.9', bin: { tsc: './bin/tsc' } }),
  )
  await writeFile(join(fixtureTypescriptDir, 'bin', 'tsc'), '#!/usr/bin/env node\nimport "../lib/typescript.js";\n')

  const resolved = resolveTscBinary(dir)

  // Compared via realpath, not raw string equality: `os.tmpdir()` on macOS returns a `/var/...` path
  // that is itself a symlink to `/private/var/...`, and Node's own module resolution returns the
  // symlink-resolved form — a platform artifact of the fixture location, unrelated to what this test
  // is actually pinning (that resolution is anchored at `dir`, not at this package's own install).
  expect(resolved?.command).toBe(process.execPath)
  expect(resolved?.prefixArgs).toHaveLength(1)
  await expect(realpath(resolved!.prefixArgs[0]!)).resolves.toBe(
    await realpath(join(fixtureTypescriptDir, 'bin', 'tsc')),
  )
})
