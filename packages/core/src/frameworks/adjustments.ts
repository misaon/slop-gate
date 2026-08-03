import type { ConceptId } from '../concepts/catalogue.ts'
import { LEVEL_STRENGTH, type RuleKey, type RuleLevel, type RuleMap } from '../config/types.ts'
import { compareStrings } from '../ordering.ts'
import type { EngineId } from '../registry/types.ts'
import type { EngineSettings, EngineSetting, FrameworkAdjustment, FrameworkDetection, FrameworkId } from './types.ts'

export type FrameworkRuleLayer = { readonly source: FrameworkId; readonly rules: RuleMap }

/**
 * One profile's path-scoped levels for one glob set. Shaped like `OverrideBlock` minus the
 * config-authored parts because that is what it becomes: `createRuleSetResolver` pushes it into the very
 * `overrides` list a user's own blocks go into. `files` is never empty — a scope that matches nothing is
 * dropped rather than emitted.
 */
export type FrameworkOverrideLayer = {
  readonly source: FrameworkId
  readonly files: readonly string[]
  readonly rules: RuleMap
}

/** The glob set an adjustment is confined to, sorted — `[]` for one that applies repository-wide. The
 *  sort makes two profiles naming the same globs in different orders one scope rather than two. */
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

/** One `Map` key for one glob set. A newline, because it cannot occur in a repo-relative POSIX path and
 *  so cannot make two different scopes collide on one key; the globs are never recovered from it. */
function scopeKey(paths: readonly string[]): string {
  return paths.join('\n')
}

/**
 * **The whole conflict story, in one function: `off` from any profile absorbs; otherwise the strictest
 * wins.** A join, so commutative, associative and idempotent — the result does not depend on detection
 * order, profile order, or how many profiles said the same thing (spec §23.3).
 *
 * The direction is not arbitrary: a profile subtracts because a rule is *wrong* about this framework's
 * code, and no other profile asking for it louder can make it right, while an addition that loses to a
 * subtraction costs nothing but the coverage a wrong subtraction was always allowed to cost.
 */
function joinLevels(a: RuleLevel, b: RuleLevel): RuleLevel {
  if (a === 'off' || b === 'off') return 'off'
  return LEVEL_STRENGTH[a] >= LEVEL_STRENGTH[b] ? a : b
}

/**
 * Every applied profile's opinion about every concept, already joined — keyed by `(concept, scope)`
 * rather than by concept alone, because a repository-wide opinion and a path-scoped one are two facts,
 * not two votes on one. Joining them would let a subtraction confined to `packages/ui/**` absorb a
 * repository-wide addition it was never asked about.
 */
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

/**
 * The ruleset consumer (spec §23.2). One layer per applied profile rather than one merged layer, so
 * `sgate rules why` prints `framework nestjs -> off` and names the profile responsible instead of an
 * anonymous "framework" step. Two profiles disabling the same concept produce two steps, both `off`
 * — honest, and inert.
 *
 * A profile only appears for the concepts where its own setting *is* the joined one, so no layer
 * ever carries a value that a later layer is going to overwrite. That matters more than it looks:
 * these layers enter a last-wins cascade, and emitting a loser would make the outcome depend on the
 * order profiles happen to be sorted in — the precise failure this design exists to avoid. The join
 * decides; the cascade only transports the answer.
 *
 * Profiles with nothing to say about rules are omitted entirely; a `test-framework` that found
 * exactly one test runner still contributes a layer, because disabling the *other* scope is the
 * whole point of it.
 */
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

/**
 * The same consumer as `frameworkRuleLayers`, for the adjustments that named `paths` — one layer per
 * `(profile, glob set)`, sorted so the list never depends on which read finished first.
 *
 * These enter `createRuleSetResolver`'s `overrides` list, **not** its base cascade, and the resolver
 * splices them in at the framework position — above the presets, below the user's own `rules`. That
 * placement is the whole precedence story and it is unchanged from the unscoped case: a profile may
 * correct a preset that is wrong for this repository, and your config still beats every profile.
 *
 * A concept appearing under two different glob sets carries the level joined across *its own* scope
 * only (`settledLevels`), so two profiles scoping the same concept to the same globs cannot disagree.
 * Two profiles scoping one concept to *overlapping but unequal* globs is the one shape whose outcome
 * on a file matched by both depends on layer order; no shipped profile does it (`profiles.test.ts`
 * pins that), and the ordering is at least deterministic rather than incidental.
 */
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

/**
 * The engine-configuration consumer (spec §23.2), narrowed to one engine and merged.
 *
 * Every contribution to the same `(workspace, key)` is unioned and sorted, which is the entire
 * conflict story: union is commutative, associative and idempotent, so the result does not depend on
 * profile order, detection order, or how many profiles said the same thing. There is no shape here
 * that assigns a value to a key, so there is nothing for a precedence rule to arbitrate.
 */
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

/** The union of one key's values across every workspace scope — for a setting an engine writes once. */
export function settingValues(adjustments: EngineSettings, key: string): readonly string[] {
  const values = new Set<string>()
  for (const setting of adjustments) if (setting.key === key) for (const value of setting.values) values.add(value)
  return [...values].sort(compareStrings)
}

/** One key's values for one workspace, `[]` when no profile contributed any. */
export function settingValuesFor(
  adjustments: EngineSettings,
  key: string,
  workspace: string,
): readonly string[] {
  return adjustments.find((setting) => setting.key === key && setting.workspace === workspace)?.values ?? []
}
