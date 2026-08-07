import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, test } from 'vitest'
import {
  detectFrameworks,
  FRAMEWORK_PROFILES,
  engineAdjustmentsFor,
  type EngineSettings,
  type EngineRuleSelection,
  type InventoryFile,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import { createKnipEngine, mergeWorkspacesIntoConfig, synthesizeKnipWorkspaces } from './index.ts'
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
  expect(engine.capabilities.languages).toEqual(['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'astro', 'json', 'jsonc'])
  expect(engine.capabilities.provides).toEqual([])
  expect(engine.capabilities.fixes).toBe(false)
})

test(
  'synthesizing the workspace map from the inventory changes what knip reports',
  async () => {
    await writeUndeclaredWorkspaceFixture()
    const engine = createKnipEngine()

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

    expect(summarize(withoutNestedManifest)).not.toContainEqual(expect.stringContaining('docs-only-dep'))
    expect(summarize(withoutNestedManifest).some((line) => line.startsWith('devDependencies'))).toBe(false)

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
    await writeUndeclaredWorkspaceFixture()
    await write('.slop-gate/tmp/defaults.json', JSON.stringify({ workspaces: { '.': {}, docs: {} } }))

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

    await expect(stat(join(dir, 'node_modules', '.cache', 'knip'))).rejects.toThrow(/^ENOENT/)
    await handle.dispose()
    await expect(stat(handle.path)).rejects.toThrow(/^ENOENT/)
  },
  TIMEOUT,
)

const knipAdjustments = async (paths: readonly string[]): Promise<EngineSettings> => {
  const detection = await detectFrameworks({
    profiles: FRAMEWORK_PROFILES,
    inventory: {
      root: dir,
      files: paths.map((path) => file(path)),
      languages: new Set(['ts']),
      workspaces: [{ name: 'root', dir: '' }],
    },
  })
  return engineAdjustmentsFor('knip', detection)
}

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

    expect(before).toContainEqual(expect.stringContaining('files src/migrations/Migration001.ts'))
    expect(before).toContainEqual(expect.stringContaining('files mikro-orm.config.ts'))
    expect(before).toContainEqual(expect.stringContaining('@mikro-orm/migrations'))

    expect(after.filter((line) => line.startsWith('files '))).toEqual([])
    expect(after.filter((line) => line.includes('@mikro-orm/'))).toEqual([])
  },
  TIMEOUT,
)

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
  await write('package.json', JSON.stringify({ name: 'root' }))
  const engine = createKnipEngine({ rootDir: dir })

  expect(await engine.availability?.()).toEqual({ available: true })
})


test('a framework may declare a workspace that holds no package.json', async () => {
  // A Nuxt layer is a directory with `app/`, `server/` and `composables/` and no manifest, so
  // `synthesizeKnipWorkspaces` never names it. Measured on `nuxt/nuxt.com`: as a workspace of its
  // own the layer's 77 unused-export findings go to 0, where the same globs on the *root* workspace
  // left 23. The workspace boundary is what makes an entry glob reach inside it.
  await write('package.json', JSON.stringify({ name: 'root' }))
  const path = (await createKnipEngine().materializeConfig(everything(), context)).path
  const adjustments: EngineSettings = [{ key: 'entry', workspace: 'layers/a', values: ['app/**/*.ts'] }]

  await mergeWorkspacesIntoConfig(path, synthesizeKnipWorkspaces([file('package.json')]), adjustments)

  const config = JSON.parse(await readFile(path, 'utf8')) as { workspaces: Record<string, unknown> }
  expect(Object.keys(config.workspaces).sort()).toEqual(['.', 'layers/a'])
})
