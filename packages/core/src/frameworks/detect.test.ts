import { expect, test } from 'vitest'
import type { ConceptId } from '../concepts/catalogue.ts'
import type { FileInventory, InventoryFile } from '../discovery/types.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { createRuleSetResolver } from '../config/resolve.ts'
import type { RuleKey } from '../config/types.ts'
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

const repository = (files: Record<string, string>, workspaces: Record<string, string> = {}): {
  inventory: FileInventory
  readText: (path: string) => Promise<string | null>
} => ({
  inventory: {
    root: '/repo',
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

test('scopes the disable to the automatic project instead of standing down over a classic sibling', async () => {
  const detection = await detect({
    'apps/legacy/tsconfig.json': tsconfig('react'),
    'apps/web/tsconfig.json': tsconfig('react-jsx'),
  })

  expect(applied(detection, 'react-jsx-transform')?.adjustments).toEqual([
    expect.objectContaining({
      kind: 'disable-concept',
      concept: 'suspicious.react-in-jsx-scope',
      paths: ['apps/web/**'],
    }),
  ])
})

test('keeps the rule on for an automatic project that contains a classic one', async () => {
  const detection = await detect({
    'apps/web/tsconfig.json': tsconfig('react-jsx'),
    'apps/web/legacy/tsconfig.json': tsconfig('react'),
  })

  expect(applied(detection, 'react-jsx-transform')).toBeUndefined()
  expect(detection.inapplicable.find((entry) => entry.id === 'react-jsx-transform')?.blocked).toContain(
    'apps/web/legacy/tsconfig.json',
  )
})

test('narrows an automatic project to its own include list so a sibling classic one does not block it', async () => {
  const detection = await detect({
    'tsconfig.spec.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' }, include: ['src'] }),
    'benchmarks/jsx/tsconfig.json': tsconfig('react'),
  })

  expect(applied(detection, 'react-jsx-transform')?.adjustments).toEqual([
    expect.objectContaining({ kind: 'disable-concept', paths: ['src/**'] }),
  ])
})

test('says nothing about a deferred transform with no jsxImportSource to name a runtime', async () => {
  const detection = await detect({
    'tsconfig.json': tsconfig('preserve'),
    'native/tsconfig.json': tsconfig('react-native'),
  })
  expect(applied(detection, 'react-jsx-transform')).toBeUndefined()
  expect(detection.inapplicable.some((entry) => entry.id === 'react-jsx-transform')).toBe(false)
})

test('disables the rule when a deferred transform names a runtime that is not React', async () => {
  const detection = await detect({
    'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'preserve', jsxImportSource: 'solid-js' } }),
  })

  expect(applied(detection, 'react-jsx-transform')?.evidence).toContainEqual({
    kind: 'config-literal',
    file: 'tsconfig.json',
    property: 'compilerOptions.jsxImportSource',
    value: 'solid-js',
  })
  expect(applied(detection, 'react-jsx-transform')?.adjustments).toHaveLength(1)
})

test('keeps treating a deferred transform as no evidence when jsxImportSource names React itself', async () => {
  const detection = await detect({
    'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'preserve', jsxImportSource: 'react' } }),
  })
  expect(applied(detection, 'react-jsx-transform')).toBeUndefined()
})

test('says nothing when no tsconfig configures jsx at all', async () => {
  const detection = await detect({ 'tsconfig.json': tsconfig(null), 'package.json': manifest({ react: '^19.0.0' }) })
  expect(applied(detection, 'react-jsx-transform')).toBeUndefined()
})

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

const ruleIdsInScope = (scope: string): Set<string> =>
  new Set(
    RULE_ENTRIES.filter((entry) => entry.engineRuleId.startsWith(`${scope}/`)).map((entry) =>
      entry.engineRuleId.slice(scope.length + 1),
    ),
  )

const disabledConcepts = (detection: FrameworkDetection): readonly string[] =>
  Object.keys(frameworkRuleLayers(detection).find((layer) => layer.source === 'test-framework')?.rules ?? {})

test('the dual-firing set contains only rules both plugins implement', () => {
  const jestOnly = [...ruleIdsInScope('jest')].filter((value) => !ruleIdsInScope('vitest').has(value))
  expect(jestOnly.length).toBeGreaterThan(0)

  const disabled = new Set(dualFiringConcepts('jest', 'vitest'))
  const jestOnlyConcepts = RULE_ENTRIES.filter(
    (entry) => entry.engineRuleId.startsWith('jest/') && jestOnly.includes(entry.engineRuleId.slice(5)),
  ).flatMap((entry) => entry.concepts)

  expect(jestOnlyConcepts.filter((concept) => disabled.has(concept))).toEqual([])
  expect(disabled.has('correctness.no-export' as ConceptId)).toBe(false)
})

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

