import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { Diagnostic } from '../diagnostics/types.ts'
import type { ProjectResultKeyInput, ResultKeyInput } from './keys.ts'
import { openProjectResultStore, openResultStore } from './result-store.ts'

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

const components: ResultKeyInput = {
  engineId: 'oxlint',
  engineVersion: '1.75.0',
  engineRulesetHash: 'abc',
  filePath: 'src/a.ts',
  fileHash: 'def',
  configHash: 'ghi',
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
  await store.set('b'.repeat(64), [diagnostic], components)
  expect(await store.get('b'.repeat(64))).toEqual([diagnostic])
})

test('distinguishes a cached clean result from a miss', async () => {
  const store = openResultStore(cacheDir)
  const key = 'c'.repeat(64)
  await store.set(key, [], components)

  expect(await store.get(key)).toEqual([])
  expect(await store.get('d'.repeat(64))).toBeNull()
})

test('treats a corrupt entry as a miss', async () => {
  const store = openResultStore(cacheDir)
  const key = 'e'.repeat(64)
  await store.set(key, [diagnostic], components)
  await mkdir(join(cacheDir, 'results', key.slice(0, 2)), { recursive: true })
  await writeFile(join(cacheDir, 'results', key.slice(0, 2), `${key}.json`), '{ not json')

  expect(await store.get(key)).toBeNull()
})

test('shards entries by key prefix to keep directories small', async () => {
  const store = openResultStore(cacheDir)
  const key = 'f0'.padEnd(64, '0')
  await store.set(key, [], components)
  const { access } = await import('node:fs/promises')
  await expect(access(join(cacheDir, 'results', 'f0', `${key}.json`))).resolves.toBeUndefined()
})

test('records what produced the entry, so a surprising cache hit can be explained', async () => {
  const store = openResultStore(cacheDir)
  const key = 'g'.repeat(64)
  await store.set(key, [diagnostic], components)

  const raw: unknown = JSON.parse(
    await readFile(join(cacheDir, 'results', key.slice(0, 2), `${key}.json`), 'utf8'),
  )
  expect((raw as { key: ResultKeyInput }).key).toEqual(components)
})

// --- ProjectResultStore: project-granularity engines (spec §8.1/§9) -------------------------------

const projectComponents: ProjectResultKeyInput = {
  engineId: 'tsc',
  engineVersion: '5.9.3',
  engineRulesetHash: 'abc',
  configHash: 'ghi',
  files: [{ path: 'src/a.ts', hash: 'def' }],
}

test('project store returns null for an unknown key', async () => {
  expect(await openProjectResultStore(cacheDir).get('tsc', 'a'.repeat(64))).toBeNull()
})

test('project store round-trips diagnostics keyed by engine and aggregate hash', async () => {
  const store = openProjectResultStore(cacheDir)
  await store.set('tsc', 'b'.repeat(64), [diagnostic], projectComponents)
  expect(await store.get('tsc', 'b'.repeat(64))).toEqual([diagnostic])
})

test('project store distinguishes a cached clean project (whole program, zero findings) from a miss', async () => {
  const store = openProjectResultStore(cacheDir)
  const key = 'c'.repeat(64)
  await store.set('tsc', key, [], projectComponents)

  expect(await store.get('tsc', key)).toEqual([])
  expect(await store.get('tsc', 'd'.repeat(64))).toBeNull()
})

test('project store lays entries out at results/project/<engineId>/<key>.json, per spec §9', async () => {
  const store = openProjectResultStore(cacheDir)
  const key = 'e'.repeat(64)
  await store.set('tsc', key, [], projectComponents)

  const { access } = await import('node:fs/promises')
  await expect(access(join(cacheDir, 'results', 'project', 'tsc', `${key}.json`))).resolves.toBeUndefined()
})

test('project store scopes entries by engine id: the same key under two engines does not collide', async () => {
  const store = openProjectResultStore(cacheDir)
  const key = 'f'.repeat(64)
  await store.set('tsc', key, [diagnostic], projectComponents)
  await store.set('knip', key, [], { ...projectComponents, engineId: 'knip' })

  expect(await store.get('tsc', key)).toEqual([diagnostic])
  expect(await store.get('knip', key)).toEqual([])
})

test('project store treats a corrupt entry as a miss', async () => {
  const store = openProjectResultStore(cacheDir)
  const key = 'a1'.padEnd(64, '0')
  await store.set('tsc', key, [diagnostic], projectComponents)
  await mkdir(join(cacheDir, 'results', 'project', 'tsc'), { recursive: true })
  await writeFile(join(cacheDir, 'results', 'project', 'tsc', `${key}.json`), '{ not json')

  expect(await store.get('tsc', key)).toBeNull()
})

test('project store records what produced the entry, so a surprising cache hit can be explained', async () => {
  const store = openProjectResultStore(cacheDir)
  const key = 'a2'.padEnd(64, '0')
  await store.set('tsc', key, [diagnostic], projectComponents)

  const raw: unknown = JSON.parse(
    await readFile(join(cacheDir, 'results', 'project', 'tsc', `${key}.json`), 'utf8'),
  )
  expect((raw as { key: ProjectResultKeyInput }).key).toEqual(projectComponents)
})
