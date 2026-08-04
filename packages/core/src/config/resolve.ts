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
  options: RuleOptions
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
  frameworks?: readonly FrameworkRuleLayer[]
  frameworkOverrides?: readonly FrameworkOverrideLayer[]
}

export type RuleSetResolver = {
  base: ResolvedRuleSet
  forFile(relativePath: string): ResolvedRuleSet
  bucketCount(): number
  anyEnabledConcepts: ReadonlySet<string>
  maxLevelOf(concept: string): RuleLevel
  optionsOf(concept: string): RuleOptions
  ignoredOverrideOptions: ReadonlyArray<{ source: string; key: string }>
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

      const inertRaise =
        (layer === 'framework' || layer === 'framework-override') &&
        level !== 'off' &&
        LEVEL_STRENGTH[level] <= LEVEL_STRENGTH[existing?.level ?? 'off']
      if (inertRaise) continue

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