test('a jest repository turns the mock-factory false positive off in test files only', async () => {
  const detection = await detect({ 'package.json': manifest({ jest: '^30.0.0' }, 'devDependencies') })
  const resolver = createRuleSetResolver({
    config: { extends: ['recommended'] },
    frameworks: frameworkRuleLayers(detection),
    frameworkOverrides: frameworkOverrideLayers(detection),
  })
  const level = (path: string) =>
    resolver.forFile(path).rules.get('suspicious.consistent-function-scoping' as RuleKey)?.level

  expect(level('src/service.test.ts')).toBe('off')
  expect(level('src/__tests__/service.ts')).toBe('off')
  expect(level('src/service.ts')).toBe('warn')
})

test('a chai repository turns the no-op-expression rule off in test files only', async () => {
  const detection = await detect({ 'package.json': manifest({ chai: '^5.0.0' }, 'devDependencies') })
  const resolver = createRuleSetResolver({
    config: { extends: ['recommended'] },
    frameworks: frameworkRuleLayers(detection),
    frameworkOverrides: frameworkOverrideLayers(detection),
  })
  const level = (path: string) => resolver.forFile(path).rules.get('dead-code.no-op-expression' as RuleKey)?.level

  expect(level('test/functional/query-builder.test.ts')).toBe('off')
  expect(level('integration/injector/multiple-providers.spec.ts')).toBe('off')
  expect(level('src/__tests__/thing.ts')).toBe('off')
  expect(level('packages/core/nest-application.ts')).toBe('error')
})

test('a repository that does not declare chai keeps the rule on everywhere', async () => {
  const detection = await detect({ 'package.json': manifest({ vitest: '^3.0.0' }, 'devDependencies') })
  const resolver = createRuleSetResolver({
    config: { extends: ['recommended'] },
    frameworks: frameworkRuleLayers(detection),
    frameworkOverrides: frameworkOverrideLayers(detection),
  })

  expect(resolver.forFile('src/thing.test.ts').rules.get('dead-code.no-op-expression' as RuleKey)?.level).toBe('error')
  expect(applied(detection, 'chai')).toBeUndefined()
})

test('a vitest-only repository keeps the mock-factory rule on, because upstream exempts only jest', async () => {
  const detection = await detect({ 'package.json': manifest({ vitest: '^3.0.0' }, 'devDependencies') })
  const resolver = createRuleSetResolver({
    config: { extends: ['recommended'] },
    frameworks: frameworkRuleLayers(detection),
    frameworkOverrides: frameworkOverrideLayers(detection),
  })

  expect(resolver.forFile('src/service.test.ts').rules.get('suspicious.consistent-function-scoping' as RuleKey)?.level).toBe(
    'warn',
  )
})

test('neither installed disables both scopes, degrading to the exclusion this replaces', async () => {
  const both = await detect({ 'package.json': manifest({ jest: '^30.0.0', vitest: '^3.0.0' }, 'devDependencies') })
  const neither = await detect({ 'package.json': manifest({}) })

  expect(disabledConcepts(neither)).toEqual(disabledConcepts(both))
  expect(applied(neither, 'test-framework')?.evidence).toEqual([])
})

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
  const level = (path: string) => resolver.forFile(path).rules.get('correctness.no-img-element' as RuleKey)?.level

  expect(level('packages/ui/src/Logo.tsx')).toBe('off')
  expect(level('apps/web/app/page.tsx')).toBe('warn')
  expect(resolver.base.rules.get('correctness.no-img-element' as RuleKey)?.level).toBe('warn')
})

test('a single-app repository gets evidence and no adjustments at all', async () => {
  const nextjs = applied(
    await detect({ 'package.json': manifest({ next: '^16.0.0' }), 'next.config.mjs': 'export default {}' }),
    'nextjs',
  )
  expect(nextjs?.evidence).toHaveLength(2)
  expect(nextjs?.adjustments).toEqual([])
})

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

test('a `next` dependency with no config anywhere stands the profile down and says why', async () => {
  const detection = await detect({ 'package.json': manifest({ next: '^16.0.0' }) })
  expect(applied(detection, 'nextjs')).toBeUndefined()
  expect(detection.inapplicable.find((entry) => entry.id === 'nextjs')?.blocked).toContain('next.config.*')
})

test('a repository that never declares Next.js gets the scope turned off, not left alone', async () => {
  // This used to assert the profile stayed silent. Silence meant all 21 rules in the scope aimed at
  // a codebase they cannot describe — see the Remix measurement above.
  const detection = await detect({ 'package.json': manifest({ react: '^19.0.0' }) })
  const applied_ = applied(detection, 'nextjs')

  expect(applied_?.evidence).toEqual([])
  expect(applied_?.adjustments.every((adjustment) => adjustment.kind === 'disable-concept')).toBe(true)
  expect(detection.inapplicable.map((entry) => entry.id)).not.toContain('nextjs')
})

