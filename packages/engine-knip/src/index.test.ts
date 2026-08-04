import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, test } from 'vitest'
import {
  detectFrameworks,
  engineAdjustmentsFor,
  type EngineSettings,
  type EngineRuleSelection,
  type InventoryFile,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import { createKnipEngine } from './index.ts'
import { KNIP_ISSUE_TYPES, KNIP_SURFACED_ISSUE_TYPES } from './issue-types.ts'
import { resolveKnipBinary } from './resolve-binary.ts'

let dir: string
let context: RunContext

const TIMEOUT = 60_000

const collect = async (iterable: AsyncIterable<RawDiagnostic>): Promise<RawDiagnostic[]> => {
  const out: RawDiagnostic[] = []
  for await (const item of iterable) out.push(item)
  return out
}

const file = (path: string): InventoryFile => ({
  path,
  language: path.endsWith('.json') ? 'json' : 'ts',
  workspace: '',
  size: 0,
  mtimeMs: 0,
})

const write = async (relativePath: string, content: string): Promise<void> => {
  await mkdir(join(dir, relativePath, '..'), { recursive: true })
  await writeFile(join(dir, relativePath), content, 'utf8')
}

const everything = (): EngineRuleSelection => new Map(KNIP_SURFACED_ISSUE_TYPES.map((type) => [type, ['warn'] as const]))

const summarize = (found: readonly RawDiagnostic[]): string[] =>
  found.map((d) => `${d.engineRuleId} ${d.file} ${d.message}`).sort()

/**
 * The shape the whole adapter exists for, reduced to its smallest reproducible form: a repository
 * with a nested `docs/package.json` and **no workspace declaration anywhere** — no `workspaces` key,
 * no `pnpm-workspace.yaml`. This is the srvc-bat shape the grounding measurement found knip's accuracy
 * collapsing on (spec §13.2).
 *
 * knip is *bundled* (a `dependencies` entry of this package), so unlike `engine-tsc`'s fixtures these
 * do not need to share an ancestor with this repository to resolve the binary — `os.tmpdir()` is fine.
 */
const writeUndeclaredWorkspaceFixture = async (): Promise<void> => {
  await write(
    'package.json',
    JSON.stringify({ name: 'root', version: '0.0.0', private: true, dependencies: { 'used-dep': '^1.0.0' } }),
  )
  await write('src/index.ts', "import { thing } from 'used-dep'\n\nexport const main = (): unknown => thing\n")
  await write(
    'docs/package.json',
    JSON.stringify({ name: 'docs', version: '0.0.0', private: true, devDependencies: { 'docs-only-dep': '^1.0.0' } }),
  )
  await write('docs/build.ts', "export const build = (): string => 'docs'\n")
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-knip-'))
  context = { rootDir: dir, tmpDir: join(dir, '.slop-gate', 'tmp') }
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('reports its version', async () => {
  expect(await createKnipEngine().version()).toMatch(/^\d+\.\d+\.\d+/)
})

test('declares project granularity, and json alongside the script languages', () => {
  const engine = createKnipEngine()
  expect(engine.id).toBe('knip')
  expect(engine.capabilities.granularity).toBe('project')
  // `json`/`jsonc` are what put every `package.json` into the assigned file list — without them the
  // workspace map cannot be synthesized at all, and a manifest edit would not invalidate the cache.
  // `vue`/`svelte`/`astro` are here for the second half of that same reason: knip compiles them, so
  // an edit to one changes its answer and has to change the cache key. See the capability comment.
  expect(engine.capabilities.languages).toEqual(['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'astro', 'json', 'jsonc'])
  expect(engine.capabilities.provides).toEqual([])
  expect(engine.capabilities.fixes).toBe(false)
})

test(
  'synthesizing the workspace map from the inventory changes what knip reports',
  async () => {
    await writeUndeclaredWorkspaceFixture()
    const engine = createKnipEngine()

    // Both runs use the identical materialised ruleset and the identical repository on disk. The only
    // difference is whether the inventory told the adapter that `docs/package.json` exists.
    const blind = await engine.materializeConfig(everything(), context)
    const withoutNestedManifest = await collect(
      engine.run({ files: [file('package.json'), file('src/index.ts')] }, blind, context, AbortSignal.timeout(TIMEOUT)),
    )
    await blind.dispose()

    const informed = await engine.materializeConfig(everything(), context)
    const withNestedManifest = await collect(
      engine.run(
        { files: [file('package.json'), file('src/index.ts'), file('docs/package.json'), file('docs/build.ts')] },
        informed,
        context,
        AbortSignal.timeout(TIMEOUT),
      ),
    )
    await informed.dispose()

    // Blind: knip sees one package rooted at the repository root. `docs/package.json` is not a
    // manifest it knows about, so `docs-only-dep` is never even a candidate for being unused.
    expect(summarize(withoutNestedManifest)).not.toContainEqual(expect.stringContaining('docs-only-dep'))
    expect(summarize(withoutNestedManifest).some((line) => line.startsWith('devDependencies'))).toBe(false)

    // Informed: `docs` is its own workspace, its manifest is read, and its genuinely-unused
    // devDependency surfaces. This is the finding a bare `knip` run on this repository cannot produce.
    expect(summarize(withNestedManifest)).toContainEqual(
      'devDependencies docs/package.json Unused devDependency `docs-only-dep`.',
    )
    expect(summarize(withNestedManifest)).not.toEqual(summarize(withoutNestedManifest))
  },
  TIMEOUT,
)

test(
  'the synthesized map reproduces a properly-declared workspace exactly',
  async () => {
    // The strongest available statement of what the synthesis is: not an approximation of a declared
    // workspace layout, but the same thing. Same repository twice — once with `workspaces` declared in
    // its root manifest and the adapter kept blind, once undeclared and the adapter informed by the
    // inventory — must produce identical findings.
    await writeUndeclaredWorkspaceFixture()
    const engine = createKnipEngine()
    const files = [file('package.json'), file('src/index.ts'), file('docs/package.json'), file('docs/build.ts')]

    const informed = await engine.materializeConfig(everything(), context)
    const synthesized = await collect(engine.run({ files }, informed, context, AbortSignal.timeout(TIMEOUT)))
    await informed.dispose()

    await write(
      'package.json',
      JSON.stringify({
        name: 'root',
        version: '0.0.0',
        private: true,
        workspaces: ['docs'],
        dependencies: { 'used-dep': '^1.0.0' },
      }),
    )
    const declaredHandle = await engine.materializeConfig(everything(), context)
    const declared = await collect(engine.run({ files }, declaredHandle, context, AbortSignal.timeout(TIMEOUT)))
    await declaredHandle.dispose()

    expect(summarize(synthesized)).toEqual(summarize(declared))
  },
  TIMEOUT,
)

test(
  'never reports slop-gate’s own config file as unused',
  async () => {
    await writeUndeclaredWorkspaceFixture()
    await write('slop-gate.config.ts', "export default { extends: ['recommended'] }\n")

    const files = [file('package.json'), file('src/index.ts'), file('slop-gate.config.ts')]
    const blind = createKnipEngine()
    const blindHandle = await blind.materializeConfig(everything(), context)
    const reported = await collect(blind.run({ files }, blindHandle, context, AbortSignal.timeout(TIMEOUT)))
    await blindHandle.dispose()
    // Baseline: knip genuinely does report it. Nothing imports a config file loaded by path at runtime.
    expect(reported.map((d) => d.file)).toContain('slop-gate.config.ts')

    const aware = createKnipEngine({ configFile: 'slop-gate.config.ts' })
    const awareHandle = await aware.materializeConfig(everything(), context)
    const silent = await collect(aware.run({ files }, awareHandle, context, AbortSignal.timeout(TIMEOUT)))
    await awareHandle.dispose()
    expect(silent.map((d) => d.file)).not.toContain('slop-gate.config.ts')
  },
  TIMEOUT,
)

test(
  'reports only the elected issue types, never knip’s own defaults',
  async () => {
    await writeUndeclaredWorkspaceFixture()
    const engine = createKnipEngine()
    const handle = await engine.materializeConfig(new Map([['files', ['warn'] as const]]), context)

    const found = await collect(
      engine.run(
        { files: [file('package.json'), file('src/index.ts'), file('docs/package.json'), file('docs/build.ts')] },
        handle,
        context,
        AbortSignal.timeout(TIMEOUT),
      ),
    )

    // knip reports fourteen of its seventeen issue types by default. Electing one must yield one.
    expect(new Set(found.map((d) => d.engineRuleId))).toEqual(new Set(['files']))
    expect(found.length).toBeGreaterThan(0)
    await handle.dispose()
  },
  TIMEOUT,
)

test(
  'yields nothing for a repository with nothing to report',
  async () => {
    await write('package.json', JSON.stringify({ name: 'clean', version: '0.0.0', private: true }))
    await write('index.ts', 'export const main = (): number => 1\n')

    const engine = createKnipEngine()
    const handle = await engine.materializeConfig(everything(), context)

    expect(
      await collect(
        engine.run({ files: [file('package.json'), file('index.ts')] }, handle, context, AbortSignal.timeout(TIMEOUT)),
      ),
    ).toEqual([])
    await handle.dispose()
  },
  TIMEOUT,
)

test(
  'raises an EngineError when the repository has no package.json at all',
  async () => {
    await write('src/index.ts', 'export const main = (): number => 1\n')
    const engine = createKnipEngine()
    const handle = await engine.materializeConfig(everything(), context)

    await expect(
      collect(engine.run({ files: [file('src/index.ts')] }, handle, context, AbortSignal.timeout(TIMEOUT))),
    ).rejects.toThrow(/knip failed.*package\.json/s)
    await handle.dispose()
  },
  TIMEOUT,
)

test(
  'raises an EngineError when the binary is missing',
  async () => {
    await writeUndeclaredWorkspaceFixture()
    const engine = createKnipEngine({ binaryPath: join(dir, 'does-not-exist') })
    const handle = await engine.materializeConfig(everything(), context)

    await expect(
      collect(engine.run({ files: [file('package.json')] }, handle, context, AbortSignal.timeout(TIMEOUT))),
    ).rejects.toThrow(/knip/)
    await handle.dispose()
  },
  TIMEOUT,
)

test(
  'every issue type the installed knip reports by default is accounted for by the mapping table',
  async () => {
    // `KNIP_ISSUE_TYPES` is transcribed from knip's own `ISSUE_TYPES` constant, which knip does not
    // export — so it can drift. This is the guard: run the *installed* binary with no include/exclude
    // at all and confirm the mapping table already knows every type it chose to report. A knip release
    // that adds a default-reported issue type fails here, instead of silently producing findings this
    // adapter drops on the floor.
    await writeUndeclaredWorkspaceFixture()
    await write('.slop-gate/tmp/defaults.json', JSON.stringify({ workspaces: { '.': {}, docs: {} } }))

    // Non-null: this case spawns the real bundled knip, and an unresolvable one is a broken install.
    const invocation = resolveKnipBinary()!
    const { stdout } = await promisify(execFile)(
      invocation.command,
      [
        ...invocation.prefixArgs,
        '--config',
        join(dir, '.slop-gate', 'tmp', 'defaults.json'),
        '--reporter',
        'json',
        '--no-exit-code',
        '--no-progress',
        '--no-config-hints',
      ],
      { cwd: dir, encoding: 'utf8' },
    )

    const report = JSON.parse(stdout) as { issues: Array<Record<string, unknown>> }
    const reported = new Set(Object.keys(report.issues[0] ?? {}))
    reported.delete('file')
    // `owners` appears only when the repository has a CODEOWNERS file; it is reporter metadata, not an
    // issue type, and the fixture has none — asserted rather than filtered so it stays that way.
    expect(reported.has('owners')).toBe(false)
    expect(reported.size).toBeGreaterThan(0)
    expect([...reported].filter((type) => !KNIP_ISSUE_TYPES.includes(type as never))).toEqual([])
  },
  TIMEOUT,
)

test(
  'writes nothing into the analysed repository beyond its own tmp config, which dispose removes',
  async () => {
    await writeUndeclaredWorkspaceFixture()
    const engine = createKnipEngine()
    const handle = await engine.materializeConfig(everything(), context)

    await collect(
      engine.run({ files: [file('package.json'), file('src/index.ts')] }, handle, context, AbortSignal.timeout(TIMEOUT)),
    )

    // knip caches only with an explicit `--cache`; confirm it left nothing behind under the default.
    await expect(stat(join(dir, 'node_modules', '.cache', 'knip'))).rejects.toThrow(/^ENOENT/)
    await handle.dispose()
    await expect(stat(handle.path)).rejects.toThrow(/^ENOENT/)
  },
  TIMEOUT,
)

// --- Framework awareness (spec §23): the three knip cases the M0 follow-ups measured -------------

/**
 * Runs the whole detection chain against the fixture currently on disk and narrows it to knip, so
 * these tests exercise the real profiles rather than hand-written adjustments. `paths` is the
 * inventory the planner would have assigned.
 */
const knipAdjustments = async (paths: readonly string[]): Promise<EngineSettings> => {
  const detection = await detectFrameworks({
    inventory: {
      root: dir,
      files: paths.map((path) => file(path)),
      languages: new Set(['ts']),
      workspaces: [{ name: 'root', dir: '' }],
    },
  })
  return engineAdjustmentsFor('knip', detection)
}

/** The same repository analysed twice: once as knip sees it today, once with the profiles applied. */
const withAndWithout = async (
  paths: readonly string[],
): Promise<{ before: string[]; after: string[]; adjustments: EngineSettings }> => {
  const engine = createKnipEngine()
  const files = paths.map((path) => file(path))

  const bare = await engine.materializeConfig(everything(), context)
  const before = summarize(await collect(engine.run({ files }, bare, context, AbortSignal.timeout(TIMEOUT))))
  await bare.dispose()

  const adjustments = await knipAdjustments(paths)
  const aware: RunContext = { ...context, adjustments }
  const handle = await engine.materializeConfig(everything(), aware)
  const after = summarize(await collect(engine.run({ files }, handle, aware, AbortSignal.timeout(TIMEOUT))))
  await handle.dispose()

  return { before, after, adjustments }
}

const MIKRO_ORM_FILES = ['package.json', 'src/index.ts', 'mikro-orm.config.ts', 'src/migrations/Migration001.ts']

const writeMikroOrmFixture = async (): Promise<void> => {
  await write(
    'package.json',
    JSON.stringify({
      name: 'api',
      dependencies: { '@mikro-orm/core': '^6.0.0', '@mikro-orm/migrations': '^6.0.0', 'used-dep': '^1.0.0' },
    }),
  )
  await write('src/index.ts', "import { thing } from 'used-dep'\n\nexport const main = (): unknown => thing\n")
  await write(
    'mikro-orm.config.ts',
    "import { defineConfig } from '@mikro-orm/core'\n\nexport default defineConfig({ migrations: { path: './src/migrations' } })\n",
  )
  await write(
    'src/migrations/Migration001.ts',
    "import { Migration } from '@mikro-orm/migrations'\n\nexport class Migration001 extends Migration {}\n",
  )
}

test(
  'the MikroORM profile clears the migration and ORM-config false positives',
  async () => {
    await writeMikroOrmFixture()
    const { before, after, adjustments } = await withAndWithout(MIKRO_ORM_FILES)

    expect(adjustments).toEqual([
      { key: 'entry', workspace: '', values: ['mikro-orm.config.ts', 'src/migrations/*.{js,mjs,cjs,ts,mts,cts}'] },
    ])

    // Without the profile these are exactly the findings §13.2 measured: files nothing imports, and
    // the dependencies that are only reachable through them.
    expect(before).toContainEqual(expect.stringContaining('files src/migrations/Migration001.ts'))
    expect(before).toContainEqual(expect.stringContaining('files mikro-orm.config.ts'))
    expect(before).toContainEqual(expect.stringContaining('@mikro-orm/migrations'))

    expect(after.filter((line) => line.startsWith('files '))).toEqual([])
    expect(after.filter((line) => line.includes('@mikro-orm/'))).toEqual([])
  },
  TIMEOUT,
)

/**
 * The single highest-risk line in the framework change, pinned behaviourally. A workspace-level
 * `entry` **replaces** knip's defaults (`KNIP_DEFAULT_ENTRY`, config.ts), so a contribution written
 * without them un-registers `src/index.ts` as an entry point — and the symptom is knip reporting
 * *fewer* findings, which reads like the tool getting better. Both assertions below fail if the
 * defaults are ever dropped: the entry file itself becomes an unused file, and the dependency only it
 * imports becomes an unused dependency.
 */
test(
  'a contributed entry is unioned onto knip own defaults, not written over them',
  async () => {
    await writeMikroOrmFixture()
    const { after } = await withAndWithout(MIKRO_ORM_FILES)

    expect(after).not.toContainEqual(expect.stringContaining('files src/index.ts'))
    expect(after).not.toContainEqual(expect.stringContaining('used-dep'))
  },
  TIMEOUT,
)

test(
  'the VitePress profile points knip at a site that is not at the workspace root',
  async () => {
    await write(
      'package.json',
      JSON.stringify({ name: 'root', dependencies: { 'used-dep': '^1.0.0' }, devDependencies: { vitepress: '^2.0.0' } }),
    )
    await write('src/index.ts', "import { thing } from 'used-dep'\n\nexport const main = (): unknown => thing\n")
    await write('docs/.vitepress/config.mts', "import { defineConfig } from 'vitepress'\n\nexport default defineConfig({})\n")

    const { before, after } = await withAndWithout(['package.json', 'src/index.ts', 'docs/.vitepress/config.mts'])

    expect(before).toContainEqual(expect.stringContaining('files docs/.vitepress/config.mts'))
    expect(before).toContainEqual(expect.stringContaining('vitepress'))

    expect(after).not.toContainEqual(expect.stringContaining('files docs/.vitepress/config.mts'))
    expect(after.filter((line) => line.includes('vitepress'))).toEqual([])
  },
  TIMEOUT,
)

test(
  'the NestJS-on-Express profile clears the transitively-provided express dependency',
  async () => {
    await write(
      'package.json',
      JSON.stringify({ name: 'api', dependencies: { '@nestjs/core': '^11.0.0', '@nestjs/platform-express': '^11.0.0' } }),
    )
    await write(
      'src/index.ts',
      "import type { Request } from 'express'\nimport { NestFactory } from '@nestjs/core'\n\nexport const main = (r: Request): unknown => [NestFactory, r]\n",
    )

    const { before, after } = await withAndWithout(['package.json', 'src/index.ts'])

    expect(before).toContainEqual(expect.stringContaining('unlisted src/index.ts'))
    expect(before.some((line) => line.includes('express'))).toBe(true)
    expect(after.filter((line) => line.startsWith('unlisted '))).toEqual([])
  },
  TIMEOUT,
)

test('is unavailable when a manifest declares dependencies that are not installed', async () => {
  // knip resolves imports through `node_modules`, so an uninstalled repository does not make it
  // report *less* — it makes it report wrongly, in both directions. Measured on `withastro/docs`:
  // **3 308 `deps.unresolved-import` findings at `error` without `node_modules`, and 2 with it.**
  // Its `tsconfig.json` extends `astro/tsconfigs/strict`, which cannot resolve, so knip loses the
  // local `"paths": { "~/*": ["./src/*"] }` and every `~/components/*.astro` import from an `.mdx`
  // file becomes unresolved. `directus/directus` shows the identical shape at 3 765. And it is not
  // only noise: `nuxt/nuxt.com` reported 43 unused exports uninstalled against 65 installed, so the
  // uninstalled run also *hid* 22 real ones.
  await write('package.json', JSON.stringify({ name: 'root', dependencies: { 'used-dep': '^1.0.0' } }))
  const engine = createKnipEngine({ rootDir: dir })

  expect(await engine.availability?.()).toEqual({
    available: false,
    reason: expect.stringContaining('node_modules'),
    install: expect.stringContaining('install'),
  })
})

test('is available when the declared dependencies are installed', async () => {
  await write('package.json', JSON.stringify({ name: 'root', dependencies: { 'used-dep': '^1.0.0' } }))
  await mkdir(join(dir, 'node_modules'), { recursive: true })
  const engine = createKnipEngine({ rootDir: dir })

  expect(await engine.availability?.()).toEqual({ available: true })
})

test('is available in a repository that declares no dependencies at all', async () => {
  // The distinction that keeps this from firing on a repository which is simply dependency-free:
  // absent `node_modules` is only evidence of "not installed" when something asked to be installed.
  await write('package.json', JSON.stringify({ name: 'root' }))
  const engine = createKnipEngine({ rootDir: dir })

  expect(await engine.availability?.()).toEqual({ available: true })
})
