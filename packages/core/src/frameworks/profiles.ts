import type { ConceptId } from '../concepts/catalogue.ts'
import { compareStrings } from '../ordering.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { defineProfile, dependencyEvidence, inventoryFilesMatching, relativeToWorkspace } from './detect.ts'
import { extractStringLiteral } from './literal.ts'
import { resolveJsx, TSCONFIG, type JsxTransform } from './tsconfig.ts'
import type { AnyFrameworkProfile, FrameworkAdjustment, FrameworkEvidence } from './types.ts'

/** Orders two `[file, …]` pairs, so an evidence list never depends on `Map` insertion order. */
const byFile = (a: readonly [string, unknown], b: readonly [string, unknown]): number => compareStrings(a[0], b[0])

/**
 * Extensions every knip `entry` contribution below is written against. knip's own default entry
 * patterns use the same set (`DEFAULT_EXTENSIONS`, verified against 6.31.0), and a pattern matching
 * nothing costs nothing — spec §23.3 — so listing all six is cheaper than deciding which a given
 * repository uses.
 */
const SCRIPT_GLOB = '{js,mjs,cjs,ts,mts,cts}'

const MIKRO_ORM_CONFIG = /(^|\/)mikro-orm\.config\.[cm]?[jt]s$/

/**
 * The concepts of `scope` that **also exist in `counterpart`** — i.e. exactly the rules that fire
 * twice, because oxlint's jest and vitest plugins both implement them and both match on the generic
 * `describe`/`it`/`expect` shape.
 *
 * Narrower than "every concept in the scope", and the difference was measured rather than reasoned
 * about: disabling the whole jest scope on this repository (vitest-only) turned off
 * `correctness.no-export`, which comes from `jest/no-export` — a rule the vitest plugin has no
 * counterpart for, that does not double-report, and whose advice ("do not export from a test file")
 * is just as true under vitest. The whole-scope version bought 13 concepts and silently gave one
 * back. Pairing by rule value keeps all 13.
 *
 * Paired on the rule id rather than on the concept id: the generator scope-qualifies a concept name
 * only when two scopes collide, so `correctness.jest-expect-expect` and `correctness.no-export` are
 * both jest concepts spelled differently, and matching on the spelling would encode a generator
 * detail this profile has no business knowing.
 */
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

/**
 * Decorator-driven DI, and the registry's original framework-awareness case (spec §23, and the
 * measurement in `registry/not-recommended.ts` this profile replaces): 11 of 11 findings on a real 95-file
 * NestJS project were an empty `@Module({...}) export class XModule {}`, one per `*.module.ts`. The
 * decorator carries the behaviour and the class body is *required* to be empty, so the rule is not
 * merely noisy here, it is asking for code that would not work.
 */
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

/**
 * The same construct as `nestjs` above, in a different framework: `@NgModule({...}) export class
 * AppModule {}` is an empty class body the framework *requires*, with the decorator carrying the
 * behaviour — so `no-extraneous-class` is wrong here for the identical mechanical reason it was
 * wrong on 11 of 11 NestJS modules.
 *
 * **Its warrant is narrower than the other profiles', and deliberately so** (spec §23.5). Every other
 * profile here rests on a false-positive count measured against a real repository. This one rests on
 * mechanism identity with a framework that was measured: no Angular codebase was checked. That is a
 * weaker claim, and it is only acceptable because of the asymmetry — shipping it wrongly costs one
 * rule's coverage on Angular repositories, restorable in a single config line, while omitting it
 * leaves a rule in `recommended` (the *default*) that there is concrete mechanical reason to expect
 * fires 100% falsely on every Angular repository with an NgModule in it.
 *
 * One honest caveat, which does not change the answer: Angular has been standalone-first since v15,
 * so a modern application may have no `@NgModule` at all, and there the profile is a no-op. A no-op
 * costs nothing; a false positive in the default preset does not.
 */
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

/**
 * Kept separate from `nestjs` because it is a separate fact: a NestJS project on Fastify has the
 * first and not this one, and merging them would suppress an `express` finding on a repository that
 * genuinely does not depend on `express`. Measured (spec §13.2): knip reported `express` unlisted
 * three times, once per importing file, on a project that gets it through this meta-package.
 */
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

