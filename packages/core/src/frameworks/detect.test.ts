import { expect, test } from 'vitest'
import type { FileInventory, InventoryFile } from '../discovery/types.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { createRuleSetResolver } from '../config/resolve.ts'
import { engineAdjustmentsFor, frameworkOverrideLayers, frameworkRuleLayers } from './adjustments.ts'
import { detectFrameworks } from './detect.ts'
import { dualFiringConcepts, scopeConcepts } from './profiles.ts'
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
    // `node_modules` is readable but never inventoried (`discovery/sources.ts`, `ALWAYS_SKIPPED`),
    // which is the whole distinction an `extends` into a published base config turns on.
    files: Object.keys(files)
      .filter((path) => !path.split('/').includes('node_modules'))
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

// --- react-jsx-transform ----------------------------------------------------------------------

const tsconfig = (jsx: string | null): string =>
  JSON.stringify({ compilerOptions: jsx === null ? { strict: true } : { jsx, strict: true } })

test('disables react-in-jsx-scope when the only tsconfig asks for the automatic runtime', async () => {
  const detection = await detect({ 'tsconfig.json': tsconfig('react-jsx') })
  const react = applied(detection, 'react-jsx-transform')

  expect(react?.evidence).toEqual([
    { kind: 'config-literal', file: 'tsconfig.json', property: 'compilerOptions.jsx', value: 'react-jsx' },
  ])
  expect(react?.adjustments).toEqual([
    expect.objectContaining({ kind: 'disable-concept', concept: 'suspicious.react-in-jsx-scope' }),
  ])
})

test('treats react-jsxdev as the automatic runtime too', async () => {
  const detection = await detect({ 'tsconfig.json': tsconfig('react-jsxdev') })
  expect(applied(detection, 'react-jsx-transform')?.adjustments).toHaveLength(1)
})

test('collects every automatic tsconfig in a monorepo as evidence', async () => {
  const detection = await detect({
    'tsconfig.base.json': tsconfig('react-jsx'),
    'apps/web/tsconfig.json': tsconfig('react-jsx'),
    'packages/ui/tsconfig.json': tsconfig(null),
  })

  expect(applied(detection, 'react-jsx-transform')?.evidence).toEqual([
    { kind: 'config-literal', file: 'apps/web/tsconfig.json', property: 'compilerOptions.jsx', value: 'react-jsx' },
    { kind: 'config-literal', file: 'tsconfig.base.json', property: 'compilerOptions.jsx', value: 'react-jsx' },
  ])
})

test('reads a jsx value through the comments a tsconfig is allowed to carry', async () => {
  const detection = await detect({
    'tsconfig.json': '{\n  // "jsx": "react" was the old setting\n  "compilerOptions": { "jsx": "react-jsx" }\n}\n',
  })
  expect(applied(detection, 'react-jsx-transform')?.evidence).toEqual([
    { kind: 'config-literal', file: 'tsconfig.json', property: 'compilerOptions.jsx', value: 'react-jsx' },
  ])
})

test('leaves the rule alone when the classic transform is the only one configured', async () => {
  const detection = await detect({ 'tsconfig.json': tsconfig('react') })
  expect(applied(detection, 'react-jsx-transform')).toBeUndefined()
  expect(detection.inapplicable.some((entry) => entry.id === 'react-jsx-transform')).toBe(false)
})

test('stands down, naming both files, when two tsconfigs disagree about the transform', async () => {
  const detection = await detect({
    'apps/legacy/tsconfig.json': tsconfig('react'),
    'apps/web/tsconfig.json': tsconfig('react-jsx'),
  })

  expect(applied(detection, 'react-jsx-transform')).toBeUndefined()
  expect(detection.inapplicable).toContainEqual(
    expect.objectContaining({
      id: 'react-jsx-transform',
      blocked: expect.stringContaining('apps/legacy/tsconfig.json'),
    }),
  )
  expect(detection.inapplicable.find((entry) => entry.id === 'react-jsx-transform')?.blocked).toContain(
    'apps/web/tsconfig.json',
  )
})

