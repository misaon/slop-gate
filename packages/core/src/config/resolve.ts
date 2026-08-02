import picomatch from 'picomatch'
import { isConceptId } from '../concepts/catalogue.ts'
import type { FrameworkRuleLayer } from '../frameworks/adjustments.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { ruleRefKey, type EngineId } from '../registry/types.ts'
import { PRESETS } from './presets.ts'
import {
  LEVEL_STRENGTH,
  splitRuleSetting,
  type RuleKey,
  type RuleLevel,
  type RuleMap,
  type RuleOptions,
  type RuleSetting,
  type SlopGateConfig,
} from './types.ts'

export type ProvenanceLayer = 'preset' | 'framework' | 'root-config' | 'workspace-config' | 'override'

export type ProvenanceStep = {
  layer: ProvenanceLayer
  source: string
  setting: RuleSetting
}

export type RuleResolution = {
  key: RuleKey
  level: RuleLevel
  /** Empty when no layer supplied any — never `undefined`, which is a per-*layer* fact only. */
  options: RuleOptions
  /** The layer `options` came from, absent when no layer supplied any. What lets `sgate rules why`
   *  answer "which config layer decided the options" in the same sentence it answers it for levels. */
  optionsFrom?: { layer: ProvenanceLayer; source: string }
  provenance: ProvenanceStep[]
}

export type ResolvedRuleSet = {
  rules: ReadonlyMap<RuleKey, RuleResolution>
  enabledConcepts: ReadonlySet<string>
  pinnedOwners: Readonly<Record<string, EngineId>>
  unknownKeys: readonly string[]
}

export type ResolveInput = {
  config: SlopGateConfig
  configFile?: string
  workspaceConfig?: { file: string; config: SlopGateConfig }
  /**
   * Spec §23.2, layer 3 of §6.2's cascade: above the presets, because correcting a preset that is
   * wrong for *this* repository is the point, and below the user's own `rules`, because a human who
   * writes `'suspicious.no-extraneous-class': 'error'` in a NestJS repository means it.
   *
   * These layers may set `off`, or a level *stronger* than the cascade already holds — never a
   * weaker one; `materialize` drops that case. So a profile can turn a concept off, turn one on, or
   * say it matters more here than in general, and it can still never quietly cost coverage or beat
   * a person. That last clause is the whole precedence rule and it has not changed: **your config
   * beats every profile.**
   */
  frameworks?: readonly FrameworkRuleLayer[]
}

export type RuleSetResolver = {
  base: ResolvedRuleSet
  forFile(relativePath: string): ResolvedRuleSet
  bucketCount(): number
  /**
   * Concepts enabled by the base config **or by any override block**. The planner elects and
   * configures against this, not against `base`: an override that enables a concept only under
   * `legacy/**` must still cause the engine to run that rule, or the override is silently dead.
   * Per-file severity is then applied during normalization via `forFile`.
   */
  anyEnabledConcepts: ReadonlySet<string>
  /** The strongest level any layer assigns to a concept, or `off` if no layer mentions it. */
  maxLevelOf(concept: string): RuleLevel
  /**
   * The options the engine should be configured with for this concept, from the **base cascade
   * only** — deliberately not the `maxLevelOf` treatment, which folds overrides in.
   *
   * A level can be narrowed per file after the fact (`forFile` re-resolves severity during
   * normalization, so the engine runs at the strongest level any override asks for and each finding
   * is then graded against its own file). Options cannot: they change *whether the engine reports
   * the finding at all*, and an engine is configured once for the whole run. Honouring a
   * path-scoped option would therefore mean applying it to every file or to none, and both are
   * wrong. So override options are ignored and reported instead — see `ignoredOverrideOptions`.
   */
  optionsOf(concept: string): RuleOptions
  /**
   * Every `overrides` entry that carries options, which the run cannot apply (see `optionsOf`).
   * Surfaced as `config.dead-override` rather than dropped, because a user who scopes an option to
   * a glob and gets the base options everywhere has no other way to find out.
   */
  ignoredOverrideOptions: ReadonlyArray<{ source: string; key: string }>
  /**
   * Every override block that mentions `key` (a concept id or engine rule id), regardless of which
   * files it matches — in declaration order, the same `source` label `forFile`'s provenance already
   * uses. `forFile` only ever shows overrides relevant to *one* file; this exists for a caller like
   * `sgate rules why` that has no file in mind and instead needs to explain a concept's overall
   * enablement, including an override that would disable it for files it does not itself have open.
   */
  overridesFor(key: string): ReadonlyArray<{ source: string; setting: RuleSetting }>
}

