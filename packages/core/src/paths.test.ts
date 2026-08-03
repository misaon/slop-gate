import { mkdir, mkdtemp, realpath, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { absolutePrefixes, relativePosix, toPosix, toRepoRelative } from './paths.ts'

test('POSIX separators are forced regardless of the host', () => {
  expect(toPosix('packages\\app\\src\\a.ts')).toBe('packages/app/src/a.ts')
  expect(toPosix('packages/app/src/a.ts')).toBe('packages/app/src/a.ts')
})

test('relativePosix relativises and normalises in one step', () => {
  expect(relativePosix('/repo', '/repo/packages/app/src/a.ts')).toBe('packages/app/src/a.ts')
  expect(relativePosix('/repo', '/repo')).toBe('')
})

test('an already-relative path is passed through untouched', () => {
  // The common case, and the reason this is not simply `relativePosix`: every adapter spawns its tool
  // with `cwd: rootDir`, so the tool's own output is already repo-relative — and `relative()` would
  // resolve such a path against `process.cwd()` instead, silently producing a `../../..` path that
  // belongs to whoever ran the process.
  expect(toRepoRelative('src/a.ts', '/repo')).toBe('src/a.ts')
  expect(toRepoRelative('packages\\app\\src\\a.ts', '/repo')).toBe('packages/app/src/a.ts')
})

test('an absolute POSIX path is made repo-relative', () => {
  expect(toRepoRelative('/repo/src/a.ts', '/repo')).toBe('src/a.ts')
})

test('a Windows drive path counts as absolute, on either side', () => {
  // `startsWith('/')` alone would call `C:\repo\src\a.ts` relative and pass a machine-specific path
  // straight through to a fingerprint. Matched case-insensitively because a drive letter is.
  expect(toRepoRelative('C:\\repo\\src\\a.ts', 'C:\\repo')).toBe('src/a.ts')
  expect(toRepoRelative('c:/repo/src/a.ts', 'c:/repo')).toBe('src/a.ts')
})

test('a path outside the root keeps saying so rather than being clamped', () => {
  expect(toRepoRelative('/elsewhere/a.ts', '/repo')).toBe('../elsewhere/a.ts')
})

test('the prefixes include both the directory a run was given and the one a tool would resolve it to', async () => {
  // The case every macOS run hits: `/tmp` is a symlink to `/private/tmp`, so a tool reporting real
  // paths names a directory the run never mentioned. Only the declared form would be stripped.
  const real = await realpath(await mkdtemp(join(tmpdir(), 'sgate-prefixes-')))
  const root = join(real, 'root')
  const link = join(real, 'link')
  await mkdir(root)
  await symlink(root, link)

  expect(await absolutePrefixes({ rootDir: link, tmpDir: root })).toEqual([link, root, root, root])
})

test('a directory that cannot be resolved is skipped rather than raised', async () => {
  const missing = join(tmpdir(), 'sgate-does-not-exist-8f2c')
  expect(await absolutePrefixes({ rootDir: missing, tmpDir: missing })).toEqual([missing, missing])
})