test('says nothing about a transform TypeScript hands to another tool', async () => {
  const detection = await detect({
    'tsconfig.json': tsconfig('preserve'),
    'native/tsconfig.json': tsconfig('react-native'),
  })
  expect(applied(detection, 'react-jsx-transform')).toBeUndefined()
  expect(detection.inapplicable.some((entry) => entry.id === 'react-jsx-transform')).toBe(false)
})

test('says nothing when no tsconfig configures jsx at all', async () => {
  const detection = await detect({ 'tsconfig.json': tsconfig(null), 'package.json': manifest({ react: '^19.0.0' }) })
  expect(applied(detection, 'react-jsx-transform')).toBeUndefined()
})

/**
 * The measured monorepo, reduced to its tsconfig graph: 19 config files, 4 of which set `jsx`, and
 * the three apps holding most of the `.tsx` set nothing and reach the value two levels up. A silent
 * config is not a dissenter, and this is the case that says so.
 */
test('applies when the apps inherit the transform two levels up and set nothing themselves', async () => {
  const detection = await detect({
    'tsconfig.base.json': JSON.stringify({ compilerOptions: { strict: true } }),
    'tsconfig.app.json': JSON.stringify({
      extends: './tsconfig.base.json',
      compilerOptions: { jsx: 'react-jsx' },
    }),
    'apps/acquisition/tsconfig.json': JSON.stringify({ extends: '../../tsconfig.app.json' }),
    'apps/client-zone/tsconfig.json': JSON.stringify({ extends: '../../tsconfig.app.json' }),
    'apps/console/tsconfig.json': JSON.stringify({ extends: '../../tsconfig.app.json' }),
    'packages/ui/tsconfig.json': JSON.stringify({ extends: '../../tsconfig.app.json' }),
  })

  expect(applied(detection, 'react-jsx-transform')?.evidence).toEqual([
    { kind: 'config-literal', file: 'tsconfig.app.json', property: 'compilerOptions.jsx', value: 'react-jsx' },
  ])
})

test('counts a config that inherits the classic transform as a dissenter', async () => {
  const detection = await detect({
    'tsconfig.app.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
    'legacy/base.json': JSON.stringify({ compilerOptions: { jsx: 'react' } }),
    'legacy/tsconfig.json': JSON.stringify({ extends: './base.json' }),
  })

  expect(applied(detection, 'react-jsx-transform')).toBeUndefined()
  expect(detection.inapplicable).toContainEqual(
    expect.objectContaining({ id: 'react-jsx-transform', blocked: expect.stringContaining('legacy/base.json') }),
  )
})

test('lets a leaf override a classic base that is not itself a project here', async () => {
  const detection = await detect({
    'apps/web/tsconfig.json': JSON.stringify({
      extends: '@acme/tsconfig',
      compilerOptions: { jsx: 'react-jsx' },
    }),
    'node_modules/@acme/tsconfig/tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react' } }),
  })

  expect(applied(detection, 'react-jsx-transform')?.evidence).toEqual([
    { kind: 'config-literal', file: 'apps/web/tsconfig.json', property: 'compilerOptions.jsx', value: 'react-jsx' },
  ])
})

/**
 * A committed `tsconfig.base.json` declaring the classic transform is a dissenter even when every
 * leaf overrides it, because it is a config file in its own right and `tsc -p tsconfig.base.json`
 * would use it. Distinguishing "a base nobody compiles" from "a project" needs the reverse extends
 * graph and is still ambiguous at the end of it, so this stays on the safe side and says which file
 * it is unhappy about.
 */
