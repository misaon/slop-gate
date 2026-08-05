import { posix } from 'node:path'
import type { ConceptId } from '../concepts/catalogue.ts'
import { compareStrings } from '../ordering.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { defineProfile, dependencyEvidence, inventoryFilesMatching, relativeToWorkspace } from './detect.ts'
import { extractStringLiteral } from './literal.ts'
import { resolveIncludeScope, resolveJsx, resolveJsxImportSource, TSCONFIG } from './tsconfig.ts'
import type { AnyFrameworkProfile, FrameworkAdjustment, FrameworkEvidence } from './types.ts'

const byFile = (a: readonly [string, unknown], b: readonly [string, unknown]): number => compareStrings(a[0], b[0])

const SCRIPT_GLOB = '{js,mjs,cjs,ts,mts,cts}'

const MIKRO_ORM_CONFIG = /(^|\/)mikro-orm\.config\.[cm]?[jt]s$/

export function dualFiringConcepts(scope: string, counterpart: string): ConceptId[] {
  const counterpartValues = new Set(
    RULE_ENTRIES.filter((entry) => entry.engineRuleId.startsWith(`${counterpart}/`)).map((entry) =>
      entry.engineRuleId.slice(counterpart.length + 1),
    ),
  )

  const found = new Set<ConceptId>()
  for (const entry of RULE_ENTRIES) {
    if (!entry.engineRuleId.startsWith(`${scope}/`)) continue
    if (!counterpartValues.has(entry.engineRuleId.slice(scope.length + 1))) continue
    for (const concept of entry.concepts) found.add(concept)
  }
  return [...found].sort(compareStrings)
}

const nestjs = defineProfile<void>({
  id: 'nestjs',
  summary: 'NestJS — decorator-driven dependency injection',
  async detect(context) {
    const evidence = dependencyEvidence(context, ['@nestjs/core'])
    return evidence === null ? null : { evidence: [evidence], parameters: undefined }
  },
  consequences: () => [
    {
      kind: 'disable-concept',
      concept: 'suspicious.no-extraneous-class' as ConceptId,
      reason:
        'NestJS requires an empty class body: the @Module decorator carries the behaviour, the class is only a hook to hang it on.',
    },
  ],
})

const angular = defineProfile<void>({
  id: 'angular',
  summary: 'Angular — decorator-driven dependency injection',
  async detect(context) {
    const evidence = dependencyEvidence(context, ['@angular/core'])
    return evidence === null ? null : { evidence: [evidence], parameters: undefined }
  },
  consequences: () => [
    {
      kind: 'disable-concept',
      concept: 'suspicious.no-extraneous-class' as ConceptId,
      reason:
        'Angular requires an empty class body for `@NgModule`: the decorator carries the behaviour, exactly as in NestJS.',
    },
  ],
})

const nestjsExpress = defineProfile<void>({
  id: 'nestjs-express',
  summary: 'NestJS on Express — `express` arrives through `@nestjs/platform-express`',
  async detect(context) {
    const evidence = dependencyEvidence(context, ['@nestjs/platform-express'])
    return evidence === null ? null : { evidence: [evidence], parameters: undefined }
  },
  consequences: () => [
    {
      kind: 'engine-setting',
      engine: 'knip',
      key: 'ignoreDependencies',
      workspace: '',
      values: ['express'],
      reason: '`@nestjs/platform-express` re-exports `express`, so importing it needs no direct dependency.',
    },
  ],
})

type MikroOrmParameters = { readonly workspace: string; readonly config: string; readonly migrations: string }