/**
 * Migrations are discovered by the ORM at runtime and imported by nothing, so no import graph can
 * reach them — measured as three of the six `files` false positives on the NestJS-shaped fixture,
 * with the config file itself a fourth. knip ships no MikroORM plugin (checked against 6.31.0's
 * plugin list), so the fix is a plain workspace `entry` contribution.
 *
 * The migrations directory comes from the ORM's own config via the `literal` probe. When it cannot be
 * read as a literal the profile stands down rather than guessing: the cost is the status-quo false
 * positive, which the user can see and act on, where a wrong guess would silently stop knip reporting
 * genuinely dead files under whatever directory was guessed.
 */
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

/**
 * knip *has* a VitePress plugin, and its entry patterns are `.vitepress/config.*` relative to the
 * **workspace root** (verified against 6.31.0). A site one directory down — `docs/.vitepress/` — is
 * therefore invisible to it, and the measurement in spec §13.2 is that synthesising the workspace map
 * made this case *worse*: 18 findings to 20, both new ones false, because the plugin then activated
 * and still could not find the site.
 *
 * The contribution restates all three of the plugin's own patterns under the detected root, because a
 * plugin `entry` replaces that plugin's defaults rather than extending them. When the site really is
 * at the workspace root the contribution is byte-identical to knip's default, which is why there is
 * no special case for it.
 */
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

/**
 * `react/react-in-jsx-scope` requires `React` to be in scope wherever JSX appears. React 17's
 * automatic JSX transform (2020) removed that requirement, and `compilerOptions.jsx` states which
 * transform a project uses outright — so this is a compiler option contradicting a lint rule, not a
 * heuristic. Measured on a 145k-line React monorepo: **5,386 findings, 100% false**, 87% of
 * everything the run reported.
 *
 * The three-way classification is the measurement rather than the documentation. Running tsc 5.9.3
 * over a `.tsx` module using JSX with no `React` import, once per `jsx` value:
 *
 * - `react` → **`error TS2874: This JSX tag requires 'React' to be in scope`**. The rule is right
 *   here, and tsc says the same thing at `error` through `types.type-error`.
 * - `react-jsx`, `react-jsxdev` → **no error**. The rule cannot be right here.
 * - `preserve`, `react-native` → **no error either**, because TypeScript emits the JSX untouched and
 *   never looks for a factory. That silence is not evidence of the automatic runtime: Babel, SWC or
 *   Metro decides, and nothing readable offline says which. Both are therefore treated as *no
 *   evidence in either direction* — the rule stays on, and it is the only coverage those projects
 *   get, since tsc offers none. This is the profile's biggest deliberate gap: a Next.js repository
 *   left on Next's own `"jsx": "preserve"` default gets nothing from it.
 *
 * **Every question here is about the *resolved* value, never the declared one** (`tsconfig.ts`). In a
 * monorepo the leaf config usually says almost nothing — that is the point of the file. On the
 * measured repository only 4 of 19 configs set `jsx` at all, and none of the four belonged to one of
 * the three Next.js apps holding most of the `.tsx`; those reach it through `"extends":
 * "../../tsconfig.app.json"`, two levels up. A config that is silent is *not* a dissenter, and a
 * config that inherits `react` from a base *is* one even though it says nothing itself.
 *
 * **Disagreement stands the profile down.** `disable-concept` is repository-global — the adjustment
 * vocabulary has no file-scoped shape and §23.3 is the reason it does not — so one package on the
 * classic transform cannot be excluded from a repository-wide "off". Standing down restores the
 * status quo the user can already see, and `sgate rules why` names the two files that disagree,
 * which is a one-line fix in their own tsconfig. Applying anyway would silently drop the rule in the
 * one place it is load-bearing.
 *
 * **So does a chain that cannot be followed**, for the same reason one level removed: an ancestor
 * that could not be read may be the one setting `"jsx": "react"`, and the difference between "no
 * ancestor sets it" and "I could not see whether an ancestor sets it" is exactly the difference
 * between applying safely and applying blind.
 *
 * **`disable-concept` because oxlint offers nothing narrower.** Confirmed against 1.76.0: the rule
 * takes no options at all (*this rule does not accept configuration options*, and the bundled
 * `configuration_schema.json` resolves it to `RuleNoConfig`); `settings.react.runtime` and
 * `settings.react.jsxRuntime` are accepted by the parser and change nothing; and a sibling
 * `tsconfig.json` reading `"jsx": "react-jsx"` does not silence it, with or without `--tsconfig`.
 * An `engine-setting` adjustment would have no key to write.
 *
 * There is no sibling to disable alongside it: `react/jsx-uses-react`, which the automatic transform
 * obsoletes in the same stroke, is **not in the registry** because oxlint does not implement it —
 * `oxlint --rules --format json` lists 64 rules in the `react` scope and that is not one of them.
 */