const SHIPPED_RULE_KEYS = new Set(RULE_ENTRIES.map(ruleRefKey))

export function createRuleSetResolver(input: ResolveInput): RuleSetResolver {
  const rootSource = input.configFile ?? 'slop-gate.config.ts'
  const baseLayers: Array<{ layer: ProvenanceLayer; source: string; rules: RuleMap }> = []

  for (const preset of input.config.extends ?? []) {
    baseLayers.push({ layer: 'preset', source: preset, rules: PRESETS[preset] })
  }
  for (const framework of input.frameworks ?? []) {
    baseLayers.push({ layer: 'framework', source: framework.source, rules: framework.rules })
  }
  if (input.config.rules) {
    baseLayers.push({ layer: 'root-config', source: rootSource, rules: input.config.rules })
  }
  if (input.workspaceConfig?.config.rules) {
    baseLayers.push({
      layer: 'workspace-config',
      source: input.workspaceConfig.file,
      rules: input.workspaceConfig.config.rules,
    })
  }

  const overrides = [...(input.config.overrides ?? []), ...(input.workspaceConfig?.config.overrides ?? [])].map(
    (block, index) => ({
      source: `overrides[${index}] (${block.files.join(', ')})`,
      rules: block.rules,
      isMatch: picomatch(block.files as string[], { dot: true }),
    }),
  )

  const pinnedOwners = { ...input.config.owners, ...input.workspaceConfig?.config.owners } as Record<string, EngineId>

  const base = materialize(baseLayers, pinnedOwners)
  const buckets = new Map<string, ResolvedRuleSet>([['', base]])

  // Seeded from the already-resolved base, then maxed against overrides only. The base cascade
  // (preset -> root -> workspace) is last-wins by contract, so maxing across it would revive a rule
  // the user turned off with the commonest idiom there is: `extends: ['recommended']` plus an
  // explicit `'some.concept': 'off'`. Overrides are different — they apply to a subset of files, so
  // a rule any override enables must still be configured on the engine for the whole run, and
  // `forFile` narrows it back down during normalization.
  const maxLevels = new Map<string, RuleLevel>()
  const ignoredOverrideOptions: Array<{ source: string; key: string }> = []
  for (const [key, resolution] of base.rules) maxLevels.set(key, resolution.level)
  for (const override of overrides) {
    for (const [key, setting] of Object.entries(override.rules)) {
      if (setting === undefined) continue
      const { level, options } = splitRuleSetting(setting)
      if (options !== undefined && options.length > 0) ignoredOverrideOptions.push({ source: override.source, key })
      if (LEVEL_STRENGTH[level] > LEVEL_STRENGTH[maxLevels.get(key) ?? 'off']) maxLevels.set(key, level)
    }
  }
  const anyEnabledConcepts = new Set(
    [...maxLevels].filter(([key, level]) => level !== 'off' && isConceptId(key)).map(([key]) => key),
  )

  return {
    base,
    forFile(relativePath) {
      const matched = overrides.filter((override) => override.isMatch(relativePath))
      const key = matched.map((override) => override.source).join('|')

      const cached = buckets.get(key)
      if (cached) return cached

      const resolved = materialize(
        [...baseLayers, ...matched.map((m) => ({ layer: 'override' as const, source: m.source, rules: m.rules }))],
        pinnedOwners,
      )
      buckets.set(key, resolved)
      return resolved
    },
    bucketCount() {
      return buckets.size
    },
    anyEnabledConcepts,
    maxLevelOf(concept) {
      return maxLevels.get(concept) ?? 'off'
    },
    optionsOf(concept) {
      return base.rules.get(concept as RuleKey)?.options ?? []
    },
    ignoredOverrideOptions,
    overridesFor(key) {
      const result: Array<{ source: string; setting: RuleSetting }> = []
      for (const override of overrides) {
        const setting = override.rules[key as RuleKey]
        if (setting !== undefined) result.push({ source: override.source, setting })
      }
      return result
    },
  }
}

