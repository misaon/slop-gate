import picomatch from 'picomatch'
import { isConceptId, type ConceptId } from '../concepts/catalogue.ts'
import type { FrameworkOverrideLayer, FrameworkRuleLayer } from '../frameworks/adjustments.ts'
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

export type ProvenanceLayer =
  | 'preset'
  | 'framework'
  | 'framework-override'
  | 'root-config'
  | 'workspace-config'
  | 'override'

export type ProvenanceStep = {
  layer: ProvenanceLayer
  source: string
  setting: RuleSetting
}

type RuleResolution = {
  key: RuleKey
  level: RuleLevel
  /** Empty when no layer supplied any — never `undefined`, which is a per-*layer* fact only. */
  options: RuleOptions
  /** The layer `options` came from, absent when no layer supplied any. */
  optionsFrom?: { layer: ProvenanceLayer; source: string }
  provenance: ProvenanceStep[]
}

type ResolvedRuleSet = {
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
   * Spec §23.2, layer 3 of §6.2's cascade: above the presets — correcting a preset that is wrong for
   * *this* repository is the point — and below the user's own `rules`. These layers may set `off`, or a
   * level *stronger* than the cascade already holds, never a weaker one (`materialize` drops that case):
   * **your config beats every profile.**
   */
  frameworks?: readonly FrameworkRuleLayer[]
  /**
   * The same layer as `frameworks`, for adjustments that named `paths`. Matched by the *same* `picomatch`
   * pass the user's `overrides` use — one entry per `(profile, glob set)`, with its own `source` label —
   * but spliced in at the **framework** position of the cascade, not appended after it like a user
   * override: a user's `overrides` block exists to beat their own base `rules`, so it comes last, and a
   * profile that came last would beat the user.
   */
  frameworkOverrides?: readonly FrameworkOverrideLayer[]
}

export type RuleSetResolver = {
  base: ResolvedRuleSet
  forFile(relativePath: string): ResolvedRuleSet
  bucketCount(): number
  /**
   * Concepts enabled by the base config **or by any override block**. The planner elects and configures
   * against this, not against `base`: an override that enables a concept only under `legacy/**` must still
   * cause the engine to run that rule, or the override is silently dead.
   *
   * Keyed by `string`, not `ConceptId`, because `sgate rules why <id>` probes it with whatever the user
   * typed: "is this enabled" has to be answerable for an id the catalogue has never heard of.
   */
  anyEnabledConcepts: ReadonlySet<string>
  /** The strongest level any layer assigns to a concept, or `off` if no layer mentions it. */
  maxLevelOf(concept: string): RuleLevel
  /**
   * The options the engine is configured with for this concept, from the **base cascade only** — not the
   * `maxLevelOf` treatment, which folds overrides in. Levels can be narrowed per file after the fact
   * (`forFile` re-resolves severity during normalization); options cannot, because an engine is configured
   * once for the whole run and options change *whether it reports the finding at all* — a path-scoped
   * option would have to apply to every file or to none. So override options are ignored and reported
   * instead, see `ignoredOverrideOptions`.
   */
  optionsOf(concept: string): RuleOptions
  /**
   * Every `overrides` entry that carries options, which the run cannot apply (see `optionsOf`). Surfaced
   * as `config.dead-override` rather than dropped — a user who scopes an option to a glob and gets the
   * base options everywhere has no other way to find out.
   */
  ignoredOverrideOptions: ReadonlyArray<{ source: string; key: string }>
  /**
   * Every override block that mentions `key`, in declaration order, regardless of which files it matches.
   * `forFile` only ever shows overrides relevant to *one* file; a caller like `sgate rules why` has no file
   * in mind and must still explain an override that disables a concept for files it does not have open.
   */
  overridesFor(key: string): ReadonlyArray<{ layer: ProvenanceLayer; source: string; setting: RuleSetting }>
}

const SHIPPED_RULE_KEYS = new Set(RULE_ENTRIES.map(ruleRefKey))

type PathScopedLayer = {
  layer: ProvenanceLayer
  source: string
  rules: RuleMap
  isMatch: (path: string) => boolean
}

function compile(layer: ProvenanceLayer, source: string, files: readonly string[], rules: RuleMap): PathScopedLayer {
  return { layer, source, rules, isMatch: picomatch(files as string[], { dot: true }) }
}