const reactJsxTransform = defineProfile<void>({
  id: 'react-jsx-transform',
  summary: 'React — TypeScript is configured for the automatic JSX runtime',
  async detect(context) {
    const configs = inventoryFilesMatching(context, (path) => TSCONFIG.test(path))
    const resolved = await Promise.all(
      configs.map(async (file) => ({ file: file.path, jsx: await resolveJsx(file.path, context.readText) })),
    )

    // Deduplicated on the *declaring* file, not the resolving one: three apps inheriting one
    // `tsconfig.app.json` are one fact about the repository, not three.
    const declaring = new Map<string, { value: string; transform: JsxTransform }>()
    for (const entry of resolved) {
      if (entry.jsx.kind !== 'set') continue
      declaring.set(entry.jsx.declaredIn, { value: entry.jsx.value, transform: entry.jsx.transform })
    }

    const automatic = [...declaring].filter(([, jsx]) => jsx.transform === 'automatic').sort(byFile)
    if (automatic.length === 0) return null

    const evidence = automatic.map(([file, jsx]) => ({
      kind: 'config-literal' as const,
      file,
      property: 'compilerOptions.jsx',
      value: jsx.value,
    }))

    const classic = [...declaring].filter(([, jsx]) => jsx.transform === 'classic').sort(byFile)
    if (classic.length > 0) {
      return {
        evidence,
        blocked:
          `${classic[0]![0]} sets \`"jsx": "react"\` while ${automatic[0]![0]} sets ` +
          `\`"jsx": "${automatic[0]![1].value}"\`, and the rule can only be turned off for the whole ` +
          'repository, so turning it off would drop it where the classic transform still needs it',
      }
    }

    // A config whose `extends` chain broke resolves to no value, and that is not the same as one
    // that resolves to nothing: an ancestor this could not read may set `"jsx": "react"`, and
    // applying past it would drop the rule exactly where it is load-bearing without saying so.
    const unknown = resolved.filter((entry) => entry.jsx.kind === 'unknown').sort((a, b) => compareStrings(a.file, b.file))
    if (unknown.length > 0) {
      const first = unknown[0]!
      return {
        evidence,
        blocked:
          `${(first.jsx as { reason: string }).reason}, so whether that project uses the classic ` +
          'transform cannot be determined without following the chain',
      }
    }

    return { evidence, parameters: undefined }
  },
  consequences: () => [
    {
      kind: 'disable-concept',
      concept: 'suspicious.react-in-jsx-scope' as ConceptId,
      reason:
        "React 17's automatic JSX transform compiles JSX to `react/jsx-runtime` calls, so importing React is unnecessary and its absence is correct.",
    },
  ],
})

const NEXT_CONFIG = /(^|\/)next\.config\.[cm]?[jt]s$/

/**
 * The concepts oxlint's `nextjs` scope covers, read off the registry rather than listed here — 21
 * today, and an oxlint upgrade that adds a 22nd is picked up without an edit. Same reasoning as
 * `dualFiringConcepts`: a hand-written list of generated concept ids is a copy that silently rots.
 */
export function scopeConcepts(scope: string): ConceptId[] {
  const found = new Set<ConceptId>()
  for (const entry of RULE_ENTRIES) {
    if (!entry.engineRuleId.startsWith(`${scope}/`)) continue
    for (const concept of entry.concepts) found.add(concept)
  }
  return [...found].sort(compareStrings)
}

