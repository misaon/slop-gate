import { expect, test } from 'vitest'
import type { FileInventory, InventoryFile } from '../discovery/types.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { engineAdjustmentsFor, frameworkRuleLayers } from './adjustments.ts'
import { detectFrameworks } from './detect.ts'
import { dualFiringConcepts } from './profiles.ts'
import type { FrameworkDetection } from './types.ts'

const inventoryFile = (path: string, workspace = ''): InventoryFile => ({
  path,
  language: path.endsWith('.json') ? 'json' : 'ts',
  workspace,
  size: 0,
  mtimeMs: 0,
})

/**
 * A repository reduced to the two things detection reads: an inventory, and the text behind the
 * handful of paths a probe may open. Nothing here touches the filesystem, which is the point — the
 * `dependency` and `path` probes are pure functions of the inventory, and `literal` is a pure
 * function of one file's text.
 */
const repository = (files: Record<string, string>, workspaces: Record<string, string> = {}): {
  inventory: FileInventory
  readText: (path: string) => Promise<string | null>
} => ({
  inventory: {
    root: '/repo',
    files: Object.keys(files)
      .sort()
      .map((path) => inventoryFile(path, workspaces[path] ?? '')),
    languages: new Set(['ts']),
    workspaces: [{ name: 'root', dir: '' }],
  },
  readText: async (path) => files[path] ?? null,
})

const manifest = (dependencies: Record<string, string>, field = 'dependencies'): string =>
  JSON.stringify({ name: 'app', [field]: dependencies })

const detect = async (files: Record<string, string>, workspaces?: Record<string, string>): Promise<FrameworkDetection> =>
  detectFrameworks(repository(files, workspaces))

const applied = (detection: FrameworkDetection, id: string) => detection.applied.find((a) => a.id === id)

// --- nestjs -----------------------------------------------------------------------------------

test('detects NestJS from @nestjs/core and disables the empty-class concept', async () => {
  const detection = await detect({ 'package.json': manifest({ '@nestjs/core': '^11.0.0' }) })
  const nestjs = applied(detection, 'nestjs')

  expect(nestjs?.evidence).toEqual([
    { kind: 'manifest-dependency', file: 'package.json', workspace: '', name: '@nestjs/core', field: 'dependencies' },
  ])
  expect(nestjs?.adjustments).toEqual([
    expect.objectContaining({ kind: 'disable-concept', concept: 'suspicious.no-extraneous-class' }),
  ])
})

test('does not detect NestJS in a repository that never declares it', async () => {
  const detection = await detect({ 'package.json': manifest({ express: '^5.0.0' }) })
  expect(applied(detection, 'nestjs')).toBeUndefined()
  expect(detection.inapplicable.map((entry) => entry.id)).not.toContain('nestjs')
})

test('finds a dependency declared only in a nested workspace manifest', async () => {
  const detection = await detect(
    { 'package.json': manifest({}), 'apps/api/package.json': manifest({ '@nestjs/core': '^11.0.0' }) },
    { 'apps/api/package.json': 'apps/api' },
  )
  expect(applied(detection, 'nestjs')?.evidence[0]).toMatchObject({ file: 'apps/api/package.json', workspace: 'apps/api' })
})

// --- angular ----------------------------------------------------------------------------------

test('detects Angular from @angular/core and disables the same empty-class concept', async () => {
  const detection = await detect({ 'package.json': manifest({ '@angular/core': '^19.0.0' }) })
  const angular = applied(detection, 'angular')

  expect(angular?.evidence).toEqual([
    { kind: 'manifest-dependency', file: 'package.json', workspace: '', name: '@angular/core', field: 'dependencies' },
  ])
  expect(angular?.adjustments).toEqual([
    expect.objectContaining({ kind: 'disable-concept', concept: 'suspicious.no-extraneous-class' }),
  ])
})

test('does not detect Angular in a repository that never declares it', async () => {
  const detection = await detect({ 'package.json': manifest({ '@nestjs/core': '^11.0.0' }) })
  expect(applied(detection, 'angular')).toBeUndefined()
})

