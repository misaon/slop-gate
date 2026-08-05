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
  expect(engine.capabilities.provides).toEqual([])
  expect(engine.id).toBe('tsc')
})

test('materializeConfig returns the tsconfig path itself as handle.path, writing nothing to disk', async () => {
  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)

  expect(handle.path).toBe(join(dir, 'tsconfig.json'))
  await handle.dispose()
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
  expect(await createTscEngine({ rootDir: dir }).availability?.()).toEqual({ available: true })

  await rm(join(dir, 'tsconfig.json'))
  expect(await createTscEngine({ rootDir: dir }).availability?.()).toMatchObject({ available: false })
})

test('reports a coverage gap when a solution tsconfig references nothing that exists', async () => {
  const solutionDir = await mkdtemp(join(tmpdir(), 'sgate-tsc-solution-'))
  try {
    await writeFile(join(solutionDir, 'tsconfig.json'), JSON.stringify({ files: [], references: [{ path: 'packages/a' }] }))
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

    expect(found.map((d) => d.file)).toEqual(['packages/broken/src/index.ts'])
    expect(found[0]?.message).toContain('not assignable')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
}, 180_000)

test('typechecks a project whose tsconfig sets rootDir and whose tests live outside it', async () => {
  // The NestJS scaffold: `rootDir: ./src`, tests in `test/`, and `nest build` using a separate
  // `tsconfig.build.json` that excludes them. Reported from a real service — `tsc -p` raised
  // TS6059 once per file outside `src`, which arrived as an engine failure, so the project got no
  // type checking at all. `--noEmit` does not suppress it: the check runs while the program is
  // built, even though `rootDir` only ever affects output paths.
  await writeFile(
    join(dir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, rootDir: './src', outDir: './dist' } }),
  )
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  await mkdir(join(dir, 'test'), { recursive: true })
  await writeFile(join(dir, 'test/a.spec.ts'), "import { a } from '../src/a'\nexport const t = a\n")

  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)
  expect(await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(60_000)))).toEqual([])
})

test('still reports a real type error in a project that sets rootDir', async () => {
  // The other half: suppressing the layout complaint must not suppress the findings.
  await writeFile(
    join(dir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, rootDir: './src', outDir: './dist' } }),
  )
  await writeFile(join(dir, 'src/bad.ts'), 'export const bad: number = "nope"\n')

  const engine = createTscEngine({ rootDir: dir })
  const handle = await engine.materializeConfig(new Map([['type-error', ['error'] as const]]), context)
  const found = await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(60_000)))

  expect(found).toHaveLength(1)
  expect(found[0]?.message).toContain('TS2322')
})

test('reports an unresolvable `extends` as a coverage gap, not an engine failure', async () => {
  // Nuxt's own tsconfig is `"extends": "./.nuxt/tsconfig.json"`, and `.nuxt/` only exists after
  // `nuxt prepare`. On a fresh clone tsc raises `TS5083: Cannot read file …`, which arrived as an
  // engine failure and exit 3 — reproduced on `nuxt/movies`. Nothing is wrong with the code; a
  // generation step has not run, which is what a coverage gap is for.
  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({ extends: './.generated/tsconfig.json' }))
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')

  const availability = await createTscEngine({ rootDir: dir }).availability?.()

  expect(availability?.available).toBe(false)
  expect(availability).toMatchObject({ reason: expect.stringContaining('.generated/tsconfig.json') })
})

test('an `extends` that resolves is not a gap', async () => {
  await writeFile(join(dir, 'base.json'), JSON.stringify({ compilerOptions: { strict: true } }))
  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({ extends: './base.json', compilerOptions: { noEmit: true } }))
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')

  expect(await createTscEngine({ rootDir: dir }).availability?.()).toEqual({ available: true })
})