type NextJsLayout = {
  /** Workspaces holding both a `next` dependency and a `next.config.*`, sorted. */
  readonly appRoots: readonly string[]
  /** `<dir>/**` for every workspace that declares no `next` at all, sorted. Possibly empty. */
  readonly outside: readonly string[]
}

/**
 * Next.js, and the first profile to scope a level to a path rather than to the whole repository.
 *
 * **Layer A of a borrowed profile, and it turned out to need nothing borrowed.** All 21 rules in
 * oxlint's `nextjs` scope are `correctness`, so `GENERATED_RECOMMENDED_RULES` already holds every one
 * of them at `error` — derived from the registry, not from `sgate rules list`, which filters by the
 * languages present in the repository at hand and so cannot answer the question at all. There is
 * nothing here for an `enable-concept` to add; Vercel's own `eslint-config-next` is in fact *milder*,
 * shipping 15 of the 21 at `warn` and only 6 at `error` (verified against `@next/eslint-plugin-next`
 * 16.2.12's `recommendedRules`). A profile cannot correct that — `materialize` drops a framework level
 * weaker than what an earlier layer holds — so the six-versus-fifteen question belongs to
 * `registry/overrides.ts`'s `severityDefault`, not here.
 *
 * **What the plugin does need is a scope, and the measurement is why.** `@next/eslint-plugin-next` is
 * delivered by `eslint-config-next`, which Next.js wires into the application it belongs to; nothing
 * in Vercel's own tooling points it at a sibling package. slop-gate points it at every `.tsx` in the
 * repository, and in a monorepo that is a rule set aimed at code it does not describe. Measured with
 * oxlint 1.76.0 across five public repositories (`shadcn-ui/ui`, `dubinc/dub`, `documenso/documenso`,
 * `unkeyed/unkey`, `calcom/cal.com`): **389 findings, 67 of them in workspaces that declare no `next`
 * dependency at all.** On `calcom/cal.com` alone, 33 of 73 — 8 in `packages/emails`, where `<img>` is
 * not a lapse but the only thing an email client will render, and 6 in `apps/api/v2`, a NestJS service
 * where `no-assign-module-variable` is complaining about CommonJS in a project that has no Next.js
 * bundler to confuse.
 *
 * `no-img-element` and `no-assign-module-variable` are the two that were measured wrong there. The
 * other 19 are carried by mechanism rather than by their own count, on the `angular` precedent (spec
 * §23.5): every one of them resolves to *import from `next/…` instead*, and a workspace that does not
 * declare `next` cannot follow that without producing an unlisted-dependency finding in its place.
 * Shipping the whole scope wrongly costs 21 rules' coverage in packages those rules were never about;
 * shipping only the measured two leaves the rest aimed at the same code for want of a fixture.
 *
 * **The scope is stated positively, and that is a picomatch fact rather than a preference.** The
 * natural phrasing is "everywhere except the app roots", and in picomatch 4.0.5's array form a negated
 * pattern does not subtract from its siblings — `['**', '!apps/web/**']` matches `apps/web/x.tsx`. So
 * the profile enumerates the non-Next workspaces it can see, which costs nothing it was not already
 * reading: `DetectionContext.manifests` is the same list detection ran on. A workspace with a nested
 * one that *does* declare `next` is skipped rather than glob-matched around it — files directly in the
 * parent keep the rules on, which is the safe direction to be wrong in.
 *
 * A single-app repository — the common case — has no non-Next workspace and therefore no scoped layer
 * at all, so the profile is byte-identical to not existing there. That is deliberate: the whole
 * apparatus exists for the monorepo, and it should be invisible everywhere else.
 */
const nextjs = defineProfile<NextJsLayout>({
  id: 'nextjs',
  summary: 'Next.js — Vercel’s own plugin, scoped to the applications it describes',
  async detect(context) {
    const declaring = context.manifests.filter((manifest) =>
      manifest.dependencies.some((dependency) => dependency.name === 'next'),
    )
    if (declaring.length === 0) return null

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
              'these workspaces declare no `next` dependency, so the advice cannot be followed there. ' +
              `Next.js applies the plugin to its own application (${describeRoots(layout.appRoots)}), not to sibling packages.`,
          }),
        ),
})

