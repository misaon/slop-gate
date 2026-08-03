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
  const handle = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)

  expect(handle.path).toBe(join(dir, 'tsconfig.json'))
  await handle.dispose()
  // dispose() must not have deleted the user's own tsconfig.
  await expect(access(handle.path)).resolves.toBeUndefined()
})

test('materializeConfig produces the same rulesetHash for identical inputs, a different one when tsconfig content changes', async () => {
  const engine = createTscEngine({ rootDir: dir })
  const a = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)
  const b = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)
  expect(b.rulesetHash).toBe(a.rulesetHash)

  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: false, noEmit: true } }))
  const c = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)
  expect(c.rulesetHash).not.toBe(a.rulesetHash)

  await a.dispose()
  await b.dispose()
  await c.dispose()
})

test('materializeConfig reads the level out of the setting and ignores the options half', async () => {
  // This adapter has no enablement comparison to invert — `buildPlan` has already dropped an off rule,
  // and `run` shells out to `tsc -p` regardless — so the failure the widened setting invites here is
  // the cache one: hashing the whole setting would make `['error', …]` a different ruleset from
  // `['error']` and re-check a whole program for a value this adapter never reads. `type-error` has no
  // options grammar; what `tsc` reports is decided by the tsconfig, which is hashed separately.
  const engine = createTscEngine({ rootDir: dir })
  const bare = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)
  const withOptions = await engine.materializeConfig(new Map([['type-error', ['error', { probe: true }] as const]]), context)
  const off = await engine.materializeConfig(new Map([['type-error', ['off'] as const]]), context)

  expect(withOptions.rulesetHash).toBe(bare.rulesetHash)
  expect(off.rulesetHash).not.toBe(bare.rulesetHash)

  await bare.dispose()
  await withOptions.dispose()
  await off.dispose()
})

test('finds a real type error in a real file', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export function f(): number {\n  const x: number = "hello"\n  return x\n}\n')
  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)

  const found = await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found).toHaveLength(1)
  expect(found[0]?.engineRuleId).toBe('type-error')
  expect(found[0]?.severity).toBe('error')
  expect(found[0]?.file).toBe('src/a.ts')
  expect(found[0]?.message).toContain('TS2322')
  await handle.dispose()
}, 60_000)

test('run() ignores the batch argument: tsc checks whatever the tsconfig itself declares', async () => {
  // The defining behaviour of project granularity: passing an *empty* batch must not stop tsc from
  // finding a real error elsewhere in the tsconfig-defined program — `-p` mode does not take file
  // arguments at all (confirmed directly: mixing them is a hard `tsc` error, TS5042).
  await writeFile(join(dir, 'src/a.ts'), 'export const a: number = "bad"\n')
  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)

  const found = await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found).toHaveLength(1)
  await handle.dispose()
}, 60_000)

test('yields nothing for a clean project', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export function f(): number {\n  return 42\n}\n')
  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)

  expect(await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))).toEqual([])
  await handle.dispose()
}, 60_000)

test('surfaces a genuine syntax error', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export function f() {\n  const x: = 5\n  return x\n}\n')
  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)

  const found = await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found).toHaveLength(1)
  expect(found[0]?.file).toBe('src/a.ts')
  expect(found[0]?.message).toContain('TS1110')
  await handle.dispose()
}, 60_000)

test('a missing tsconfig is a coverage gap, and a run over no projects yields nothing rather than throwing', async () => {
  // It used to raise TS5058 from tsc itself. A repository with nothing to typecheck has not failed, and
  // `availability()` is where that is said aloud — the planner reads it and never reaches `run()`.
  await rm(join(dir, 'tsconfig.json'))
  const engine = createTscEngine({ rootDir: dir })

  const availability = await engine.availability?.()
  expect(availability).toMatchObject({ available: false })
  expect(availability?.available === false && availability.reason).toContain('nothing here declares a TypeScript project')

  const handle = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)
  await expect(collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))).resolves.toEqual([])
  await handle.dispose()
}, 60_000)

test('raises an EngineError when the binary is missing', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  const engine = createTscEngine({ rootDir: dir, binaryPath: join(dir, 'does-not-exist') })
  const handle = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)

  await expect(
    collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000))),
  ).rejects.toThrow(/tsc/)
  await handle.dispose()
}, 60_000)

test('writes --incremental build info under cacheDir/tsc, never inside the analysed project', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  const cacheDir = join(dir, '.slop-gate', 'cache')
  const engine = createTscEngine({ rootDir: dir, cacheDir })
  const handle = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)

  await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))

  const tscCacheFiles = await readdir(join(cacheDir, 'tsc'))
  expect(tscCacheFiles.some((name) => name.endsWith('.tsbuildinfo'))).toBe(true)

  // Nothing named *.tsbuildinfo leaked into the project's own directories.
  const projectRootFiles = await readdir(dir)
  expect(projectRootFiles.some((name) => name.endsWith('.tsbuildinfo'))).toBe(false)
  const srcFiles = await readdir(join(dir, 'src'))
  expect(srcFiles.some((name) => name.endsWith('.tsbuildinfo'))).toBe(false)

  await handle.dispose()
}, 60_000)