test('treats a committed classic base as a dissenter even when every leaf overrides it', async () => {
  const detection = await detect({
    'tsconfig.base.json': JSON.stringify({ compilerOptions: { jsx: 'react' } }),
    'apps/web/tsconfig.json': JSON.stringify({
      extends: '../../tsconfig.base.json',
      compilerOptions: { jsx: 'react-jsx' },
    }),
  })

  expect(detection.inapplicable).toContainEqual(
    expect.objectContaining({ id: 'react-jsx-transform', blocked: expect.stringContaining('tsconfig.base.json') }),
  )
})

test('stands down when an extends chain cannot be followed at all', async () => {
  const detection = await detect({
    'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
    'apps/native/tsconfig.json': JSON.stringify({ extends: '@tsconfig/react-native/tsconfig.json' }),
  })

  expect(applied(detection, 'react-jsx-transform')).toBeUndefined()
  expect(detection.inapplicable).toContainEqual(
    expect.objectContaining({
      id: 'react-jsx-transform',
      blocked: expect.stringContaining('@tsconfig/react-native'),
    }),
  )
})

// --- test-framework ---------------------------------------------------------------------------

const ruleIdsInScope = (scope: string): Set<string> =>
  new Set(
    RULE_ENTRIES.filter((entry) => entry.engineRuleId.startsWith(`${scope}/`)).map((entry) =>
      entry.engineRuleId.slice(scope.length + 1),
    ),
  )

const disabledConcepts = (detection: FrameworkDetection): readonly string[] =>
  Object.keys(frameworkRuleLayers(detection).find((layer) => layer.source === 'test-framework')?.rules ?? {})

/**
 * The dual-firing set is exactly the rules both plugins implement, and nothing else. Measured: the
 * whole-scope version of this profile also disabled `correctness.no-export` (from `jest/no-export`,
 * which vitest has no counterpart for and which therefore never double-reports) — a silent coverage
 * loss on every vitest repository. Pinned here so a wider definition cannot creep back in.
 */
