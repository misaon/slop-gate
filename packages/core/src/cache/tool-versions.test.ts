import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { openToolVersionCache } from './tool-versions.ts'

let dir: string
let cacheDir: string
let binary: string

const backdate = async (path: string): Promise<void> => {
  const past = new Date(Date.now() - 3_600_000)
  await utimes(path, past, past)
}

const write = async (content: string): Promise<void> => {
  await writeFile(binary, content)
  await backdate(binary)
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-versions-'))
  cacheDir = join(dir, '.slop-gate', 'cache')
  binary = join(dir, 'tool')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('probes on first sight', async () => {
  await write('#!/bin/sh\n')
  const cache = await openToolVersionCache(cacheDir)

  await expect(cache.resolve([binary], async () => '1.2.3')).resolves.toBe('1.2.3')
  expect(cache.probeCount()).toBe(1)
})

test('serves the stored version across processes when the binary is unchanged', async () => {
  await write('#!/bin/sh\n')
  const first = await openToolVersionCache(cacheDir)
  await first.resolve([binary], async () => '1.2.3')
  await first.persist()

  const second = await openToolVersionCache(cacheDir)
  await expect(second.resolve([binary], async () => {
      throw new Error('must not spawn')
    })).resolves.toBe('1.2.3')
  expect(second.probeCount()).toBe(0)
})

test('re-probes when the binary is replaced with one of a different size', async () => {
  await write('#!/bin/sh\n')
  const first = await openToolVersionCache(cacheDir)
  await first.resolve([binary], async () => '1.2.3')
  await first.persist()

  await write('#!/bin/sh\nlonger\n')
  const second = await openToolVersionCache(cacheDir)
  await expect(second.resolve([binary], async () => '2.0.0')).resolves.toBe('2.0.0')
  expect(second.probeCount()).toBe(1)
})

test('re-probes when a same-size replacement kept the mtime, because the inode moved', async () => {
  await write('#!/bin/sh\nAAA\n')
  const first = await openToolVersionCache(cacheDir)
  await first.resolve([binary], async () => '1.2.3')
  await first.persist()

  await rm(binary)
  await write('#!/bin/sh\nBBB\n')
  const second = await openToolVersionCache(cacheDir)
  await expect(second.resolve([binary], async () => '2.0.0')).resolves.toBe('2.0.0')
})

test('re-probes a binary written inside the racy window even when its identity matches', async () => {
  await write('#!/bin/sh\n')
  const first = await openToolVersionCache(cacheDir)
  await first.resolve([binary], async () => '1.2.3')
  await first.persist()

  const now = new Date()
  await utimes(binary, now, now)

  const second = await openToolVersionCache(cacheDir)
  await expect(second.resolve([binary], async () => '2.0.0')).resolves.toBe('2.0.0')
  expect(second.probeCount()).toBe(1)
})

test('keys on the whole invocation, so two scripts run through one Node do not collide', async () => {
  const oxlint = join(dir, 'oxlint.js')
  const tsc = join(dir, 'tsc.js')
  await writeFile(oxlint, 'a')
  await writeFile(tsc, 'b')
  await backdate(oxlint)
  await backdate(tsc)

  const cache = await openToolVersionCache(cacheDir)
  await expect(cache.resolve([process.execPath, oxlint], async () => '1.2.3')).resolves.toBe('1.2.3')
  await expect(cache.resolve([process.execPath, tsc], async () => '5.9.3')).resolves.toBe('5.9.3')
  await cache.persist()

  const reopened = await openToolVersionCache(cacheDir)
  await expect(reopened.resolve([process.execPath, tsc], async () => 'wrong')).resolves.toBe('5.9.3')
})

test('re-probes when the script changes but the interpreter does not', async () => {
  const script = join(dir, 'tool.js')
  await writeFile(script, 'a')
  await backdate(script)

  const first = await openToolVersionCache(cacheDir)
  await first.resolve([process.execPath, script], async () => '1.2.3')
  await first.persist()

  await writeFile(script, 'bb')
  await backdate(script)
  const second = await openToolVersionCache(cacheDir)
  await expect(second.resolve([process.execPath, script], async () => '2.0.0')).resolves.toBe('2.0.0')
})

test('probes, and stores nothing, when the binary cannot be stat-ed', async () => {
  const cache = await openToolVersionCache(cacheDir)
  await expect(cache.resolve([join(dir, 'absent')], async () => '1.2.3')).resolves.toBe('1.2.3')
  await cache.persist()

  const reopened = await openToolVersionCache(cacheDir)
  await expect(reopened.resolve([join(dir, 'absent')], async () => '2.0.0')).resolves.toBe('2.0.0')
})

test('caches nothing when the probe throws', async () => {
  await write('#!/bin/sh\n')
  const cache = await openToolVersionCache(cacheDir)
  await expect(
    cache.resolve([binary], async () => {
      throw new Error('boom')
    }),
  ).rejects.toThrow('boom')

  await expect(cache.resolve([binary], async () => '1.2.3')).resolves.toBe('1.2.3')
})

test('starts empty when the cache directory does not exist', async () => {
  await write('#!/bin/sh\n')
  const cache = await openToolVersionCache(join(dir, 'missing', 'cache'))
  await expect(cache.resolve([binary], async () => '1.2.3')).resolves.toBe('1.2.3')
})

test('survives a corrupt cache file', async () => {
  await write('#!/bin/sh\n')
  const cache = await openToolVersionCache(cacheDir)
  await cache.resolve([binary], async () => '1.2.3')
  await cache.persist()
  await writeFile(join(cacheDir, 'tool-versions.json'), '{ not json')

  const reopened = await openToolVersionCache(cacheDir)
  await expect(reopened.resolve([binary], async () => '2.0.0')).resolves.toBe('2.0.0')
})