/** True when some workspace strictly below `workspace` declares `next` — see the profile's note. */
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

/**
 * jest's own default `testMatch` (jest 30), copied rather than approximated — an approximation would
 * be a second, worse specification of "a test file" for a tool that already publishes one. Verified
 * against picomatch 4.0.5, which handles both extglobs verbatim.
 *
 * A repository that overrides `testMatch`, or writes `jest.mock()` in a `setupFiles` module outside
 * these globs, still reports. Reading `testMatch` would need an array-valued config probe, which
 * `frameworks/literal.ts` deliberately does not have (spec §23, "the `literal` probe is one file, one
 * property path, string literals only").
 */
const JEST_TEST_FILES = ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'] as const

type TestFrameworkLayout = {
  /** Scopes whose dual-firing concepts go off, sorted by `TEST_SCOPES` order. */
  readonly disabledScopes: readonly string[]
  /** Whether any manifest declares `jest` — what makes the mock-factory exemption below apply at all. */
  readonly jest: boolean
}

/**
 * oxlint 1.76.0 omits an exemption `eslint-plugin-unicorn` has, and the omission is deliberate on
 * oxlint's side: `unicorn/consistent-function-scoping` exempts any function nested inside a
 * `jest.mock()` factory upstream (`rules/consistent-function-scoping.js:105-122`,
 * `isInsideJestMockFactory`, unicorn 72.0.0), and oxlint's own Rust rule has no such check while
 * carrying `jest.mock('@kbn/i18n-react', () => { return { I18nProvider: function
 * MockI18nProvider() {} } })` in its `fail` vector.
 *
 * Measured rather than reasoned about, on a four-file fixture with three mock factories and one
 * genuine violation: **oxlint 1.76.0 reports 5, all `code: "unicorn(consistent-function-scoping)"`;
 * ESLint 10.8.0 with the real plugin reports 2.** The three extra are functions declared inside a
 * `jest.mock()` factory, and every one is false for a mechanical reason rather than a stylistic one:
 * jest hoists the `jest.mock()` call above the imports, so its factory may not reference anything
 * outside itself — "move it to the outer scope" produces a test that throws.
 *
 * The concept is `unicorn`-scope, so no amount of test-scope arbitration reaches it and the
 * dual-firing subtraction above cannot help. It is `warn`, so nobody's build breaks either way; what
 * it costs is one wrong finding per mock factory on a codebase that may have hundreds.
 *
 * **Path-scoped rather than repository-wide**, which is the whole reason this waited for §23.6: the
 * rule is worth keeping on application code, and every instance of this false positive is in a file
 * jest itself would run.
 */
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

/**
 * oxlint's `jest` and `vitest` plugins pattern-match the generic `describe`/`it`/`expect` call shape
 * rather than checking which package it came from, so on a repository using one of them, both plugins'
 * rules fire on the identical line — under two different concept ids, which arbitration cannot merge
 * because they *are* two concepts. Measured on this repository (vitest-only): every occurrence,
 * doubled. That is why 24 rules sit in `registry/not-recommended.ts` with a reason naming this mechanism as
 * their unblocking condition.
 *
 * The rule, in full: **disable every scope that is not the unique installed one; if there is not
 * exactly one, disable all of them.** Both installed and the double report is genuine; neither
 * installed and nothing should be claiming to lint tests that are not written with either. Both
 * degrade to exactly the unconditional exclusion this replaces, which is why this is the one profile
 * that applies with no evidence — the absence *is* the finding, and it disables rather than enables,
 * so the failure direction stays safe.
 */
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

/** Strips a leading `./` and any trailing `/` so `'./src/migrations/'` and `'src/migrations'` agree. */
function normaliseDirectory(value: string): string {
  return value.replace(/^\.\//, '').replace(/\/+$/, '')
}

/** Evaluated in this order, but the order is inert: merging is a sorted set union (spec §23.3). */
export const FRAMEWORK_PROFILES: readonly AnyFrameworkProfile[] = [
  angular,
  mikroOrm,
  nestjs,
  nestjsExpress,
  nextjs,
  reactJsxTransform,
  testFramework,
  vitepress,
]