const mikroOrm = defineProfile<MikroOrmParameters>({
  id: 'mikro-orm',
  summary: 'MikroORM — migrations are loaded by the ORM, never imported',
  async detect(context) {
    const dependency = dependencyEvidence(context, ['@mikro-orm/core'])
    if (dependency === null) return null

    const configFile = inventoryFilesMatching(context, (path) => MIKRO_ORM_CONFIG.test(path))[0]
    if (configFile === undefined) {
      return {
        evidence: [dependency],
        blocked: 'no `mikro-orm.config.*` file is present, so the migrations directory is unknown',
      }
    }

    const source = await context.readText(configFile.path)
    const migrations = source === null ? null : extractStringLiteral(source, ['migrations', 'path'])
    if (migrations === null) {
      return {
        evidence: [dependency, { kind: 'path-present', file: configFile.path }],
        blocked:
          `\`migrations.path\` in ${configFile.path} is not a plain string literal, so the migrations ` +
          'directory cannot be read without executing the config',
      }
    }

    return {
      evidence: [
        dependency,
        { kind: 'config-literal', file: configFile.path, property: 'migrations.path', value: migrations },
      ],
      parameters: {
        workspace: configFile.workspace,
        config: relativeToWorkspace(configFile.path, configFile.workspace),
        migrations: normaliseDirectory(migrations),
      },
    }
  },
  consequences: (parameters) => [
    {
      kind: 'engine-setting',
      engine: 'knip',
      key: 'entry',
      workspace: parameters.workspace,
      values: [parameters.config, `${parameters.migrations}/*.${SCRIPT_GLOB}`],
      reason: 'MikroORM loads its config by path and discovers migrations at runtime; nothing imports either.',
    },
  ],
})

type VitePressSite = { readonly workspace: string; readonly root: string }

const vitepress = defineProfile<readonly VitePressSite[]>({
  id: 'vitepress',
  summary: 'VitePress — the site root knip’s own plugin looks for at the workspace root',
  async detect(context) {
    const dependency = dependencyEvidence(context, ['vitepress'])
    if (dependency === null) return null

    const configs = inventoryFilesMatching(context, (path) => path.split('/').includes('.vitepress'))
    if (configs.length === 0) {
      return { evidence: [dependency], blocked: 'no `.vitepress/` directory is present, so the site root is unknown' }
    }

    const sites = new Map<string, VitePressSite>()
    for (const file of configs) {
      const withinWorkspace = relativeToWorkspace(file.path, file.workspace)
      const root = withinWorkspace.slice(0, Math.max(0, withinWorkspace.indexOf('.vitepress') - 1))
      sites.set(`${file.workspace} ${root}`, { workspace: file.workspace, root })
    }

    return {
      evidence: [dependency, ...configs.map((file) => ({ kind: 'path-present' as const, file: file.path }))],
      parameters: [...sites.values()].sort(
        (a, b) => compareStrings(a.workspace, b.workspace) || compareStrings(a.root, b.root),
      ),
    }
  },
  consequences: (sites) =>
    sites.map((site) => {
      const prefix = site.root === '' ? '' : `${site.root}/`
      return {
        kind: 'engine-setting',
        engine: 'knip',
        key: 'vitepress.entry',
        workspace: site.workspace,
        values: [
          `${prefix}.vitepress/config.${SCRIPT_GLOB}`,
          `${prefix}.vitepress/config/index.${SCRIPT_GLOB}`,
          `${prefix}.vitepress/theme/index.${SCRIPT_GLOB}`,
        ],
        reason:
          site.root === ''
            ? 'VitePress site at the workspace root — the same patterns knip’s own plugin uses.'
            : `VitePress site lives in \`${site.root}/\`, not at the workspace root where knip’s plugin looks.`,
      }
    }),
})

type JsxRuntimeScope = { readonly paths: readonly string[] | null }

const scopeBase = (pattern: string): string => (pattern === '**' ? '' : pattern.slice(0, -3))

function overlaps(a: string, b: string): boolean {
  return a === '' || b === '' || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)
}

