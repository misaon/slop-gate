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
  options: Record<string, unknown>
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
   * writes `'suspicious.no-extraneous-class': 'error'` in a NestJS repository means it. Every layer
   * here may only set `off` — the framework layer subtracts, `extends` is what adds.
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
  for (const [key, resolution] of base.rules) maxLevels.set(key, resolution.level)
  for (const override of overrides) {
    for (const [key, setting] of Object.entries(override.rules)) {
      if (setting === undefined) continue
      const { level } = splitRuleSetting(setting)
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
      rules.set(key, {
        key,
        level,
        options,
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
