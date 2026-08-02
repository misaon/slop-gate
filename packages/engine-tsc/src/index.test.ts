import { access, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { RawDiagnostic } from '@misaon/slop-gate-core'
import { createTscEngine } from './index.ts'

let dir: string
let context: { rootDir: string; tmpDir: string }

const collect = async (iterable: AsyncIterable<RawDiagnostic>): Promise<RawDiagnostic[]> => {
  const out: RawDiagnostic[] = []
  for await (const item of iterable) out.push(item)
  return out
}

const TSCONFIG = JSON.stringify({
  compilerOptions: { strict: true, noEmit: true, module: 'nodenext', moduleResolution: 'nodenext', target: 'es2022' },
})

// `typescript` is a *peer* dependency (see resolve-binary.ts): `createTscEngine({ rootDir })`
// resolves it by walking up from `rootDir` through real ancestor `node_modules` directories, the same
// way Node itself would. A fixture under `os.tmpdir()` shares no ancestor with this repo at all, so
// that walk would never reach this workspace's own hoisted `typescript` — these fixtures live inside
// the package instead (gitignored: `.test-tmp/`), which is what lets every test below exercise the
// real, installed `typescript` binary rather than an injected stub.
const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '.test-tmp')

beforeEach(async () => {
  await mkdir(fixturesRoot, { recursive: true })
  dir = await mkdtemp(join(fixturesRoot, 'engine-'))
  context = { rootDir: dir, tmpDir: join(dir, '.slop-gate', 'tmp') }
  await mkdir(join(dir, 'src'), { recursive: true })
  await writeFile(join(dir, 'tsconfig.json'), TSCONFIG)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('reports its version', async () => {
  expect(await createTscEngine({ rootDir: dir }).version()).toMatch(/^\d+\.\d+\.\d+/)
})

test('declares project granularity and ts/tsx languages', () => {
  const engine = createTscEngine({ rootDir: dir })
  expect(engine.capabilities.granularity).toBe('project')
  expect(engine.capabilities.languages).toEqual(['ts', 'tsx'])
  // Deliberately not ['types'] — see the long comment on the tsc registry entry for why.
  expect(engine.capabilities.provides).toEqual([])
  expect(engine.id).toBe('tsc')
})

test('materializeConfig returns the tsconfig path itself as handle.path, writing nothing to disk', async () => {
  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', 'error']]), context)

  expect(handle.path).toBe(join(dir, 'tsconfig.json'))
  await handle.dispose()
  // dispose() must not have deleted the user's own tsconfig.
  await expect(access(handle.path)).resolves.toBeUndefined()
})

test('materializeConfig produces the same rulesetHash for identical inputs, a different one when tsconfig content changes', async () => {
  const engine = createTscEngine({ rootDir: dir })
  const a = await engine.materializeConfig(new Map([['type-error', 'error']]), context)
  const b = await engine.materializeConfig(new Map([['type-error', 'error']]), context)
  expect(b.rulesetHash).toBe(a.rulesetHash)

  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: false, noEmit: true } }))
  const c = await engine.materializeConfig(new Map([['type-error', 'error']]), context)
  expect(c.rulesetHash).not.toBe(a.rulesetHash)

  await a.dispose()
  await b.dispose()
  await c.dispose()
})

test('finds a real type error in a real file', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export function f(): number {\n  const x: number = "hello"\n  return x\n}\n')
  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', 'error']]), context)

  const found = await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found).toHaveLength(1)
  expect(found[0]?.engineRuleId).toBe('type-error')
  expect(found[0]?.severity).toBe('error')
  expect(found[0]?.file).toBe('src/a.ts')
  expect(found[0]?.message).toContain('TS2322')
  await handle.dispose()
})

test('run() ignores the batch argument: tsc checks whatever the tsconfig itself declares', async () => {
  // The defining behaviour of project granularity: passing an *empty* batch must not stop tsc from
  // finding a real error elsewhere in the tsconfig-defined program — `-p` mode does not take file
  // arguments at all (confirmed directly: mixing them is a hard `tsc` error, TS5042).
  await writeFile(join(dir, 'src/a.ts'), 'export const a: number = "bad"\n')
  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', 'error']]), context)

  const found = await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found).toHaveLength(1)
  await handle.dispose()
})

test('yields nothing for a clean project', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export function f(): number {\n  return 42\n}\n')
  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', 'error']]), context)

  expect(await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))).toEqual([])
  await handle.dispose()
})

test('surfaces a genuine syntax error', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export function f() {\n  const x: = 5\n  return x\n}\n')
  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', 'error']]), context)

  const found = await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found).toHaveLength(1)
  expect(found[0]?.file).toBe('src/a.ts')
  expect(found[0]?.message).toContain('TS1110')
  await handle.dispose()
})

