import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { resolveToolRoot } from './root.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-mcp-root-'))
  await mkdir(join(dir, 'packages', 'core'), { recursive: true })
  await writeFile(join(dir, 'file.txt'), '')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('no rootDir argument means the directory the server was started in', () => {
  expect(resolveToolRoot(dir, undefined)).toEqual({ kind: 'ok', rootDir: dir })
})

test('a relative path inside the root resolves against it', () => {
  expect(resolveToolRoot(dir, join('packages', 'core'))).toEqual({ kind: 'ok', rootDir: join(dir, 'packages', 'core') })
})

test('the root itself is inside the root', () => {
  expect(resolveToolRoot(dir, '.')).toEqual({ kind: 'ok', rootDir: dir })
})

test('an absolute path inside the root is accepted', () => {
  expect(resolveToolRoot(dir, join(dir, 'packages'))).toEqual({ kind: 'ok', rootDir: join(dir, 'packages') })
})

test('a `..` walk out of the root is refused, and the message says to start a second server', () => {
  const refused = resolveToolRoot(dir, join('..', '..', 'etc'))
  expect(refused.kind).toBe('refused')
  expect(refused.kind === 'refused' && refused.message).toContain('must be inside the directory this server was started in')
  expect(refused.kind === 'refused' && refused.message).toContain('Start a second server')
})

test('an absolute path outside the root is refused', () => {
  expect(resolveToolRoot(join(dir, 'packages'), resolve(dir, 'file.txt')).kind).toBe('refused')
})

test('a sibling directory whose name merely starts with the root is refused', () => {
  // `relative()` from `/a/b` to `/a/bb` is `../bb`. A bare `startsWith('..')` check gets this right
  // by accident and a bare string-prefix check on the paths themselves gets it wrong, so it is
  // pinned: `/a/bb` is not inside `/a/b`.
  expect(resolveToolRoot(join(dir, 'packages'), join(dir, 'packages-elsewhere')).kind).toBe('refused')
})

test('a directory whose name begins with two dots is not mistaken for a walk out', async () => {
  await mkdir(join(dir, '..cache'))
  expect(resolveToolRoot(dir, '..cache')).toEqual({ kind: 'ok', rootDir: join(dir, '..cache') })
})

test('a path that does not exist is refused rather than handed to a run that would fail later', () => {
  const refused = resolveToolRoot(dir, 'nope')
  expect(refused.kind).toBe('refused')
  expect(refused.kind === 'refused' && refused.message).toContain('does not exist')
})

test('a file is refused — a repository root has to be a directory', () => {
  const refused = resolveToolRoot(dir, 'file.txt')
  expect(refused.kind).toBe('refused')
  expect(refused.kind === 'refused' && refused.message).toContain('not a directory')
})
