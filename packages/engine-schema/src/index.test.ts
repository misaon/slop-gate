import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { EngineRuleSelection, InventoryFile, RawDiagnostic, RunContext } from '@misaon/slop-gate-core'
import { SCHEMA_RULE_IDS, createSchemaEngine } from './index.ts'

let dir: string
let context: RunContext

const ALL: EngineRuleSelection = new Map(SCHEMA_RULE_IDS.map((rule) => [rule, ['error'] as const]))

const file = (path: string, language: InventoryFile['language'] = 'yaml'): InventoryFile => ({
  path,
  language,
  workspace: '',
  size: 0,
  mtimeMs: 0,
})

const collect = async (iterable: AsyncIterable<RawDiagnostic>): Promise<RawDiagnostic[]> => {
  const out: RawDiagnostic[] = []
  for await (const item of iterable) out.push(item)
  return out
}

const run = async (paths: readonly InventoryFile[], selection: EngineRuleSelection = ALL) => {
  const engine = createSchemaEngine()
  const handle = await engine.materializeConfig(selection, context)
  try {
    return await collect(engine.run({ files: paths }, handle, context, AbortSignal.timeout(30_000)))
  } finally {
    await handle.dispose()
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-schema-'))
  context = { rootDir: dir, tmpDir: join(dir, '.slop-gate', 'tmp') }
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('reports a version covering both its own release and the vendored schemas', async () => {
  expect(await createSchemaEngine().version()).toMatch(/^\d+\.\d+\.\d+\+schemas\.[0-9a-f]{12}$/)
})

test('declares file granularity over YAML and workflows, and offers no fixes', () => {
  const engine = createSchemaEngine()

  expect(engine.id).toBe('schema')
  expect(engine.capabilities.granularity).toBe('file')
  expect(engine.capabilities.languages).toEqual(['yaml', 'github-workflow'])
  expect(engine.capabilities.fixes).toBe(false)
  expect(engine.capabilities.provides).toEqual([])
})

test('finds a duplicate key in a real file', async () => {
  await writeFile(join(dir, 'config.yaml'), 'a: 1\nb: 2\na: 3\n')

  const found = await run([file('config.yaml')])

  expect(found).toHaveLength(1)
  expect(found[0]?.engineRuleId).toBe('duplicate-mapping-key')
  expect(found[0]?.file).toBe('config.yaml')
})

test('finds a compose violation in a real compose file, with a docs link', async () => {
  await writeFile(join(dir, 'compose.yaml'), 'services:\n  web:\n    imge: nginx\n')

  const found = await run([file('compose.yaml')])

  expect(found).toHaveLength(1)
  expect(found[0]?.engineRuleId).toBe('compose-spec')
  expect(found[0]?.message).toContain('imge')
  expect(found[0]?.docsUrl).toContain('compose-spec')
})

test('applies the schema only to files bound to one', async () => {
  await writeFile(join(dir, 'values.yaml'), 'services:\n  web:\n    imge: nginx\n')

  expect(await run([file('values.yaml')])).toEqual([])
})

test('finds a file inside a nested directory', async () => {
  await mkdir(join(dir, 'deploy', 'staging'), { recursive: true })
  await writeFile(join(dir, 'deploy', 'staging', 'docker-compose.yml'), 'servcies: {}\n')

  const found = await run([file('deploy/staging/docker-compose.yml')])

  expect(found).toHaveLength(1)
  expect(found[0]?.file).toBe('deploy/staging/docker-compose.yml')
})

test('checks the structure of workflow files, which are YAML before they are workflows', async () => {
  await mkdir(join(dir, '.github', 'workflows'), { recursive: true })
  await writeFile(join(dir, '.github', 'workflows', 'ci.yml'), 'on: push\njobs:\n  a: {}\njobs:\n  b: {}\n')

  const found = await run([file('.github/workflows/ci.yml', 'github-workflow')])

  expect(found.map((diagnostic) => diagnostic.engineRuleId)).toEqual(['duplicate-mapping-key'])
})

test('reports byte offsets, not string offsets, when the file contains multi-byte characters', async () => {
  const source = 'note: "café → ☕"\ndup: 1\ndup: 2\n'
  await writeFile(join(dir, 'config.yaml'), source)

  const [found] = await run([file('config.yaml')])

  const bytes = new TextEncoder().encode(source)
  const slice = new TextDecoder().decode(bytes.subarray(found!.range.start, found!.range.end))
  expect(slice).toBe('dup')
})

test('reports nothing for a rule the selection leaves out', async () => {
  await writeFile(join(dir, 'compose.yaml'), 'name: app\nname: other\nservcies: {}\n')

  const onlySchema = await run([file('compose.yaml')], new Map([['compose-spec', ['error'] as const]]))
  expect(onlySchema.map((diagnostic) => diagnostic.engineRuleId)).toEqual(['compose-spec'])

  const onlyDuplicates = await run([file('compose.yaml')], new Map([['duplicate-mapping-key', ['error'] as const]]))
  expect(onlyDuplicates.map((diagnostic) => diagnostic.engineRuleId)).toEqual(['duplicate-mapping-key'])
})

test('still validates the schema of a file that also has a duplicate key', async () => {
  await writeFile(join(dir, 'compose.yaml'), 'name: app\nname: other\nservcies: {}\n')

  const found = await run([file('compose.yaml')])

  expect(found.map((diagnostic) => diagnostic.engineRuleId).sort()).toEqual(['compose-spec', 'duplicate-mapping-key'])
})

test('reads nothing at all when the selection is empty', async () => {
  await writeFile(join(dir, 'compose.yaml'), 'servcies: {}\n')

  expect(await run([file('compose.yaml')], new Map())).toEqual([])
})

test('a rule set to off with options is still off', async () => {
  await writeFile(join(dir, 'compose.yaml'), 'name: app\nname: other\nservcies: {}\n')

  const found = await run(
    [file('compose.yaml')],
    new Map([
      ['compose-spec', ['error']],
      ['duplicate-mapping-key', ['off', { probe: true }]],
    ]),
  )

  expect(found.map((diagnostic) => diagnostic.engineRuleId)).toEqual(['compose-spec'])
})

test('skips a file that vanished between inventory and run rather than failing the engine', async () => {
  expect(await run([file('gone.yaml')])).toEqual([])
})

test('reports every file of a batch, not just the first', async () => {
  await writeFile(join(dir, 'one.yaml'), 'a: 1\na: 2\n')
  await writeFile(join(dir, 'two.yaml'), 'b: 1\nb: 2\n')

  const found = await run([file('one.yaml'), file('two.yaml')])

  expect(found.map((diagnostic) => diagnostic.file)).toEqual(['one.yaml', 'two.yaml'])
})

test('honours an already-aborted signal', async () => {
  await writeFile(join(dir, 'config.yaml'), 'a: 1\na: 2\n')
  const engine = createSchemaEngine()
  const handle = await engine.materializeConfig(ALL, context)

  await expect(
    collect(engine.run({ files: [file('config.yaml')] }, handle, context, AbortSignal.abort())),
  ).rejects.toThrow(/abort/i)
})

test('forgets a disposed handle, so a stale selection cannot leak into a later run', async () => {
  await writeFile(join(dir, 'config.yaml'), 'a: 1\na: 2\n')
  const engine = createSchemaEngine()
  const handle = await engine.materializeConfig(ALL, context)
  await handle.dispose()

  expect(await collect(engine.run({ files: [file('config.yaml')] }, handle, context, AbortSignal.timeout(30_000)))).toEqual([])
})

test('every rule it can emit is one the registry knows about', async () => {
  const { RULE_ENTRIES } = await import('@misaon/slop-gate-core')
  const registered = RULE_ENTRIES.filter((entry) => entry.engine === 'schema').map((entry) => entry.engineRuleId)

  expect([...registered].sort()).toEqual([...SCHEMA_RULE_IDS].sort())
})