test('raises an EngineError when the tsconfig is missing', async () => {
  await rm(join(dir, 'tsconfig.json'))
  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', 'error']]), context)

  await expect(
    collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000))),
  ).rejects.toThrow(/TS5058|does not exist/)
  await handle.dispose()
})

test('raises an EngineError when the binary is missing', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  const engine = createTscEngine({ rootDir: dir, binaryPath: join(dir, 'does-not-exist') })
  const handle = await engine.materializeConfig(new Map([['type-error', 'error']]), context)

  await expect(
    collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000))),
  ).rejects.toThrow(/tsc/)
  await handle.dispose()
})

test('writes --incremental build info under cacheDir/tsc, never inside the analysed project', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  const cacheDir = join(dir, '.slop-gate', 'cache')
  const engine = createTscEngine({ rootDir: dir, cacheDir })
  const handle = await engine.materializeConfig(new Map([['type-error', 'error']]), context)

  await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))

  const tscCacheFiles = await readdir(join(cacheDir, 'tsc'))
  expect(tscCacheFiles.some((name) => name.endsWith('.tsbuildinfo'))).toBe(true)

  // Nothing named *.tsbuildinfo leaked into the project's own directories.
  const projectRootFiles = await readdir(dir)
  expect(projectRootFiles.some((name) => name.endsWith('.tsbuildinfo'))).toBe(false)
  const srcFiles = await readdir(join(dir, 'src'))
  expect(srcFiles.some((name) => name.endsWith('.tsbuildinfo'))).toBe(false)

  await handle.dispose()
})

test('yields nothing for an empty batch on a clean project without throwing', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', 'error']]), context)

  expect(await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))).toEqual([])
  await handle.dispose()
})

test('is available when the resolved tsconfig exists', async () => {
  const engine = createTscEngine({ rootDir: dir })
  expect(await engine.availability?.()).toEqual({ available: true })
})

test('is a reported coverage gap, not an engine error, when no tsconfig is there to typecheck', async () => {
  await rm(join(dir, 'tsconfig.json'))
  const engine = createTscEngine({ rootDir: dir })
  const availability = await engine.availability?.()

  expect(availability?.available).toBe(false)
  expect(availability).toMatchObject({
    reason: expect.stringContaining('tsconfig.json'),
    install: expect.stringContaining('tsconfigPath'),
  })
})

test('honours an explicit tsconfigPath when deciding availability', async () => {
  await rm(join(dir, 'tsconfig.json'))
  await writeFile(join(dir, 'tsconfig.build.json'), TSCONFIG)
  const engine = createTscEngine({ rootDir: dir, tsconfigPath: join(dir, 'tsconfig.build.json') })

  expect(await engine.availability?.()).toEqual({ available: true })
})

test('is a coverage gap, not a crash, when the project has no typescript of its own to run', async () => {
  // The Windows-only CI failure that found this, reproduced deterministically on every platform.
  // A directory under `os.tmpdir()` has no `node_modules` anywhere above it on any OS, so Node's
  // resolution cannot reach a `typescript` — which is precisely the condition every one of these
  // fixtures would be in if they did not deliberately live inside this package (see `fixturesRoot`).
  //
  // Unguarded, `resolveScriptBin` hands back its bare-`tsc`-on-PATH fallback and `availability()`
  // says yes on the strength of the tsconfig alone. `run()` then spawns a command that a POSIX CI
  // runner happens to have on PATH and a Windows one can never execute by bare name: `spawn tsc
  // ENOENT`, an EngineError, which `resolveExitCode` maps to exit 3 and fails the run.
  const detached = await mkdtemp(join(tmpdir(), 'sgate-tsc-no-typescript-'))
  try {
    await writeFile(join(detached, 'tsconfig.json'), TSCONFIG)
    const availability = await createTscEngine({ rootDir: detached }).availability?.()

    expect(availability).toEqual({
      available: false,
      reason: expect.stringContaining('no `typescript` is installed in this project'),
      install: 'npm install -D typescript',
    })
  } finally {
    await rm(detached, { recursive: true, force: true })
  }
})

test('a resolvable typescript plus a tsconfig is what makes it available — both, not either', async () => {
  // `dir` lives under `.test-tmp/` inside this package, so the workspace's hoisted `typescript` is
  // reachable from it; the tsconfig is written by `beforeEach`. Removing either precondition alone
  // must be enough to stand the engine down.
  expect(await createTscEngine({ rootDir: dir }).availability?.()).toEqual({ available: true })

  await rm(join(dir, 'tsconfig.json'))
  expect(await createTscEngine({ rootDir: dir }).availability?.()).toMatchObject({ available: false })
})