export function createRuleSetResolver(input: ResolveInput): RuleSetResolver {
  const rootSource = input.configFile ?? 'slop-gate.config.ts'

  // Split at the framework position rather than kept as one `baseLayers` array, because the path-scoped
  // framework layer has to be spliced in *there* — see `frameworkOverrides`.
  const presetLayers: Array<{ layer: ProvenanceLayer; source: string; rules: RuleMap }> = []
  const configLayers: Array<{ layer: ProvenanceLayer; source: string; rules: RuleMap }> = []

  for (const preset of input.config.extends ?? []) {
    presetLayers.push({ layer: 'preset', source: preset, rules: PRESETS[preset] })
  }
  for (const framework of input.frameworks ?? []) {
    presetLayers.push({ layer: 'framework', source: framework.source, rules: framework.rules })
  }
  if (input.config.rules) {
    configLayers.push({ layer: 'root-config', source: rootSource, rules: input.config.rules })
  }
  if (input.workspaceConfig?.config.rules) {
    configLayers.push({
      layer: 'workspace-config',
      source: input.workspaceConfig.file,
      rules: input.workspaceConfig.config.rules,
    })
  }

  const frameworkOverrides = (input.frameworkOverrides ?? []).map((block) =>
    compile('framework-override', `framework ${block.source} (${block.files.join(', ')})`, block.files, block.rules),
  )
  const configOverrides = [...(input.config.overrides ?? []), ...(input.workspaceConfig?.config.overrides ?? [])].map(
    (block, index) => compile('override', `overrides[${index}] (${block.files.join(', ')})`, block.files, block.rules),
  )
  const overrides = [...frameworkOverrides, ...configOverrides]

  const pinnedOwners = { ...input.config.owners, ...input.workspaceConfig?.config.owners } as Record<string, EngineId>

  const base = materialize([...presetLayers, ...configLayers], pinnedOwners)
  const buckets = new Map<string, ResolvedRuleSet>([['', base]])

  // Seeded from the already-resolved base, then maxed against overrides only. The base cascade
  // (preset -> root -> workspace) is last-wins by contract, so maxing across it would revive a rule the
  // user turned off with the commonest idiom there is: `extends: ['recommended']` plus an explicit
  // `'some.concept': 'off'`. Overrides are different — they apply to a subset of files, so a rule any
  // override enables must still be configured on the engine for the whole run, and `forFile` narrows it
  // back down during normalization.
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
    [...maxLevels].filter((entry): entry is [ConceptId, RuleLevel] => entry[1] !== 'off' && isConceptId(entry[0])).map(([key]) => key),
  )

  return {
    base,
    forFile(relativePath) {
      const matched = overrides.filter((override) => override.isMatch(relativePath))
      const key = matched.map((override) => override.source).join('|')

      const cached = buckets.get(key)
      if (cached) return cached

      const resolved = materialize(
        [
          ...presetLayers,
          ...matched.filter((m) => m.layer === 'framework-override'),
          ...configLayers,
          ...matched.filter((m) => m.layer === 'override'),
        ],
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
      const result: Array<{ layer: ProvenanceLayer; source: string; setting: RuleSetting }> = []
      for (const override of overrides) {
        const setting = override.rules[key as RuleKey]
        if (setting !== undefined) result.push({ layer: override.layer, source: override.source, setting })
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
      // `enable-concept` from being able to subtract (the first is `joinLevels`). A profile author writing
      // `'x': 'warn'` means "make sure this is on"; under plain last-wins that would silently downgrade a
      // preset holding it at `error` — a coverage loss dressed up as an addition and impossible to spot in
      // the provenance. `off` is exempt rather than merely weakest: subtraction is the framework layer's
      // original and best-warranted power. `framework-override` is held to the same rule, and that is the
      // whole reason path-scoping is safe: confining `warn` to `apps/web/**` while a preset holds `error`
      // repository-wide would otherwise *lower* the level there, with the concept still reading as enabled
      // everywhere — the hardest kind of subtraction to spot.
      const inertRaise =
        (layer === 'framework' || layer === 'framework-override') &&
        level !== 'off' &&
        LEVEL_STRENGTH[level] <= LEVEL_STRENGTH[existing?.level ?? 'off']
      if (inertRaise) continue

      // **Level and options are two facts, each last-wins independently, and options replace rather than
      // merge.** Replace, not deep-merge: options are opaque to core (see `RuleOptions`) and a positional
      // list is not mergeable in any meaning-preserving way — merging `['smart']` with
      // `['always', { null: 'ignore' }]` produces a third configuration nobody wrote, and merging at all
      // would require core to understand the engine's option grammar, the coupling `engineRuleId` exists to
      // avoid. Independently, not as one setting: writing `'pedantic.eqeqeq': 'error'` on top of
      // `extends: ['recommended']` is a request to raise the severity, not to discard the `smart` mode the
      // preset chose on the strength of a 2553-finding measurement. And `['error']`, the tuple form with no
      // options, is a layer explicitly saying "no options" — the reset, without a second keyword.
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