const reactJsxTransform = defineProfile<JsxRuntimeScope>({
  id: 'react-jsx-transform',
  summary: 'React — TypeScript is configured for a JSX runtime that is not React’s classic one',
  async detect(context) {
    const configs = inventoryFilesMatching(context, (path) => TSCONFIG.test(path))
    const resolved = await Promise.all(
      configs.map(async (file) => ({
        file: file.path,
        jsx: await resolveJsx(file.path, context.readText),
        importSource: await resolveJsxImportSource(file.path, context.readText),
        scope: await resolveIncludeScope(file.path, context.readText),
      })),
    )

    const notReact = resolved.filter(
      (entry) =>
        (entry.jsx.kind === 'set' && entry.jsx.transform === 'automatic') ||
        (entry.jsx.kind === 'set' &&
          entry.jsx.transform === 'deferred' &&
          entry.importSource.kind === 'set' &&
          entry.importSource.value !== 'react'),
    )
    if (notReact.length === 0) return null

    const declaring = new Map<string, { property: string; value: string }>()
    for (const entry of notReact) {
      if (entry.jsx.kind === 'set' && entry.jsx.transform === 'automatic') {
        declaring.set(entry.jsx.declaredIn, { property: 'compilerOptions.jsx', value: entry.jsx.value })
      } else if (entry.importSource.kind === 'set') {
        declaring.set(entry.importSource.declaredIn, {
          property: 'compilerOptions.jsxImportSource',
          value: entry.importSource.value,
        })
      }
    }
    const evidence = [...declaring]
      .sort(byFile)
      .map(([file, found]) => ({ kind: 'config-literal' as const, file, property: found.property, value: found.value }))

    const dissenting = resolved
      .filter((entry) => (entry.jsx.kind === 'set' && entry.jsx.transform === 'classic') || entry.jsx.kind === 'unknown')
      .sort((a, b) => compareStrings(a.file, b.file))
    if (dissenting.length === 0) return { evidence, parameters: { paths: null } }

    const dissentDirs = dissenting.map((entry) => posix.dirname(entry.file)).map((dir) => (dir === '.' ? '' : dir))
    const paths = [
      ...new Set(
        notReact.flatMap((entry) =>
          entry.scope.filter((pattern) => !dissentDirs.some((dir) => overlaps(scopeBase(pattern), dir))),
        ),
      ),
    ].sort(compareStrings)

    if (paths.length === 0) {
      const first = dissenting[0]!
      return {
        evidence,
        blocked:
          first.jsx.kind === 'unknown'
            ? `${first.jsx.reason}, so whether that project uses the classic transform cannot be determined ` +
              'without following the chain, and every project that does use the automatic runtime sits ' +
              'inside or around it'
            :
              `${first.jsx.kind === 'set' ? first.jsx.declaredIn : first.file} sets \`"jsx": "react"\` inside or ` +
              'around every project configured for another runtime, so turning the rule off would drop it ' +
              'where the classic transform still needs it',
      }
    }

    return { evidence, parameters: { paths } }
  },
  consequences: (scope) => [
    {
      kind: 'disable-concept',
      concept: 'suspicious.react-in-jsx-scope' as ConceptId,
      ...(scope.paths === null ? {} : { paths: scope.paths }),
      reason:
        "React 17's automatic JSX transform compiles JSX to `react/jsx-runtime` calls, and a `jsxImportSource` " +
        'naming another runtime compiles it to that one, so importing React is unnecessary and its absence is correct.' +
        (scope.paths === null
          ? ''
          : ' Scoped to the projects whose own config says so, because another project here is on the classic transform.'),
    },
  ],
})

const NEXT_CONFIG = /(^|\/)next\.config\.[cm]?[jt]s$/

export function scopeConcepts(scope: string): ConceptId[] {
  const found = new Set<ConceptId>()
  for (const entry of RULE_ENTRIES) {
    if (!entry.engineRuleId.startsWith(`${scope}/`)) continue
    for (const concept of entry.concepts) found.add(concept)
  }
  return [...found].sort(compareStrings)
}

type NextJsLayout = {
  readonly appRoots: readonly string[]
  readonly outside: readonly string[]
}

