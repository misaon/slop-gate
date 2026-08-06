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
  'deps-security',
  'eslint',
]

export type Capability = 'types' | 'project-graph' | 'workspace-graph'

export type FixDomain = 'imports' | 'statements' | 'expressions' | 'jsx' | 'formatting'

type EngineTier = 0 | 1 | 2

export type ClassifyRule = {
  readonly messagePattern: string
  readonly concept: ConceptId
}

export type RuleEntry = {
  readonly engine: EngineId
  readonly engineRuleId: string
  readonly concepts: readonly [ConceptId, ...ConceptId[]]
  readonly classify?: readonly ClassifyRule[]
  readonly tier: EngineTier
  readonly priority: number
  readonly severityDefault: Severity
  readonly fixKind: FixKind | 'none'
  readonly fixTouches: readonly FixDomain[]
  readonly requires: readonly Capability[]
  readonly languages: readonly LanguageId[]
  readonly docsUrl: string
  readonly since: string
  /** The engine accepts options for this rule, so taking its default is a choice rather than the only shape. */
  readonly hasOptions?: boolean
  readonly deprecated?: { readonly since: string; readonly replacedBy?: string }
}

export type RuleRef = { readonly engine: EngineId; readonly engineRuleId: string }

export function ruleRefKey(ref: RuleRef): string {
  return `${ref.engine}/${ref.engineRuleId}`
}

export function parseRuleRefKey(key: string): { readonly engine: string; readonly engineRuleId: string } {
  const slash = key.indexOf('/')
  if (slash === -1) return { engine: '', engineRuleId: key }
  return { engine: key.slice(0, slash), engineRuleId: key.slice(slash + 1) }
}