/**
 * The union property from spec §23.3, exercised on the one concept two profiles genuinely contest.
 * Both want it off, so there is nothing to arbitrate: the rule layer carries it once, each profile
 * keeps its own reason for `rules why`, and the result is the same whichever order they ran in.
 */
test('two profiles disabling the same concept is idempotent, not a conflict', async () => {
  const detection = await detect({
    'package.json': manifest({ '@angular/core': '^19.0.0', '@nestjs/core': '^11.0.0' }),
  })

  const layers = frameworkRuleLayers(detection).filter((layer) =>
    Object.keys(layer.rules).includes('suspicious.no-extraneous-class'),
  )
  expect(layers.map((layer) => layer.source)).toEqual(['angular', 'nestjs'])
  for (const layer of layers) expect(layer.rules).toEqual({ 'suspicious.no-extraneous-class': 'off' })

  const reasons = detection.applied
    .flatMap((application) => application.adjustments)
    .filter((adjustment) => adjustment.kind === 'disable-concept' && adjustment.concept === 'suspicious.no-extraneous-class')
    .map((adjustment) => adjustment.reason)
  expect(new Set(reasons).size).toBe(2)
})

// --- nestjs-express ---------------------------------------------------------------------------

test('NestJS on Express ignores the transitively-provided express dependency', async () => {
  const detection = await detect({ 'package.json': manifest({ '@nestjs/platform-express': '^11.0.0' }) })
  expect(engineAdjustmentsFor('knip', detection)).toEqual([
    { key: 'ignoreDependencies', workspace: '', values: ['express'] },
  ])
})

test('a NestJS project without platform-express does not ignore express', async () => {
  const detection = await detect({ 'package.json': manifest({ '@nestjs/core': '^11.0.0', '@nestjs/platform-fastify': '^11.0.0' }) })
  expect(engineAdjustmentsFor('knip', detection)).toEqual([])
})

// --- mikro-orm --------------------------------------------------------------------------------

test('reads the migrations directory out of the ORM config and makes it a knip entry', async () => {
  const detection = await detect({
    'package.json': manifest({ '@mikro-orm/core': '^6.0.0' }),
    'mikro-orm.config.ts': "export default { migrations: { path: './src/migrations' } }\n",
  })

  expect(applied(detection, 'mikro-orm')?.evidence).toContainEqual({
    kind: 'config-literal',
    file: 'mikro-orm.config.ts',
    property: 'migrations.path',
    value: './src/migrations',
  })
  expect(engineAdjustmentsFor('knip', detection)).toEqual([
    {
      key: 'entry',
      workspace: '',
      values: ['mikro-orm.config.ts', 'src/migrations/*.{js,mjs,cjs,ts,mts,cts}'],
    },
  ])
})

test('scopes the entry to the workspace the ORM config belongs to', async () => {
  const detection = await detect(
    {
      'package.json': manifest({}),
      'apps/api/package.json': manifest({ '@mikro-orm/core': '^6.0.0' }),
      'apps/api/mikro-orm.config.ts': "export default { migrations: { path: './migrations' } }\n",
    },
    { 'apps/api/package.json': 'apps/api', 'apps/api/mikro-orm.config.ts': 'apps/api' },
  )

  expect(engineAdjustmentsFor('knip', detection)).toEqual([
    {
      key: 'entry',
      workspace: 'apps/api',
      values: ['migrations/*.{js,mjs,cjs,ts,mts,cts}', 'mikro-orm.config.ts'],
    },
  ])
})

test('stands down, with a reason, when migrations.path is not a literal', async () => {
  const detection = await detect({
    'package.json': manifest({ '@mikro-orm/core': '^6.0.0' }),
    'mikro-orm.config.ts': 'export default { migrations: { path: MIGRATIONS_DIR } }\n',
  })

  expect(applied(detection, 'mikro-orm')).toBeUndefined()
  expect(engineAdjustmentsFor('knip', detection)).toEqual([])
  expect(detection.inapplicable).toContainEqual(
    expect.objectContaining({
      id: 'mikro-orm',
      blocked: expect.stringContaining('not a plain string literal'),
    }),
  )
})