const nextjs = defineProfile<NextJsLayout>({
  id: 'nextjs',
  summary: 'Next.js — Vercel’s own plugin, scoped to the applications it describes',
  async detect(context) {
    const declaring = context.manifests.filter((manifest) =>
      manifest.dependencies.some((dependency) => dependency.name === 'next'),
    )
    // No `next` anywhere: the whole scope goes off, with no evidence, the way `test-framework`
    // does. Every rule in it resolves to "import from `next/…` instead", and a repository without
    // Next.js cannot follow that. Measured on `remix-run/indie-stack`, a Remix app: three
    // `no-img-element` findings telling it to use `next/image`.
    if (declaring.length === 0) return { evidence: [], parameters: { appRoots: [], outside: ['**'] } }

    const dependency = dependencyEvidence(context, ['next'])!
    const configs = inventoryFilesMatching(context, (path) => NEXT_CONFIG.test(path))
    const configured = new Set(configs.map((file) => file.workspace))
    const appRoots = declaring
      .map((manifest) => manifest.workspace)
      .filter((workspace) => configured.has(workspace))
      .sort(compareStrings)

    if (appRoots.length === 0) {
      return {
        evidence: [dependency],
        blocked:
          'no `next.config.*` sits beside a manifest declaring `next`, so which workspaces are ' +
          'Next.js applications cannot be told from which merely import from one',
      }
    }

    const declared = new Set(declaring.map((manifest) => manifest.workspace))
    const outside = context.manifests
      .map((manifest) => manifest.workspace)
      .filter((workspace) => !declared.has(workspace) && !hasNestedNext(workspace, declared))
      .sort(compareStrings)
      .map((workspace) => (workspace === '' ? '**' : `${workspace}/**`))

    return {
      evidence: [
        dependency,
        ...configs
          .filter((file) => appRoots.includes(file.workspace))
          .map((file) => ({ kind: 'path-present' as const, file: file.path })),
      ],
      parameters: { appRoots, outside },
    }
  },
  consequences: (layout) =>
    layout.outside.length === 0
      ? []
      : scopeConcepts('nextjs').map(
          (concept): FrameworkAdjustment => ({
            kind: 'disable-concept',
            concept,
            paths: layout.outside,
            reason:
              'Every rule in Vercel’s Next.js plugin resolves to “import from `next/…` instead”, and ' +
              (layout.appRoots.length === 0
                ? 'nothing in this repository declares a `next` dependency, so the advice cannot be followed anywhere in it.'
                : 'these workspaces declare no `next` dependency, so the advice cannot be followed there. ' +
                  `Next.js applies the plugin to its own application (${describeRoots(layout.appRoots)}), not to sibling packages.`),
          }),
        ),
})

function hasNestedNext(workspace: string, declared: ReadonlySet<string>): boolean {
  const prefix = workspace === '' ? '' : `${workspace}/`
  for (const candidate of declared) {
    if (candidate !== workspace && candidate.startsWith(prefix)) return true
  }
  return false
}

function describeRoots(appRoots: readonly string[]): string {
  return appRoots.map((root) => (root === '' ? 'the repository root' : `\`${root}\``)).join(', ')
}

const TEST_SCOPES = ['jest', 'vitest'] as const

const JEST_TEST_FILES = ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'] as const

function chaiAssertionFalsePositive(): FrameworkAdjustment {
  return {
    kind: 'disable-concept',
    concept: 'dead-code.no-op-expression',
    paths: [...JEST_TEST_FILES],
    reason:
      'chai asserts through property access — `expect(x).to.exist`, `value.should.be.true` — so every ' +
      'assertion it makes is a bare expression statement, which is exactly what this rule reports. ' +
      'Measured: 1,700 of 1,700 findings on typeorm and 1,334 of 1,342 in-test findings on nest were ' +
      'chai assertions. Confined to test files, so a genuine no-op in production code still reports.',
  }
}

const chai = defineProfile<void>({
  id: 'chai',
  summary: 'chai — assertions are property accesses, not calls',
  async detect(context) {
    const evidence = dependencyEvidence(context, ['chai'])
    return evidence === null ? null : { evidence: [evidence], parameters: undefined }
  },
  consequences: () => [chaiAssertionFalsePositive()],
})

