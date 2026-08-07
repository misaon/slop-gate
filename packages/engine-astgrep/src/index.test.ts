import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { EngineConfigHandle, InventoryFile, RawDiagnostic, RunContext } from '@misaon/slop-gate-core'
import { createAstGrepEngine } from './index.ts'

let dir: string
let context: RunContext

const file = (path: string, size = 64): InventoryFile => ({ path, language: 'ts', workspace: '', size, mtimeMs: 0 })
const emptyFile = (path: string): InventoryFile => file(path, 0)

const collect = async (iterable: AsyncIterable<RawDiagnostic>): Promise<RawDiagnostic[]> => {
  const out: RawDiagnostic[] = []
  for await (const item of iterable) out.push(item)
  return out
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-astgrep-'))
  context = { rootDir: dir, tmpDir: join(dir, '.slop-gate', 'tmp') }
  await mkdir(join(dir, 'src'), { recursive: true })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('reports its version', async () => {
  await expect(createAstGrepEngine().version()).resolves.toMatch(/^\d+\.\d+\.\d+/)
})

test('declares file granularity and exactly the four languages its rule documents cover', () => {
  const engine = createAstGrepEngine()
  expect(engine.id).toBe('astgrep')
  expect(engine.capabilities.granularity).toBe('file')
  expect(engine.capabilities.languages).toEqual(['ts', 'tsx', 'js', 'jsx'])
  expect(engine.capabilities.fixes).toBe(false)
})

test('finds a real violation in a real file', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'declare const v: unknown\nexport const a = v as unknown as string\n')
  const engine = createAstGrepEngine()
  const handle = await engine.materializeConfig(new Map([['slop-double-cast', ['warn'] as const]]), context)

  const found = await collect(engine.run({ files: [file('src/a.ts')] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found).toHaveLength(1)
  expect(found[0]?.engineRuleId).toBe('slop-double-cast')
  expect(found[0]?.file).toBe('src/a.ts')
  expect(found[0]?.help).toBeDefined()
  await handle.dispose()
})

test('does not report a rule the registry did not elect', async () => {
  await writeFile(
    join(dir, 'src/a.ts'),
    'declare const v: unknown\nexport const a = v as unknown as string\nexport function f() {\n  try { g() } catch {}\n}\ndeclare function g(): void\n',
  )
  const engine = createAstGrepEngine()
  const handle = await engine.materializeConfig(new Map([['slop-double-cast', ['warn'] as const]]), context)

  const found = await collect(engine.run({ files: [file('src/a.ts')] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found.map((d) => d.engineRuleId)).toEqual(['slop-double-cast'])
  await handle.dispose()
})

test('yields nothing for a clean file', async () => {
  await writeFile(join(dir, 'src/clean.ts'), 'export const a = 1\n')
  const engine = createAstGrepEngine()
  const handle = await engine.materializeConfig(new Map([['slop-double-cast', ['warn'] as const]]), context)

  await expect(collect(engine.run({ files: [file('src/clean.ts')] }, handle, context, AbortSignal.timeout(30_000)))).resolves.toEqual([])
  await handle.dispose()
})

test('yields nothing for an empty batch instead of scanning the whole repository', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'declare const v: unknown\nexport const a = v as unknown as string\n')
  const engine = createAstGrepEngine()
  const handle = await engine.materializeConfig(new Map([['slop-double-cast', ['warn'] as const]]), context)

  await expect(collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))).resolves.toEqual([])
  await handle.dispose()
})

test('yields nothing for an empty ruleset instead of failing on an empty rule file', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'declare const v: unknown\nexport const a = v as unknown as string\n')
  const engine = createAstGrepEngine()
  const handle = await engine.materializeConfig(new Map(), context)

  await expect(collect(engine.run({ files: [file('src/a.ts')] }, handle, context, AbortSignal.timeout(30_000)))).resolves.toEqual([])
  await handle.dispose()
})

test('fails loudly when ast-grep loads a different number of rule documents than were elected', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'declare const v: unknown\nexport const a = v as unknown as string\n')
  const engine = createAstGrepEngine()
  const real = await engine.materializeConfig(new Map([['slop-double-cast', ['warn'] as const]]), context)
  const lying: EngineConfigHandle = { ...real, ruleCount: 99, dispose: real.dispose }

  await expect(
    collect(engine.run({ files: [file('src/a.ts')] }, lying, context, AbortSignal.timeout(30_000))),
  ).rejects.toThrow(/expected 99 rule document\(s\) to load, ast-grep loaded 2/)
  await real.dispose()
})

test('fails loudly when ast-grep skips a file instead of caching it as clean', async () => {
  const huge = `declare const v: unknown\nexport const a = v as unknown as string\n${'const x = 1\n'.repeat(400_000)}`
  await writeFile(join(dir, 'src/huge.ts'), huge)
  const engine = createAstGrepEngine()
  const handle = await engine.materializeConfig(new Map([['slop-double-cast', ['warn'] as const]]), context)

  await expect(
    collect(
      engine.run(
        { files: [file('src/huge.ts', new TextEncoder().encode(huge).length)] },
        handle,
        context,
        AbortSignal.timeout(60_000),
      ),
    ),
  ).rejects.toThrow(/skipped 1 of 1 file\(s\) in this batch.*src\/huge\.ts/s)
  await handle.dispose()
})

test('does not fail on a zero-byte file, which ast-grep counts as skipped', async () => {
  await writeFile(join(dir, 'src/empty.d.ts'), '')
  const engine = createAstGrepEngine()
  const handle = await engine.materializeConfig(new Map([['slop-double-cast', ['warn'] as const]]), context)

  await expect(collect(engine.run({ files: [emptyFile('src/empty.d.ts')] }, handle, context, AbortSignal.timeout(30_000)))).resolves.toEqual([])
  await handle.dispose()
})

test('still analyses the rest of a batch that contains a zero-byte file', async () => {
  await writeFile(join(dir, 'src/empty.d.ts'), '')
  await writeFile(join(dir, 'src/a.ts'), 'declare const v: unknown\nexport const a = v as unknown as string\n')
  const engine = createAstGrepEngine()
  const handle = await engine.materializeConfig(new Map([['slop-double-cast', ['warn'] as const]]), context)

  const found = await collect(
    engine.run({ files: [emptyFile('src/empty.d.ts'), file('src/a.ts')] }, handle, context, AbortSignal.timeout(30_000)),
  )

  expect(found.map((raw) => raw.file)).toEqual(['src/a.ts'])
  await handle.dispose()
})

test('raises an EngineError when the binary is missing', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  const engine = createAstGrepEngine({ binaryPath: join(dir, 'does-not-exist') })
  const handle = await engine.materializeConfig(new Map([['slop-double-cast', ['warn'] as const]]), context)

  await expect(
    collect(engine.run({ files: [file('src/a.ts')] }, handle, context, AbortSignal.timeout(30_000))),
  ).rejects.toThrow(/ast-grep/)
  await handle.dispose()
})

test('scans a file git ignores, because the planner has already decided what to scan', async () => {
  await writeFile(join(dir, '.gitignore'), 'src/hidden.ts\n')
  await writeFile(join(dir, 'src/hidden.ts'), 'declare const v: unknown\nexport const a = v as unknown as string\n')
  const engine = createAstGrepEngine()
  const handle = await engine.materializeConfig(new Map([['slop-double-cast', ['warn'] as const]]), context)

  const found = await collect(engine.run({ files: [file('src/hidden.ts')] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found.map((d) => d.file)).toEqual(['src/hidden.ts'])
  await handle.dispose()
})