test('stands down, with a reason, when no ORM config file exists at all', async () => {
  const detection = await detect({ 'package.json': manifest({ '@mikro-orm/core': '^6.0.0' }) })
  expect(detection.inapplicable).toContainEqual(
    expect.objectContaining({ id: 'mikro-orm', blocked: expect.stringContaining('mikro-orm.config.*') }),
  )
})

// --- vitepress --------------------------------------------------------------------------------

test('points knip at a VitePress site that is not at the workspace root', async () => {
  const detection = await detect({
    'package.json': manifest({ vitepress: '^2.0.0' }, 'devDependencies'),
    'docs/.vitepress/config.mts': 'export default {}\n',
  })

  expect(engineAdjustmentsFor('knip', detection)).toEqual([
    {
      key: 'vitepress.entry',
      workspace: '',
      values: [
        'docs/.vitepress/config.{js,mjs,cjs,ts,mts,cts}',
        'docs/.vitepress/config/index.{js,mjs,cjs,ts,mts,cts}',
        'docs/.vitepress/theme/index.{js,mjs,cjs,ts,mts,cts}',
      ],
    },
  ])
})

test('a site already at the workspace root restates knip own patterns rather than special-casing', async () => {
  const detection = await detect({
    'package.json': manifest({ vitepress: '^2.0.0' }, 'devDependencies'),
    '.vitepress/config.ts': 'export default {}\n',
  })

  expect(engineAdjustmentsFor('knip', detection)[0]?.values).toEqual([
    '.vitepress/config.{js,mjs,cjs,ts,mts,cts}',
    '.vitepress/config/index.{js,mjs,cjs,ts,mts,cts}',
    '.vitepress/theme/index.{js,mjs,cjs,ts,mts,cts}',
  ])
})

test('two sites in one workspace both contribute, and the union is sorted', async () => {
  const detection = await detect({
    'package.json': manifest({ vitepress: '^2.0.0' }, 'devDependencies'),
    'docs/.vitepress/config.mts': 'export default {}\n',
    'site/.vitepress/config.mts': 'export default {}\n',
  })

  const values = engineAdjustmentsFor('knip', detection)[0]?.values ?? []
  expect(values).toHaveLength(6)
  expect(values).toEqual([...values].sort())
  expect(values).toContain('docs/.vitepress/config.{js,mjs,cjs,ts,mts,cts}')
  expect(values).toContain('site/.vitepress/config.{js,mjs,cjs,ts,mts,cts}')
})

// --- test-framework ---------------------------------------------------------------------------

const disabledConcepts = (detection: FrameworkDetection): readonly string[] =>
  Object.keys(frameworkRuleLayers(detection).find((layer) => layer.source === 'test-framework')?.rules ?? {})

/**
 * The dual-firing set is exactly the rules both plugins implement, and nothing else. Measured: the
 * whole-scope version of this profile also disabled `correctness.no-export` (from `jest/no-export`,
 * which vitest has no counterpart for and which therefore never double-reports) — a silent coverage
 * loss on every vitest repository. Pinned here so a wider definition cannot creep back in.
 */
test('the dual-firing set contains only rules both plugins implement', () => {
  const values = (scope: string): Set<string> =>
    new Set(
      RULE_ENTRIES.filter((entry) => entry.engineRuleId.startsWith(`${scope}/`)).map((entry) =>
        entry.engineRuleId.slice(scope.length + 1),
      ),
    )
  const jestOnly = [...values('jest')].filter((value) => !values('vitest').has(value))
  expect(jestOnly.length).toBeGreaterThan(0)

  const disabled = new Set(dualFiringConcepts('jest', 'vitest'))
  const jestOnlyConcepts = RULE_ENTRIES.filter(
    (entry) => entry.engineRuleId.startsWith('jest/') && jestOnly.includes(entry.engineRuleId.slice(5)),
  ).flatMap((entry) => entry.concepts)

  expect(jestOnlyConcepts.filter((concept) => disabled.has(concept))).toEqual([])
  expect(disabled.has('correctness.no-export' as never)).toBe(false)
})

