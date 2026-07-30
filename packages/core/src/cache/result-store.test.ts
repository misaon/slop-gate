import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { Diagnostic } from '../diagnostics/types.ts'
import { openResultStore } from './result-store.ts'

let cacheDir: string

const diagnostic: Diagnostic = {
  concept: 'correctness.no-debugger',
  ruleId: 'oxlint/no-debugger',
  engine: 'oxlint',
  severity: 'error',
  message: '`debugger` statement is not allowed',
  file: 'src/a.ts',
  range: { start: 10, end: 19 },
  position: { startLine: 2, startColumn: 1, endLine: 2, endColumn: 10 },
  fingerprint: 'deadbeef',
  docsUrl: 'https://example.test',
}

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'sgate-results-'))
})

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true })
})

test('returns null for an unknown key', async () => {
  expect(await openResultStore(cacheDir).get('a'.repeat(64))).toBeNull()
})

test('round-trips diagnostics', async () => {
  const store = openResultStore(cacheDir)
  await store.set('b'.repeat(64), [diagnostic])
  expect(await store.get('b'.repeat(64))).toEqual([diagnostic])
})

test('distinguishes a cached clean result from a miss', async () => {
  const store = openResultStore(cacheDir)
  const key = 'c'.repeat(64)
  await store.set(key, [])

  expect(await store.get(key)).toEqual([])
  expect(await store.get('d'.repeat(64))).toBeNull()
})

test('treats a corrupt entry as a miss', async () => {
  const store = openResultStore(cacheDir)
  const key = 'e'.repeat(64)
  await store.set(key, [diagnostic])
  await mkdir(join(cacheDir, 'results', key.slice(0, 2)), { recursive: true })
  await writeFile(join(cacheDir, 'results', key.slice(0, 2), `${key}.json`), '{ not json')

  expect(await store.get(key)).toBeNull()
})

test('shards entries by key prefix to keep directories small', async () => {
  const store = openResultStore(cacheDir)
  const key = 'f0'.padEnd(64, '0')
  await store.set(key, [])
  const { access } = await import('node:fs/promises')
  await expect(access(join(cacheDir, 'results', 'f0', `${key}.json`))).resolves.toBeUndefined()
})