test('the dual-firing set contains only rules both plugins implement', () => {
  const jestOnly = [...ruleIdsInScope('jest')].filter((value) => !ruleIdsInScope('vitest').has(value))
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
  expect(forward.applied.map((a) => a.id)).toEqual(forward.applied.map((a) => a.id).sort())
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

// --- nextjs -----------------------------------------------------------------------------------

const NEXT_MONOREPO = {
  'package.json': manifest({ turbo: '^2.0.0' }, 'devDependencies'),
  'apps/web/package.json': manifest({ next: '^16.0.0' }),
  'apps/web/next.config.ts': 'export default {}',
  'apps/web/app/page.tsx': 'export default function Page() { return null }',
  'packages/ui/package.json': manifest({ react: '^19.0.0' }),
  'packages/ui/src/Logo.tsx': 'export const Logo = () => null',
}

const NEXT_WORKSPACES = {
  'apps/web/package.json': 'apps/web',
  'apps/web/next.config.ts': 'apps/web',
  'apps/web/app/page.tsx': 'apps/web',
  'packages/ui/package.json': 'packages/ui',
  'packages/ui/src/Logo.tsx': 'packages/ui',
}

test('detects Next.js from a `next` dependency beside a `next.config.*`, and names both', async () => {
  const nextjs = applied(await detect(NEXT_MONOREPO, NEXT_WORKSPACES), 'nextjs')
  expect(nextjs?.evidence).toEqual([
    { kind: 'manifest-dependency', file: 'apps/web/package.json', workspace: 'apps/web', name: 'next', field: 'dependencies' },
    { kind: 'path-present', file: 'apps/web/next.config.ts' },
  ])
})

/**
 * The whole point of the profile: every `nextjs` concept is already `error` repository-wide, and the
 * only thing left to say about it is *where*. So the adjustments are subtractions, all path-scoped,
 * and they name the workspaces that cannot follow the advice rather than the app that can.
 */
test('scopes every nextjs concept off in the workspaces that declare no `next`', async () => {
  const nextjs = applied(await detect(NEXT_MONOREPO, NEXT_WORKSPACES), 'nextjs')
  const scoped = scopeConcepts('nextjs')

  expect(scoped).toContain('correctness.no-img-element')
  expect(nextjs?.adjustments).toHaveLength(scoped.length)
  expect(nextjs?.adjustments.map((adjustment) => adjustment.kind)).toEqual(scoped.map(() => 'disable-concept'))
  for (const adjustment of nextjs?.adjustments ?? []) {
    expect(adjustment).toMatchObject({ paths: ['packages/ui/**'] })
  }
})

test('the scoped subtraction reaches the sibling package and leaves the application alone', async () => {
  const detection = await detect(NEXT_MONOREPO, NEXT_WORKSPACES)
  const resolver = createRuleSetResolver({
    config: { extends: ['recommended'] },
    frameworks: frameworkRuleLayers(detection),
    frameworkOverrides: frameworkOverrideLayers(detection),
  })
  const level = (path: string) => resolver.forFile(path).rules.get('correctness.no-img-element' as never)?.level

  expect(level('packages/ui/src/Logo.tsx')).toBe('off')
  expect(level('apps/web/app/page.tsx')).toBe('error')
  expect(resolver.base.rules.get('correctness.no-img-element' as never)?.level).toBe('error')
})

/**
 * The common case, and the one where the apparatus has to be invisible: a repository that *is* the
 * application has no sibling to scope against, so the profile applies, records its evidence, and
 * contributes nothing.
 */
test('a single-app repository gets evidence and no adjustments at all', async () => {
  const nextjs = applied(
    await detect({ 'package.json': manifest({ next: '^16.0.0' }), 'next.config.mjs': 'export default {}' }),
    'nextjs',
  )
  expect(nextjs?.evidence).toHaveLength(2)
  expect(nextjs?.adjustments).toEqual([])
})

/**
 * A glob must never reach past a nested workspace that *does* declare `next`, so an ancestor of one
 * is dropped from the scope rather than carved around it. The cost is that files sitting directly in
 * the ancestor keep the rules on, which is the direction it is safe to be wrong in.
 */
test('an ancestor of a workspace that declares `next` is left out of the scope entirely', async () => {
  const nextjs = applied(
    await detect(
      {
        'package.json': manifest({ turbo: '^2.0.0' }, 'devDependencies'),
        'apps/package.json': manifest({ typescript: '^5.0.0' }, 'devDependencies'),
        'apps/web/package.json': manifest({ next: '^16.0.0' }),
        'apps/web/next.config.ts': 'export default {}',
        'packages/ui/package.json': manifest({ react: '^19.0.0' }),
      },
      {
        'apps/package.json': 'apps',
        'apps/web/package.json': 'apps/web',
        'apps/web/next.config.ts': 'apps/web',
        'packages/ui/package.json': 'packages/ui',
      },
    ),
    'nextjs',
  )
  expect(nextjs?.adjustments[0]).toMatchObject({ paths: ['packages/ui/**'] })
})

/**
 * `next` without a config is a package that *imports from* Next.js, not one that *is* a Next.js
 * application — a shared UI library using `next/image` is the ordinary case. Guessing would aim the
 * plugin at whichever answer was convenient; standing down leaves the status quo visible instead.
 */
test('a `next` dependency with no config anywhere stands the profile down and says why', async () => {
  const detection = await detect({ 'package.json': manifest({ next: '^16.0.0' }) })
  expect(applied(detection, 'nextjs')).toBeUndefined()
  expect(detection.inapplicable.find((entry) => entry.id === 'nextjs')?.blocked).toContain('next.config.*')
})

test('does not detect Next.js in a repository that never declares it', async () => {
  const detection = await detect({ 'package.json': manifest({ react: '^19.0.0' }) })
  expect(applied(detection, 'nextjs')).toBeUndefined()
  expect(detection.inapplicable.map((entry) => entry.id)).not.toContain('nextjs')
})
