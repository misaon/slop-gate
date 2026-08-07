import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { EngineError, type EngineConfigHandle, type InventoryFile, type RunContext } from '@misaon/slop-gate-core'
import { createBiomeCssEngine } from './index.ts'

let root: string
let context: RunContext

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'slop-gate-biome-idx-'))
  context = { rootDir: root, tmpDir: join(root, '.slop-gate', 'tmp') }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const file = (path: string): InventoryFile => ({ path, language: 'css', workspace: '', size: 0, mtimeMs: 0 })

async function collect(engine: ReturnType<typeof createBiomeCssEngine>, handle: EngineConfigHandle, paths: string[]) {
  const found = []
  for await (const diagnostic of engine.run({ files: paths.map(file) }, handle, context, new AbortController().signal)) {
    found.push(diagnostic)
  }
  return found
}

test('declares css only, file granularity and no fixes', () => {
  const engine = createBiomeCssEngine()
  expect(engine.id).toBe('biome-css')
  expect(engine.capabilities.languages).toEqual(['css'])
  expect(engine.capabilities.granularity).toBe('file')
  expect(engine.capabilities.fixes).toBe(false)
  expect(engine.capabilities.provides).toEqual([])
})

test('declares no availability probe, being bundled', () => {
  expect(createBiomeCssEngine().availability).toBeUndefined()
})

test('implements neither fix route', () => {
  expect(createBiomeCssEngine().deriveFixes).toBeUndefined()
})

test('reports the installed biome version without its label', async () => {
  const version = await createBiomeCssEngine().version()
  expect(version).toMatch(/^\d+\.\d+\.\d+/)
})

test('an empty batch never spawns anything', async () => {
  const engine = createBiomeCssEngine({ binaryPath: '/nonexistent/biome' })
  const handle = await engine.materializeConfig(new Map([['noDuplicateProperties', ['warn'] as const]]), context)
  await expect(collect(engine, handle, [])).resolves.toEqual([])
  await handle.dispose()
})

test('a missing binary fails with an engine error naming the engine', async () => {
  const engine = createBiomeCssEngine({ binaryPath: join(root, 'not-a-binary') })
  const handle = await engine.materializeConfig(new Map([['noDuplicateProperties', ['warn'] as const]]), context)
  await writeFile(join(root, 'a.css'), 'a { color: red; color: blue }\n', 'utf8')
  await expect(collect(engine, handle, ['a.css'])).rejects.toThrow(EngineError)
  await handle.dispose()
})

test('rejects a config handle it did not materialise', async () => {
  const engine = createBiomeCssEngine()
  const foreign: EngineConfigHandle = { path: join(root, 'x.json'), rulesetHash: 'x', dispose: async () => {} }
  await writeFile(join(root, 'a.css'), 'a { color: red }\n', 'utf8')
  await expect(collect(engine, foreign, ['a.css'])).rejects.toThrow(/did not materialise/)
})

test('finds a real duplicate through the whole adapter', async () => {
  const engine = createBiomeCssEngine()
  const handle = await engine.materializeConfig(new Map([['noDuplicateProperties', ['warn'] as const]]), context)
  const source = 'a {\n  display: flex;\n  display: flex;\n}\n'
  await writeFile(join(root, 'a.css'), source, 'utf8')
  const found = await collect(engine, handle, ['a.css'])
  expect(found).toHaveLength(1)
  expect(found[0]).toMatchObject({ engineRuleId: 'noDuplicateProperties', file: 'a.css', severity: 'warning' })
  expect(source.slice(found[0]!.range.start, found[0]!.range.end)).toBe('display')
  await handle.dispose()
})

test('reports repo-relative paths for a nested stylesheet', async () => {
  const engine = createBiomeCssEngine()
  const handle = await engine.materializeConfig(new Map([['noDuplicateProperties', ['warn'] as const]]), context)
  const nested = join(root, 'web', 'styles')
  await mkdir(nested, { recursive: true })
  await writeFile(join(nested, 'a.css'), 'a {\n  display: flex;\n  display: flex;\n}\n', 'utf8')
  const relative = ['web', 'styles', 'a.css'].join('/')
  const found = await collect(engine, handle, [relative])
  expect(found.map((d) => d.file)).toEqual([relative])
  await handle.dispose()
})

test('converts a finding after an astral character to the right byte offset', async () => {
  const engine = createBiomeCssEngine()
  const handle = await engine.materializeConfig(new Map([['noDuplicateProperties', ['warn'] as const]]), context)
  const source = 'a {\n  content: "😀😀😀";\n  display: flex;\n  display: flex;\n}\n'
  await writeFile(join(root, 'e.css'), source, 'utf8')
  const found = await collect(engine, handle, ['e.css'])
  expect(found).toHaveLength(1)
  const bytes = new TextEncoder().encode(source)
  expect(new TextDecoder().decode(bytes.subarray(found[0]!.range.start, found[0]!.range.end))).toBe('display')
  await handle.dispose()
})

test('a rule not in the selection produces nothing rather than an error', async () => {
  const engine = createBiomeCssEngine()
  const handle = await engine.materializeConfig(new Map([['noDuplicateProperties', ['warn'] as const]]), context)
  await writeFile(join(root, 'a.css'), 'a { color: #fff; }\n', 'utf8')
  await expect(collect(engine, handle, ['a.css'])).resolves.toEqual([])
  await handle.dispose()
})
