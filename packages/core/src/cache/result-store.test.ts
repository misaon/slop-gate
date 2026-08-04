import { globSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { Diagnostic } from '../diagnostics/types.ts'
import type { ProjectResultKeyInput, ResultKeyInput } from './keys.ts'
import { openProjectResultStore, openResultStore } from './result-store.ts'

let cacheDir: string

const diagnostic: Diagnostic = {
  concept: 'correctness.no-debugger',
  ruleRefKey: 'oxlint/no-debugger',
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

const K = (c: string): string => c.repeat(64)
const filesIn = (): readonly string[] => globSync('**/*', { cwd: cacheDir }).filter((p) => p.endsWith('.json'))

test('returns null for an unknown key', async () => {
  expect(await openResultStore(cacheDir).get('oxlint', K('a'))).toBeNull()
})

test('round-trips diagnostics through a persist and a fresh store', async () => {
  const store = openResultStore(cacheDir)
  await store.set('oxlint', K('b'), [diagnostic], components)
  await store.persist()

  expect(await openResultStore(cacheDir).get('oxlint', K('b'))).toEqual([diagnostic])
})

test('nothing reaches disk before persist, so a crashed run leaves no half-written cache', async () => {
  const store = openResultStore(cacheDir)
  await store.set('oxlint', K('b'), [diagnostic], components)

  expect(filesIn()).toEqual([])
})

test('distinguishes a cached clean result from a miss', async () => {
  const store = openResultStore(cacheDir)
  await store.set('oxlint', K('c'), [], components)
  await store.persist()

  const reopened = openResultStore(cacheDir)
  expect(await reopened.get('oxlint', K('c'))).toEqual([])
  expect(await reopened.get('oxlint', K('d'))).toBeNull()
})

test('one file per engine, whatever the number of entries — the whole point of the layout', async () => {
  const store = openResultStore(cacheDir)
  for (let i = 0; i < 50; i += 1) await store.set('oxlint', K(String.fromCodePoint(97 + (i % 26))) + i, [], components)
  await store.set('astgrep', K('z'), [], components)
  await store.persist()

  expect(filesIn().toSorted()).toEqual([join('results', 'astgrep.json'), join('results', 'oxlint.json')])
})

test("one engine's entries are untouched by another engine's write", async () => {
  const store = openResultStore(cacheDir)
  await store.set('oxlint', K('a'), [diagnostic], components)
  await store.set('astgrep', K('b'), [], components)
  await store.persist()

  const reopened = openResultStore(cacheDir)
  expect(await reopened.get('oxlint', K('a'))).toEqual([diagnostic])
  expect(await reopened.get('astgrep', K('b'))).toEqual([])
})

test('two runs over the same entries produce byte-identical files', async () => {
  const write = async (order: readonly string[]): Promise<string> => {
    await rm(join(cacheDir, 'results'), { recursive: true, force: true })
    const store = openResultStore(cacheDir)
    for (const key of order) await store.set('oxlint', key, [diagnostic], components)
    await store.persist()
    return readFile(join(cacheDir, 'results', 'oxlint.json'), 'utf8')
  }

  expect(await write([K('a'), K('b'), K('c')])).toBe(await write([K('c'), K('a'), K('b')]))
})

test('treats a corrupt engine file as an empty cache, never as partially valid', async () => {
  const store = openResultStore(cacheDir)
  await store.set('oxlint', K('e'), [diagnostic], components)
  await store.persist()
  await writeFile(join(cacheDir, 'results', 'oxlint.json'), '{ not json')

  expect(await openResultStore(cacheDir).get('oxlint', K('e'))).toBeNull()
})

test('records what produced each entry, so a surprising cache hit can be explained', async () => {
  const store = openResultStore(cacheDir)
  await store.set('oxlint', K('g'), [diagnostic], components)
  await store.persist()

  const raw: unknown = JSON.parse(await readFile(join(cacheDir, 'results', 'oxlint.json'), 'utf8'))
  expect((raw as { entries: Record<string, { key: ResultKeyInput }> }).entries[K('g')]?.key).toEqual(components)
})

const projectComponents: ProjectResultKeyInput = {
  engineId: 'tsc',
  engineVersion: '5.9.3',
  engineRulesetHash: 'abc',
  configHash: 'ghi',
  files: [{ path: 'src/a.ts', hash: 'def' }],
}

test('project store returns null for an unknown key', async () => {
  expect(await openProjectResultStore(cacheDir).get('tsc', K('a'))).toBeNull()
})

test('project store round-trips diagnostics keyed by engine and aggregate hash', async () => {
  const store = openProjectResultStore(cacheDir)
  await store.set('tsc', K('b'), [diagnostic], projectComponents)
  await store.persist()

  expect(await openProjectResultStore(cacheDir).get('tsc', K('b'))).toEqual([diagnostic])
})

test('project store distinguishes a cached clean project from a miss', async () => {
  const store = openProjectResultStore(cacheDir)
  await store.set('tsc', K('c'), [], projectComponents)
  await store.persist()

  const reopened = openProjectResultStore(cacheDir)
  expect(await reopened.get('tsc', K('c'))).toEqual([])
  expect(await reopened.get('tsc', K('d'))).toBeNull()
})

test('project store keeps its own subdirectory, so an engine doing both cannot collide with itself', async () => {
  const perFile = openResultStore(cacheDir)
  const perProject = openProjectResultStore(cacheDir)
  await perFile.set('tsc', K('a'), [diagnostic], components)
  await perProject.set('tsc', K('a'), [], projectComponents)
  await perFile.persist()
  await perProject.persist()

  expect(await openResultStore(cacheDir).get('tsc', K('a'))).toEqual([diagnostic])
  expect(await openProjectResultStore(cacheDir).get('tsc', K('a'))).toEqual([])
})