test('yields nothing for an empty batch on a clean project without throwing', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)

  expect(await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(30_000)))).toEqual([])
  await handle.dispose()
}, 60_000)

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
  // Historically `resolveScriptBin` handed back a bare-`tsc`-on-PATH fallback here and
  // `availability()` said yes on the strength of the tsconfig alone. `run()` then spawned a command
  // that a POSIX CI runner happens to have on PATH and a Windows one can never execute by bare name:
  // `spawn tsc ENOENT`, an EngineError, which `resolveExitCode` maps to exit 3 and fails the run.
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

test('every entry point refuses, not just the availability probe', async () => {
  // `availability()` is advice: `resolve-run.ts` honours it, and a caller constructing the engine
  // directly does not have to. Before the resolver stopped substituting a bare `tsc`, that caller got
  // the machine's TypeScript version reported back with no indication anything was wrong — the run
  // looked successful. Both methods that reach the binary now say what is missing instead.
  const detached = await mkdtemp(join(tmpdir(), 'sgate-tsc-refuses-'))
  try {
    await writeFile(join(detached, 'tsconfig.json'), TSCONFIG)
    const engine = createTscEngine({ rootDir: detached })

    await expect(engine.version()).rejects.toThrow(/no `typescript` is installed in this project/)
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

/**
 * A monorepo root that only lists its projects. `tsc -p` reads no source there, so "available, 0 findings"
 * would be a clean bill of health over zero files — measured on a real repository before this check existed.
 */
test('reports a coverage gap when a solution tsconfig references nothing that exists', async () => {
  const solutionDir = await mkdtemp(join(tmpdir(), 'sgate-tsc-solution-'))
  try {
    // References that resolve to nothing leave no projects, and an empty project set is the gap.
    await writeFile(join(solutionDir, 'tsconfig.json'), JSON.stringify({ files: [], references: [{ path: 'packages/a' }] }))
    // rootDir stays this repository so `typescript` resolves — the gap under test is the project set,
    // and the engine checks for a compiler first.
    const engine = createTscEngine({ rootDir: process.cwd(), tsconfigPath: join(solutionDir, 'tsconfig.json') })

    const availability = await engine.availability?.()

    expect(availability).toMatchObject({ available: false })
    expect(availability?.available === false && availability.reason).toContain('nothing here declares a TypeScript project')
  } finally {
    await rm(solutionDir, { recursive: true, force: true })
  }
})

test('stays available for a tsconfig that declares its own inputs alongside references', async () => {
  const bothDir = await mkdtemp(join(tmpdir(), 'sgate-tsc-both-'))
  try {
    await writeFile(join(bothDir, 'tsconfig.json'), JSON.stringify({ include: ['src'], references: [{ path: 'packages/a' }] }))
    const engine = createTscEngine({ rootDir: process.cwd(), tsconfigPath: join(bothDir, 'tsconfig.json') })

    expect(await engine.availability?.()).toEqual({ available: true })
  } finally {
    await rm(bothDir, { recursive: true, force: true })
  }
})

test('typechecks every package of a workspace with no root project of its own', async () => {
  // The shape three of four real monorepos have: no root tsconfig, one per package. Before project
  // discovery this repository was reported as having nothing to typecheck, and the error below went unseen.
  // Under `fixturesRoot`, not `os.tmpdir()`, for the reason the comment there gives: the peer-dependency
  // walk has to reach this workspace's own `typescript`.
  const repo = await mkdtemp(join(fixturesRoot, 'workspace-'))
  try {
    await writeFile(join(repo, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
    await writeFile(join(repo, 'package.json'), JSON.stringify({ name: 'root', private: true }))
    const packages: readonly (readonly [name: string, source: string])[] = [
      ['clean', 'export const a: number = 1\n'],
      ['broken', 'export const b: number = "not a number"\n'],
    ]
    for (const [name, body] of packages) {
      await mkdir(join(repo, 'packages', name, 'src'), { recursive: true })
      await writeFile(join(repo, 'packages', name, 'package.json'), JSON.stringify({ name }))
      await writeFile(join(repo, 'packages', name, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ['src'] }))
      await writeFile(join(repo, 'packages', name, 'src', 'index.ts'), body)
    }

    const engine = createTscEngine({ rootDir: repo, cacheDir: join(repo, '.cache') })
    expect(await engine.availability?.()).toEqual({ available: true })

    const handle = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)
    const found = await collect(engine.run({ files: [] }, handle, { rootDir: repo, tmpDir: join(repo, '.cache') }, AbortSignal.timeout(120_000)))
    await handle.dispose()

    expect(found.map((d) => d.file)).toEqual([join('packages', 'broken', 'src', 'index.ts')])
    expect(found[0]?.message).toContain('not assignable')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
}, 180_000)
