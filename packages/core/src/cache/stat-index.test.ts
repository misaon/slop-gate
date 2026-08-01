import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { InventoryFile } from '../discovery/types.ts'
import { openStatIndex } from './stat-index.ts'

let dir: string
let cacheDir: string

const fileEntry = async (relative: string): Promise<InventoryFile> => {
  const stats = await stat(join(dir, relative))
  return { path: relative, language: 'ts', workspace: '', size: stats.size, mtimeMs: stats.mtimeMs }
}

/**
 * Reads the clock an hour ahead so files written moments ago register as long settled. Every test
 * asserting a *stat* decision must inject this: on the default clock a fixture file is always inside
 * the racy window, so the index re-reads it no matter what its size and mtime say, and an assertion
 * about size/mtime handling would pass without ever exercising the comparison it names.
 */
const longAfterWriting = (): number => Date.now() + 3_600_000

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-stat-'))
  cacheDir = join(dir, '.slop-gate', 'cache')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('hashes a file on first sight', async () => {
  await writeFile(join(dir, 'a.ts'), 'const a = 1\n')
  const index = await openStatIndex(cacheDir)
  const hash = await index.hashOf(dir, await fileEntry('a.ts'))

  expect(hash).toMatch(/^[0-9a-f]{64}$/)
  expect(index.rehashCount()).toBe(1)
})

test('reuses the stored hash when size and mtime are unchanged', async () => {
  await writeFile(join(dir, 'a.ts'), 'const a = 1\n')
  const first = await openStatIndex(cacheDir, longAfterWriting)
  const entry = await fileEntry('a.ts')
  const hash = await first.hashOf(dir, entry)
  await first.persist()

  const second = await openStatIndex(cacheDir, longAfterWriting)
  expect(await second.hashOf(dir, entry)).toBe(hash)
  expect(second.rehashCount()).toBe(0)
})

test('re-reads a file written inside the racy window even when size and mtime both match', async () => {
  // The stat fast path's failure mode, reproduced without depending on filesystem timestamp
  // granularity: an identical `(size, mtimeMs)` pair is fed to a second index, which is exactly what
  // a coarse-grained filesystem reports after a same-length edit. Trusting it would serve the
  // previous content's hash. On the default clock the file has just been written, so it must not be.
  await writeFile(join(dir, 'a.ts'), 'const a = 1\n')
  const first = await openStatIndex(cacheDir, longAfterWriting)
  const entry = await fileEntry('a.ts')
  const stale = await first.hashOf(dir, entry)
  await first.persist()

  await writeFile(join(dir, 'a.ts'), 'const a = 2\n')
  const second = await openStatIndex(cacheDir)

  expect(await second.hashOf(dir, entry)).not.toBe(stale)
  expect(second.rehashCount()).toBe(1)
})

test('rehashes when the content changes', async () => {
  await writeFile(join(dir, 'a.ts'), 'const a = 1\n')
  const index = await openStatIndex(cacheDir)
  const before = await index.hashOf(dir, await fileEntry('a.ts'))

  await writeFile(join(dir, 'a.ts'), 'const a = 2\n')
  const after = await index.hashOf(dir, await fileEntry('a.ts'))

  expect(after).not.toBe(before)
  expect(index.rehashCount()).toBe(2)
})

test('rehashes when size matches but mtime moved', async () => {
  // Settled clock deliberately: on the default one the fixture is inside the racy window and the
  // second call re-reads for that reason alone, so this would assert nothing about mtime at all.
  await writeFile(join(dir, 'a.ts'), 'const a = 1\n')
  const index = await openStatIndex(cacheDir, longAfterWriting)
  const entry = await fileEntry('a.ts')
  await index.hashOf(dir, entry)

  await index.hashOf(dir, { ...entry, mtimeMs: entry.mtimeMs + 1000 })
  expect(index.rehashCount()).toBe(2)
})

test('starts empty when the cache directory does not exist', async () => {
  const index = await openStatIndex(join(dir, 'missing', 'cache'))
  await writeFile(join(dir, 'a.ts'), 'x')
  expect(await index.hashOf(dir, await fileEntry('a.ts'))).toMatch(/^[0-9a-f]{64}$/)
})

test('survives a corrupt index file', async () => {
  await writeFile(join(dir, 'a.ts'), 'x')
  const index = await openStatIndex(cacheDir)
  await index.hashOf(dir, await fileEntry('a.ts'))
  await index.persist()
  await writeFile(join(cacheDir, 'stat-index.json'), '{ not json')

  const reopened = await openStatIndex(cacheDir)
  expect(await reopened.hashOf(dir, await fileEntry('a.ts'))).toMatch(/^[0-9a-f]{64}$/)
})
