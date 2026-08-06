import { conceptById, isConceptId, type ConceptDefinition } from '../concepts/catalogue.ts'
import { PRESETS } from '../config/presets.ts'
import type { RuleLevel } from '../config/types.ts'
import { compareStrings } from '../ordering.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { NOT_RECOMMENDED_GENERATED, NOT_RECOMMENDED_UNCATALOGUED } from '../registry/not-recommended.ts'
import { RULE_OVERRIDES } from '../registry/overrides.ts'
import { ruleRefKey, type EngineId, type RuleEntry } from '../registry/types.ts'

/**
 * Why a rule is not in `recommended`. `withheld` is a decision someone made and wrote down;
 * `uncatalogued` is a rule whose concept the preset simply does not name, which is the default for
 * anything the policy did not promote.
 */
export type CatalogueStatus = 'recommended' | 'withheld' | 'unlisted'

export type CatalogueEntry = {
  readonly ruleRefKey: string
  readonly engine: EngineId
  readonly engineRuleId: string
  readonly concepts: readonly string[]
  readonly concept: string
  readonly group: string
  readonly title: string
  readonly description: string
  readonly languages: readonly string[]
  readonly docsUrl: string
  readonly status: CatalogueStatus
  /** The level `recommended` gives it, or null when it gives it none. */
  readonly level: Exclude<RuleLevel, 'off'> | null
  /** Stated reason it is withheld, verbatim from the registry. */
  readonly withheldReason: string | null
  readonly severityDefault: string
  readonly fixKind: string
  readonly fixTouches: readonly string[]
  readonly overridden: boolean
  readonly deprecated: { readonly since: string; readonly replacedBy?: string } | null
  readonly since: string
}

const EMPTY_CONCEPT: Pick<ConceptDefinition, 'group' | 'title' | 'description'> = {
  group: 'correctness',
  title: '',
  description: '',
}

function describe(concept: string): Pick<ConceptDefinition, 'group' | 'title' | 'description'> {
  return isConceptId(concept) ? conceptById(concept) : EMPTY_CONCEPT
}

function levelOf(concepts: readonly string[]): Exclude<RuleLevel, 'off'> | null {
  const rules = PRESETS.recommended
  for (const concept of concepts) {
    const setting = rules[concept as keyof typeof rules]
    if (setting === undefined) continue
    const level = Array.isArray(setting) ? setting[0] : setting
    if (level !== 'off') return level as Exclude<RuleLevel, 'off'>
  }
  return null
}

function withheldReasonFor(entry: RuleEntry): string | null {
  const key = entry.engine === 'oxlint' ? entry.engineRuleId : ruleRefKey(entry)
  return NOT_RECOMMENDED_UNCATALOGUED[key]?.reason ?? NOT_RECOMMENDED_GENERATED[key]?.reason ?? null
}

/**
 * Every rule slop-gate knows about, whether or not `recommended` turns it on — which is the part
 * `sgate rules list` cannot show, because it walks the concepts a run enabled.
 */
export function buildRuleCatalogue(): CatalogueEntry[] {
  // `RULE_ENTRIES` is `as const`, so its element type is a union of literals where optional fields
  // exist only on the members that set them. Widening once keeps the body reading one shape.
  const all: readonly RuleEntry[] = RULE_ENTRIES

  const entries = all.map((entry): CatalogueEntry => {
    const concept = entry.concepts[0]
    const level = levelOf(entry.concepts)
    const withheldReason = withheldReasonFor(entry)
    const described = describe(concept)

    return {
      ruleRefKey: ruleRefKey(entry),
      engine: entry.engine,
      engineRuleId: entry.engineRuleId,
      concepts: [...entry.concepts],
      concept,
      group: described.group,
      title: described.title,
      description: described.description,
      languages: [...entry.languages],
      docsUrl: entry.docsUrl,
      status: level !== null ? 'recommended' : withheldReason !== null ? 'withheld' : 'unlisted',
      level,
      withheldReason,
      severityDefault: entry.severityDefault,
      fixKind: entry.fixKind,
      fixTouches: [...entry.fixTouches],
      overridden: RULE_OVERRIDES[entry.engineRuleId] !== undefined,
      deprecated: entry.deprecated ?? null,
      since: entry.since,
    }
  })

  return entries.sort((a, b) => compareStrings(a.ruleRefKey, b.ruleRefKey))
}

export type CatalogueSummary = {
  readonly total: number
  readonly byStatus: Readonly<Record<CatalogueStatus, number>>
  readonly byEngine: readonly { readonly engine: string; readonly total: number; readonly recommended: number }[]
}

export function summariseCatalogue(entries: readonly CatalogueEntry[]): CatalogueSummary {
  const byStatus: Record<CatalogueStatus, number> = { recommended: 0, withheld: 0, unlisted: 0 }
  const byEngine = new Map<string, { total: number; recommended: number }>()

  for (const entry of entries) {
    byStatus[entry.status] += 1
    const bucket = byEngine.get(entry.engine) ?? { total: 0, recommended: 0 }
    bucket.total += 1
    if (entry.status === 'recommended') bucket.recommended += 1
    byEngine.set(entry.engine, bucket)
  }

  return {
    total: entries.length,
    byStatus,
    byEngine: [...byEngine]
      .map(([engine, counts]) => ({ engine, ...counts }))
      .sort((a, b) => b.total - a.total || compareStrings(a.engine, b.engine)),
  }
}