test('turns the whole Next.js scope off in a repository that has no Next.js at all', async () => {
  // Reported from `remix-run/indie-stack`: three `correctness.no-img-element` findings whose help
  // text says "Consider using `<Image />` from `next/image`" — in a Remix app with no `next`
  // dependency anywhere. Every rule in the scope resolves to "import from `next/…` instead", which
  // a project without Next.js cannot do. The profile already argues exactly this for sibling
  // workspaces in a monorepo; the whole-repository case is the same argument with a simpler scope.
  const detection = await detect({ 'package.json': manifest({ '@remix-run/node': '^2.0.0' }) })
  const resolver = createRuleSetResolver({
    config: { extends: ['recommended'] },
    frameworks: frameworkRuleLayers(detection),
    frameworkOverrides: frameworkOverrideLayers(detection),
  })

  expect(resolver.forFile('app/routes/_index.tsx').rules.get('correctness.no-img-element' as RuleKey)?.level).toBe('off')
})

test('leaves the Next.js scope on where Next.js is actually used', async () => {
  const detection = await detect({
    'package.json': manifest({ next: '^15.0.0' }),
    'next.config.js': 'export default {}\n',
  })
  const resolver = createRuleSetResolver({
    config: { extends: ['recommended'] },
    frameworks: frameworkRuleLayers(detection),
    frameworkOverrides: frameworkOverrideLayers(detection),
  })

  expect(resolver.forFile('app/page.tsx').rules.get('correctness.no-img-element' as RuleKey)?.level).not.toBe('off')
})


// --- nuxt -------------------------------------------------------------------------------------

test('teaches knip Nuxt aliases, which its own plugin does not resolve', async () => {
  // Measured on `nuxt/nuxt.com` with dependencies installed: 14 `deps.unresolved-import` at error,
  // every one `#shared/...` or `#app`, plus 65 `dead-code.unused-export` — an import knip cannot
  // resolve is an import it does not count, so the exports behind it look dead. knip 6.31.0's Nuxt
  // plugin ignores `#build/`, `#components`, `#imports`, `#internal/` and `#spa-template`, and
  // neither of these.
  const detection = await detect({
    'package.json': manifest({ nuxt: '^3.14.0' }, 'devDependencies'),
    'nuxt.config.ts': 'export default defineNuxtConfig({})\n',
    'shared/types.ts': 'export type A = 1\n',
  })

  expect(engineAdjustmentsFor('knip', detection).find((entry) => entry.key === 'ignoreUnresolved')?.values).toEqual(
    expect.arrayContaining(['^#app', '^#shared']),
  )
})

test('says nothing about a repository that does not use Nuxt', async () => {
  const detection = await detect({ 'package.json': manifest({ vue: '^3.5.0' }) })
  expect(applied(detection, 'nuxt')).toBeUndefined()
})

// --- firebase-functions -----------------------------------------------------------------------

test('makes Firebase Functions handlers entry points', async () => {
  // Measured on a real service: five `functions/src/handlers/*.ts` reported as an unused default
  // export. The platform loads them by path, so no import graph reaches them — the same shape as
  // MikroORM migrations. knip 6.31.0 ships no firebase plugin, so this is a plain `entry`
  // contribution.
  const detection = await detect(
    {
      'package.json': manifest({}),
      'functions/package.json': manifest({ 'firebase-functions': '^6.0.0' }),
      'functions/src/index.ts': 'export const a = 1\n',
    },
    { 'functions/package.json': 'functions' },
  )

  expect(engineAdjustmentsFor('knip', detection)).toContainEqual(
    expect.objectContaining({ key: 'entry', workspace: 'functions' }),
  )
})


test('makes each Nuxt layer its own knip workspace', async () => {
  // The lever, and the one that took three attempts to find. Layer findings on `nuxt/nuxt.com` by
  // configuration: 77 with no contribution, 23 with the same globs on the *root* workspace, 0 with
  // the layer as a workspace of its own. A layer has no `package.json`, so the inventory cannot name
  // it and this adjustment does.
  const detection = await detect({
    'package.json': manifest({ nuxt: '^3.14.0' }, 'devDependencies'),
    'nuxt.config.ts': "export default defineNuxtConfig({ extends: ['./layers/nuxi'] })\n",
    'layers/nuxi/app/composables/useThing.ts': 'export const useThing = () => 1\n',
  })

  const entry = engineAdjustmentsFor('knip', detection).find((adjustment) => adjustment.key === 'entry')
  expect(entry?.workspace).toBe('layers/nuxi')
  expect(entry?.values).toEqual(expect.arrayContaining(['app/**/*.{vue,ts,tsx,js,jsx}', 'server/**/*.ts']))
})