/**
 * Load-bearing: the profile turns concepts off by id, which is only safe while no concept claimed by
 * a jest- or vitest-scope rule is also claimed by a rule outside that scope. An oxlint release that
 * made `jest/x` and `unicorn/y` share one would otherwise silently disable the unicorn rule too.
 */
test('no concept claimed by a jest- or vitest-scope rule is claimed by any rule outside it', () => {
  for (const [scope, counterpart] of [['jest', 'vitest'], ['vitest', 'jest']]) {
    const inScope = new Set(dualFiringConcepts(scope!, counterpart!))
    const outsiders = RULE_ENTRIES.filter(
      (entry) => !entry.engineRuleId.startsWith(`${scope}/`) && entry.concepts.some((c) => inScope.has(c)),
    )
    expect({ scope, outsiders: outsiders.map((entry) => entry.engineRuleId) }).toEqual({ scope, outsiders: [] })
  }
})

test('a vitest-only repository disables the jest scope and keeps the vitest one', async () => {
  const detection = await detect({ 'package.json': manifest({ vitest: '^3.0.0' }, 'devDependencies') })
  expect(disabledConcepts(detection)).toEqual(dualFiringConcepts('jest', 'vitest'))
})

test('a jest-only repository disables the vitest scope and keeps the jest one', async () => {
  const detection = await detect({ 'package.json': manifest({ jest: '^30.0.0' }, 'devDependencies') })
  expect(disabledConcepts(detection)).toEqual(dualFiringConcepts('vitest', 'jest'))
})

test('both installed disables both scopes — the double report would be genuine', async () => {
  const detection = await detect({
    'package.json': manifest({ jest: '^30.0.0', vitest: '^3.0.0' }, 'devDependencies'),
  })
  expect(disabledConcepts(detection)).toEqual(
    [...dualFiringConcepts('jest', 'vitest'), ...dualFiringConcepts('vitest', 'jest')].sort(),
  )
})

test('neither installed disables both scopes, degrading to the exclusion this replaces', async () => {
  const both = await detect({ 'package.json': manifest({ jest: '^30.0.0', vitest: '^3.0.0' }, 'devDependencies') })
  const neither = await detect({ 'package.json': manifest({}) })

  expect(disabledConcepts(neither)).toEqual(disabledConcepts(both))
  expect(applied(neither, 'test-framework')?.evidence).toEqual([])
})

// --- determinism ------------------------------------------------------------------------------

test('the same repository detects identically regardless of manifest key order', async () => {
  const forward = await detect({
    'package.json': JSON.stringify({
      dependencies: { '@nestjs/core': '1', '@mikro-orm/core': '1' },
      devDependencies: { vitest: '1', vitepress: '1' },
    }),
    'mikro-orm.config.ts': "export default { migrations: { path: 'src/migrations' } }",
    'docs/.vitepress/config.ts': 'export default {}',
  })
  const reversed = await detect({
    'package.json': JSON.stringify({
      devDependencies: { vitepress: '1', vitest: '1' },
      dependencies: { '@mikro-orm/core': '1', '@nestjs/core': '1' },
    }),
    'mikro-orm.config.ts': "export default { migrations: { path: 'src/migrations' } }",
    'docs/.vitepress/config.ts': 'export default {}',
  })

  expect(forward).toEqual(reversed)
  expect(forward.applied.map((a) => a.id)).toEqual([...forward.applied.map((a) => a.id)].sort())
})

test('detection reads no manifest the inventory did not list', async () => {
  const read: string[] = []
  await detectFrameworks({
    inventory: repository({ 'package.json': manifest({ '@nestjs/core': '1' }) }).inventory,
    async readText(path) {
      read.push(path)
      return path === 'package.json' ? manifest({ '@nestjs/core': '1' }) : null
    },
  })
  expect(read).toEqual(['package.json'])
})