type TestFrameworkLayout = {
  readonly disabledScopes: readonly string[]
  readonly jest: boolean
}

function jestMockFactoryFalsePositive(): FrameworkAdjustment {
  return {
    kind: 'disable-concept',
    concept: 'suspicious.consistent-function-scoping',
    paths: [...JEST_TEST_FILES],
    reason:
      'oxlint omits `eslint-plugin-unicorn`’s own `jest.mock()` exemption for this rule, so every ' +
      'function declared inside a mock factory is reported. A jest mock factory is hoisted above the ' +
      'imports and may not reference anything outside itself, so moving the function out — the only ' +
      'thing this rule can advise — would break the test. Measured: 3 of oxlint 1.76.0’s 5 findings ' +
      'on a jest fixture, against 2 from the real plugin. Confined to jest’s own default `testMatch`.',
  }
}

const testFramework = defineProfile<TestFrameworkLayout>({
  id: 'test-framework',
  summary: 'Test framework — elects the scope whose plugin rules are not duplicates',
  async detect(context) {
    const found = TEST_SCOPES.map((scope) => ({ scope, evidence: dependencyEvidence(context, [scope]) })).filter(
      (candidate): candidate is { scope: (typeof TEST_SCOPES)[number]; evidence: FrameworkEvidence } =>
        candidate.evidence !== null,
    )
    const disabledScopes = found.length === 1 ? TEST_SCOPES.filter((scope) => scope !== found[0]?.scope) : [...TEST_SCOPES]
    return {
      evidence: found.map((candidate) => candidate.evidence),
      parameters: { disabledScopes, jest: found.some((candidate) => candidate.scope === 'jest') },
    }
  },
  consequences: (layout) => [
    ...layout.disabledScopes.flatMap((scope) => {
      const counterpart = TEST_SCOPES.find((other) => other !== scope)!
      return dualFiringConcepts(scope, counterpart).map(
        (concept): FrameworkAdjustment => ({
          kind: 'disable-concept',
          concept,
          reason:
            `oxlint's ${scope} and ${counterpart} plugins both implement this rule and both match on the ` +
            `bare describe/it shape, so it reports twice; no manifest declares \`${scope}\`.`,
        }),
      )
    }),
    ...(layout.jest ? [jestMockFactoryFalsePositive()] : []),
  ],
})

