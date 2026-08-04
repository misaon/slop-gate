import type { ConceptId } from '../concepts/catalogue.ts'
import { LEVEL_STRENGTH, type RuleKey, type RuleLevel, type RuleMap } from '../config/types.ts'
import { compareStrings } from '../ordering.ts'
import type { EngineId } from '../registry/types.ts'
import type { EngineSettings, EngineSetting, FrameworkAdjustment, FrameworkDetection, FrameworkId } from './types.ts'

export type FrameworkRuleLayer = { readonly source: FrameworkId; readonly rules: RuleMap }

export type FrameworkOverrideLayer = {
  readonly source: FrameworkId
  readonly files: readonly string[]
  readonly rules: RuleMap
}

function scopePaths(paths: readonly string[] | undefined): readonly string[] {
  return paths === undefined ? [] : [...paths].sort(compareStrings)
}

function ruleSetting(
  adjustment: FrameworkAdjustment,
): { concept: ConceptId; level: RuleLevel; paths: readonly string[] } | null {
  if (adjustment.kind === 'disable-concept') {
    return { concept: adjustment.concept, level: 'off', paths: scopePaths(adjustment.paths) }
  }
  if (adjustment.kind === 'enable-concept') {
    return { concept: adjustment.concept, level: adjustment.level, paths: scopePaths(adjustment.paths) }
  }
  return null
}

function scopeKey(paths: readonly string[]): string {
  return paths.join('\n')
}

function joinLevels(a: RuleLevel, b: RuleLevel): RuleLevel {
  if (a === 'off' || b === 'off') return 'off'
  return LEVEL_STRENGTH[a] >= LEVEL_STRENGTH[b] ? a : b
}

function settledLevels(detection: FrameworkDetection): Map<string, Map<ConceptId, RuleLevel>> {
  const settled = new Map<string, Map<ConceptId, RuleLevel>>()
  for (const application of detection.applied) {
    for (const adjustment of application.adjustments) {
      const setting = ruleSetting(adjustment)
      if (setting === null) continue
      const key = scopeKey(setting.paths)
      const byConcept = settled.get(key) ?? new Map<ConceptId, RuleLevel>()
      const existing = byConcept.get(setting.concept)
      byConcept.set(setting.concept, existing === undefined ? setting.level : joinLevels(existing, setting.level))
      settled.set(key, byConcept)
    }
  }
  return settled
}

export function frameworkRuleLayers(detection: FrameworkDetection): readonly FrameworkRuleLayer[] {
  const unscoped = settledLevels(detection).get(scopeKey([])) ?? new Map<ConceptId, RuleLevel>()
  const layers: FrameworkRuleLayer[] = []

  for (const application of detection.applied) {
    const concepts = new Set<ConceptId>()
    for (const adjustment of application.adjustments) {
      const setting = ruleSetting(adjustment)
      if (setting === null || setting.paths.length > 0) continue
      if (unscoped.get(setting.concept) === setting.level) concepts.add(setting.concept)
    }
    if (concepts.size === 0) continue
    layers.push({
      source: application.id,
      rules: Object.fromEntries(
        [...concepts].sort(compareStrings).map((concept) => [concept, unscoped.get(concept)!]),
      ) as Partial<Record<RuleKey, RuleLevel>>,
    })
  }

  return layers
}

export function frameworkOverrideLayers(detection: FrameworkDetection): readonly FrameworkOverrideLayer[] {
  const settled = settledLevels(detection)
  const grouped = new Map<string, { source: FrameworkId; files: readonly string[]; rules: Map<ConceptId, RuleLevel> }>()

  for (const application of detection.applied) {
    for (const adjustment of application.adjustments) {
      const setting = ruleSetting(adjustment)
      if (setting === null || setting.paths.length === 0) continue
      const scope = scopeKey(setting.paths)
      if (settled.get(scope)?.get(setting.concept) !== setting.level) continue

      const key = scopeKey([application.id, scope])
      const existing =
        grouped.get(key) ??
        { source: application.id, files: setting.paths, rules: new Map<ConceptId, RuleLevel>() }
      existing.rules.set(setting.concept, setting.level)
      grouped.set(key, existing)
    }
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([, group]) => ({
      source: group.source,
      files: group.files,
      rules: Object.fromEntries(
        [...group.rules.keys()].sort(compareStrings).map((concept) => [concept, group.rules.get(concept)!]),
      ) as Partial<Record<RuleKey, RuleLevel>>,
    }))
}

export function engineAdjustmentsFor(engine: EngineId, detection: FrameworkDetection): EngineSettings {
  const merged = new Map<string, { workspace: string; key: string; values: Set<string> }>()

  for (const application of detection.applied) {
    for (const adjustment of application.adjustments) {
      if (adjustment.kind !== 'engine-setting' || adjustment.engine !== engine) continue
      const id = `${adjustment.workspace} ${adjustment.key}`
      const existing = merged.get(id) ?? { workspace: adjustment.workspace, key: adjustment.key, values: new Set() }
      for (const value of adjustment.values) existing.values.add(value)
      merged.set(id, existing)
    }
  }

  return [...merged.values()]
    .map((entry): EngineSetting => ({
      key: entry.key,
      workspace: entry.workspace,
      values: [...entry.values].sort(compareStrings),
    }))
    .sort((a, b) => compareStrings(a.workspace, b.workspace) || compareStrings(a.key, b.key))
}

export function settingValues(adjustments: EngineSettings, key: string): readonly string[] {
  const values = new Set<string>()
  for (const setting of adjustments) if (setting.key === key) for (const value of setting.values) values.add(value)
  return [...values].sort(compareStrings)
}

export function settingValuesFor(
  adjustments: EngineSettings,
  key: string,
  workspace: string,
): readonly string[] {
  return adjustments.find((setting) => setting.key === key && setting.workspace === workspace)?.values ?? []
}
