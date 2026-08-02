import type { ConceptId } from '../concepts/catalogue.ts'
import type { FixKind, Severity } from '../diagnostics/types.ts'
import type { LanguageId } from '../languages.ts'

export type EngineId =
  | 'oxfmt'
  | 'oxlint'
  | 'tsgolint'
  | 'tsc'
  | 'biome-css'
  | 'astgrep'
  | 'schema'
  | 'actionlint'
  | 'zizmor'
  | 'hadolint'
  | 'knip'
  | 'deps-security'
  | 'eslint'

/**
 * Ordered fastest-capable-first. Arbitration consults this only after tier, so a
 * slower engine still wins a concept no faster engine can detect (§5.3).
 */
export const ENGINE_PREFERENCE: readonly EngineId[] = [
  'oxfmt',
  'oxlint',
  'tsgolint',
  'tsc',
  'biome-css',
  'astgrep',
  'schema',
  'actionlint',
  'zizmor',
  'hadolint',
  'knip',
  // Last but for `eslint`, and uncontested there: it owns four concepts nothing else covers, so its
  // rank never decides anything. It sits here rather than higher because a project engine that reads
  // a lockfile and a 16 MB index is not the "fastest capable engine" for anything.
  'deps-security',
  'eslint',
]

export type Capability = 'types' | 'project-graph' | 'workspace-graph'

export type FixDomain = 'imports' | 'statements' | 'expressions' | 'jsx' | 'formatting'

/** 0 = native, 1 = native with type information, 2 = JavaScript or WebAssembly. */
export type EngineTier = 0 | 1 | 2

/**
 * Attributes one finding of a multi-concept rule to a single concept.
 * `concepts` says what a rule may *claim* during arbitration; this says what an individual
 * finding *is*. Without it, a rule covering two concepts would emit two diagnostics for one
 * finding — the double reporting arbitration exists to prevent.
 */
export type ClassifyRule = {
  readonly messagePattern: string
  readonly concept: ConceptId
}

export type RuleEntry = {
  readonly engine: EngineId
  readonly engineRuleId: string
  readonly concepts: readonly ConceptId[]
  readonly classify?: readonly ClassifyRule[]
  readonly tier: EngineTier
  /** Tiebreaker for conflicting fixes. Reserved: not consulted during arbitration in M0. */
  readonly priority: number
  readonly severityDefault: Severity
  readonly fixKind: FixKind | 'none'
  readonly fixTouches: readonly FixDomain[]
  readonly requires: readonly Capability[]
  readonly languages: readonly LanguageId[]
  readonly docsUrl: string
  readonly since: string
  readonly deprecated?: { readonly since: string; readonly replacedBy?: string }
}

export type RuleRef = { readonly engine: EngineId; readonly engineRuleId: string }

export function ruleRefKey(ref: RuleRef): string {
  return `${ref.engine}/${ref.engineRuleId}`
}