function materialize(
  layers: ReadonlyArray<{ layer: ProvenanceLayer; source: string; rules: RuleMap }>,
  pinnedOwners: Record<string, EngineId>,
): ResolvedRuleSet {
  const rules = new Map<RuleKey, RuleResolution>()

  for (const { layer, source, rules: map } of layers) {
    for (const [rawKey, setting] of Object.entries(map)) {
      if (setting === undefined) continue
      const key = rawKey as RuleKey
      const { level, options } = splitRuleSetting(setting)
      const existing = rules.get(key)

      // **A framework profile states a floor, never a ceiling** — the second half of what keeps
      // `enable-concept` from being able to subtract (the first is `joinLevels`). A profile author
      // writing `'x': 'warn'` means "make sure this is on"; under plain last-wins that would
      // silently downgrade a preset holding it at `error`, which is a coverage loss dressed up as an
      // addition and impossible to spot in the provenance.
      //
      // `off` is exempt rather than merely weakest: a subtraction is the framework layer's original
      // and best-warranted power, and it applies against whatever the presets said.
      //
      // Skipped entirely rather than applied-and-ignored, so the provenance stays a record of what
      // actually decided the level instead of listing a step that did nothing.
      const inertRaise =
        layer === 'framework' && level !== 'off' && LEVEL_STRENGTH[level] <= LEVEL_STRENGTH[existing?.level ?? 'off']
      if (inertRaise) continue

      // **Level and options are two facts, each last-wins independently, and options replace rather
      // than merge.** Three decisions, none of which should fall out of implementation order:
      //
      // - *Replace, not deep-merge*: options are opaque to core (see `RuleOptions`), and a
      //   positional list is not mergeable in any meaning-preserving way — merging `['smart']` with
      //   `['always', { null: 'ignore' }]` produces a third configuration nobody wrote. Merging
      //   would also require core to understand the engine's option grammar, which is the coupling
      //   `engineRuleId` exists to avoid.
      // - *Independently, not as one setting*: writing `'pedantic.eqeqeq': 'error'` on top of
      //   `extends: ['recommended']` is a request to raise the severity, not to discard the `smart`
      //   mode the preset chose on the strength of a 2553-finding measurement. Collapsing the two
      //   would make the commonest edit in the config file silently the most expensive one.
      // - *`['error']` is the reset*: the tuple form with no options is a layer explicitly saying
      //   "no options", so the escape hatch stays expressible without a second keyword.
      const optionsFrom = options === undefined ? existing?.optionsFrom : { layer, source }
      rules.set(key, {
        key,
        level,
        options: options ?? existing?.options ?? [],
        ...(optionsFrom === undefined ? {} : { optionsFrom }),
        provenance: [...(existing?.provenance ?? []), { layer, source, setting }],
      })
    }
  }

  const enabledConcepts = new Set<string>()
  const unknownKeys: string[] = []

  for (const [key, resolution] of rules) {
    if (isConceptId(key)) {
      if (resolution.level !== 'off') enabledConcepts.add(key)
    } else if (!SHIPPED_RULE_KEYS.has(key)) {
      unknownKeys.push(key)
    }
  }

  return { rules, enabledConcepts, pinnedOwners, unknownKeys }
}
