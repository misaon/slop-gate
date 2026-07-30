import picomatch from 'picomatch'
import { isConceptId } from '../concepts/catalogue.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { ruleRefKey, type EngineId } from '../registry/types.ts'
import { PRESETS } from './presets.ts'
import { splitRuleSetting, type RuleKey, type RuleLevel, type RuleMap, type RuleSetting, type SlopGateConfig } from './types.ts'

export type ProvenanceLayer = 'preset' | 'root-config' | 'workspace-config' | 'override'

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
}

const LEVEL_STRENGTH: Readonly<Record<RuleLevel, number>> = { off: 0, info: 1, warn: 2, error: 3 }

const SHIPPED_RULE_KEYS = new Set(RULE_ENTRIES.map(ruleRefKey))

export function createRuleSetResolver(input: ResolveInput): RuleSetResolver {
  const rootSource = input.configFile ?? 'slop-gate.config.ts'
  const baseLayers: Array<{ layer: ProvenanceLayer; source: string; rules: RuleMap }> = []

  for (const preset of input.config.extends ?? []) {
    baseLayers.push({ layer: 'preset', source: preset, rules: PRESETS[preset] })
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

  // Strongest level any single layer assigns, which is not the same as merging the layers: a
  // last-wins merge would let an override that switches a rule `off` for one directory hide it
  // from the planner everywhere.
  const maxLevels = new Map<string, RuleLevel>()
  for (const layer of [...baseLayers, ...overrides]) {
    for (const [key, setting] of Object.entries(layer.rules)) {
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
