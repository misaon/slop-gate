import type { ConceptId } from '../concepts/catalogue.ts'
import { compareStrings } from '../ordering.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { defineProfile, findDependency, findFiles, relativeToWorkspace } from './detect.ts'
import { extractStringLiteral } from './literal.ts'
import type { AnyFrameworkProfile, FrameworkAdjustment } from './types.ts'

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
 * measurement in `registry/exclusions.ts` this profile replaces): 11 of 11 findings on a real 95-file
 * NestJS project were an empty `@Module({...}) export class XModule {}`, one per `*.module.ts`. The
 * decorator carries the behaviour and the class body is *required* to be empty, so the rule is not
 * merely noisy here, it is asking for code that would not work.
 */
const nestjs = defineProfile<void>({
  id: 'nestjs',
  summary: 'NestJS — decorator-driven dependency injection',
  async detect(context) {
    const evidence = findDependency(context, ['@nestjs/core'])
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
    const evidence = findDependency(context, ['@angular/core'])
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
    const evidence = findDependency(context, ['@nestjs/platform-express'])
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
    const dependency = findDependency(context, ['@mikro-orm/core'])
    if (dependency === null) return null

    const configFile = findFiles(context, (path) => MIKRO_ORM_CONFIG.test(path))[0]
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
    const dependency = findDependency(context, ['vitepress'])
    if (dependency === null) return null

    const configs = findFiles(context, (path) => path.split('/').includes('.vitepress'))
    if (configs.length === 0) {
      return { evidence: [dependency], blocked: 'no `.vitepress/` directory is present, so the site root is unknown' }
    }

    const sites = new Map<string, VitePressSite>()
    for (const file of configs) {
      const withinWorkspace = relativeToWorkspace(file.path, file.workspace)
      const root = withinWorkspace.slice(0, Math.max(0, withinWorkspace.indexOf('.vitepress') - 1))
      sites.set(`${file.workspace} ${root}`, { workspace: file.workspace, root })
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

const TEST_SCOPES = ['jest', 'vitest'] as const

/**
 * oxlint's `jest` and `vitest` plugins pattern-match the generic `describe`/`it`/`expect` call shape
 * rather than checking which package it came from, so on a repository using one of them, both plugins'
 * rules fire on the identical line — under two different concept ids, which arbitration cannot merge
 * because they *are* two concepts. Measured on this repository (vitest-only): every occurrence,
 * doubled. That is why 24 rules sit in `registry/exclusions.ts` with a reason naming this mechanism as
 * their unblocking condition.
 *
 * The rule, in full: **disable every scope that is not the unique installed one; if there is not
 * exactly one, disable all of them.** Both installed and the double report is genuine; neither
 * installed and nothing should be claiming to lint tests that are not written with either. Both
 * degrade to exactly the unconditional exclusion this replaces, which is why this is the one profile
 * that applies with no evidence — the absence *is* the finding, and it disables rather than enables,
 * so the failure direction stays safe.
 */
const testFramework = defineProfile<readonly string[]>({
  id: 'test-framework',
  summary: 'Test framework — elects the scope whose plugin rules are not duplicates',
  async detect(context) {
    const found = TEST_SCOPES.map((scope) => ({ scope, evidence: findDependency(context, [scope]) })).filter(
      (candidate) => candidate.evidence !== null,
    )
    const disabled = found.length === 1 ? TEST_SCOPES.filter((scope) => scope !== found[0]!.scope) : [...TEST_SCOPES]
    return { evidence: found.map((candidate) => candidate.evidence!), parameters: disabled }
  },
  consequences: (disabled) =>
    disabled.flatMap((scope) => {
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
  testFramework,
  vitepress,
]