function normaliseDirectory(value: string): string {
  return value.replace(/^\.\//, '').replace(/\/+$/, '')
}

const NUXT_CONFIG = /(^|\/)nuxt\.config\.[cm]?[jt]s$/

// Nuxt's own directory conventions, per layer. knip's plugin applies them to the srcDir only.
type NuxtLayout = { readonly layers: readonly string[] }

/**
 * knip ships a real Nuxt plugin and it handles the standard layout — auto-imports included. Two
 * things it does not reach, both measured on `nuxt/nuxt.com` with dependencies installed:
 *
 * - **`#shared/*` and `#app`.** 14 `deps.unresolved-import` at `error`, every one of them one of
 *   these. The plugin ignores `#build/`, `#components`, `#imports`, `#internal/` and
 *   `#spa-template` and no others (6.31.0). `#shared` maps to a real directory, so it is taught as
 *   a path; `#app` resolves inside Nuxt's installed package, so there is nothing repo-relative to
 *   map it to and it is ignored instead.
 * **Layers are detected and deliberately not acted on.** `extends: ['./layers/nuxi']` gives each
 * layer its own `composables/`, `pages/` and `server/`, and the plugin resolves those against the
 * srcDir — 63 of the repository's 67 `dead-code.unused-export` findings were inside `layers/`. An
 * `entry` contribution naming those directories was tried and measured: **61 of 63 remained**, so it
 * is not shipped. Whatever reaches that case is not a root-workspace entry glob, and a contribution
 * that changes nothing but carries a confident reason is worse than none.
 */
const nuxt = defineProfile<NuxtLayout>({
  id: 'nuxt',
  summary: 'Nuxt — the aliases and layer directories knip’s own plugin does not resolve',
  async detect(context) {
    const dependency = dependencyEvidence(context, ['nuxt', 'nuxt-nightly'])
    if (dependency === null) return null

    const configs = inventoryFilesMatching(context, (path) => NUXT_CONFIG.test(path))
    // Layer roots read off the inventory rather than out of `nuxt.config.ts`: `extends` there may be
    // a variable, a package name or a git URL, and `literal.ts` reads one string property only.
    const layers = [
      ...new Set(
        inventoryFilesMatching(context, (path) => path.startsWith('layers/'))
          .map((file) => file.path.split('/').slice(0, 2).join('/'))
          .filter((root) => root.split('/').length === 2),
      ),
    ].sort(compareStrings)

    return {
      evidence: [dependency, ...configs.map((file) => ({ kind: 'path-present' as const, file: file.path }))],
      parameters: { layers },
    }
  },
  consequences: (layout) => [
    {
      kind: 'engine-setting',
      engine: 'knip',
      key: 'ignoreUnresolved',
      workspace: '',
      values: ['^#app', '^#shared'],
      reason:
        'Nuxt provides both aliases and knip’s plugin resolves neither, so every import through them ' +
        'reads as unresolved at `error`. `#app` lives inside Nuxt’s installed package; `#shared` is a ' +
        'real directory, but a `paths` mapping for it did not take effect through the synthesized ' +
        'workspace map, so both are ignored rather than one of them taught.',
    },
    ...layout.layers.map(
      (root): FrameworkAdjustment => ({
        kind: 'engine-setting',
        engine: 'knip',
        key: 'entry',
        workspace: root,
        // Workspace-relative, and every directory Nuxt merges from a layer.
        values: ['app/**/*.{vue,ts,tsx,js,jsx}', 'server/**/*.ts', 'shared/**/*.ts', 'modules/**/*.{ts,vue}', 'app.{vue,jsx,tsx}'],
        reason: `Nuxt merges layer \`${root}\` into the application, so its own directories are entry points; knip resolves them against the srcDir and would reach none of them.`,
      }),
    ),
  ],
})

/**
 * Firebase Functions are loaded by the platform from a path, so no import graph reaches them —
 * measured on a real service as five `functions/src/handlers/*.ts` reported as an unused default
 * export. knip 6.31.0 ships no firebase plugin (checked against its plugin list), so this is a
 * plain `entry` contribution, scoped to the workspace that declares the dependency.
 */
const firebaseFunctions = defineProfile<readonly string[]>({
  id: 'firebase-functions',
  summary: 'Firebase Functions — handlers the platform loads by path, imported by nothing',
  async detect(context) {
    const declaring = context.manifests.filter((manifest) =>
      manifest.dependencies.some((dependency) => dependency.name === 'firebase-functions'),
    )
    if (declaring.length === 0) return null

    return {
      evidence: [dependencyEvidence(context, ['firebase-functions'])!],
      parameters: declaring.map((manifest) => manifest.workspace).sort(compareStrings),
    }
  },
  consequences: (workspaces) =>
    workspaces.map(
      (workspace): FrameworkAdjustment => ({
        kind: 'engine-setting',
        engine: 'knip',
        key: 'entry',
        workspace,
        values: [`src/index.${SCRIPT_GLOB}`, `src/**/*.${SCRIPT_GLOB}`, `index.${SCRIPT_GLOB}`],
        reason: 'Firebase loads a function by path at deploy time; nothing in the repository imports it.',
      }),
    ),
})

export const FRAMEWORK_PROFILES: readonly AnyFrameworkProfile[] = [
  angular,
  chai,
  firebaseFunctions,
  mikroOrm,
  nestjs,
  nestjsExpress,
  nextjs,
  nuxt,
  reactJsxTransform,
  testFramework,
  vitepress,
]
