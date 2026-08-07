import { conceptById, isConceptId, type ConceptDefinition } from '../concepts/catalogue.ts'
import { PRESETS } from '../config/presets.ts'
import { OPTIONED_RECOMMENDED_RULES } from '../config/rule-options.ts'
import type { RuleLevel } from '../config/types.ts'
import { impactOf, type Impact } from '../registry/impact.ts'
import { CORPUS_PROJECTS, prevalenceOf, type Prevalence } from '../registry/prevalence.ts'
import { reliabilityOf, reliabilityPercent, type Reliability } from '../registry/reliability.ts'
import { compareStrings } from '../ordering.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { NOT_RECOMMENDED_GENERATED, NOT_RECOMMENDED_UNCATALOGUED, type NotRecommended } from '../registry/not-recommended.ts'
import { RULE_OVERRIDES } from '../registry/overrides.ts'
import { ruleRefKey, type EngineId, type RuleEntry } from '../registry/types.ts'

// `withheld` is a written-down decision; `unlisted` is merely a concept no preset names.
export type CatalogueStatus = 'recommended' | 'withheld' | 'unlisted'

/** Whether the rule can be tuned, and whether slop-gate tunes it. */
export type OptionState = 'tuned' | 'default' | 'none'

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
  /** Anchor in docs/measurements.md holding the figures behind that reason, when there are any. */
  readonly withheldEvidence: string | null
  /** What a finding costs if it is real, 1–3. See `registry/impact.ts`. */
  readonly impact: Impact
  /** Measured precision, or null where nobody has measured it. Never assumed. */
  readonly reliability: (Reliability & { readonly percent: number }) | null
  readonly options: OptionState
  /** The setting slop-gate applies, as it appears in a config, when it tunes the rule. */
  readonly optionSetting: unknown
  /** The reason for that setting, with the measurement behind it. */
  readonly optionReason: string | null
  readonly optionEvidence: string | null
  /** How often the rule fires over the corpus, or null when it fired on none of it. */
  readonly prevalence: (Prevalence & { readonly percent: number }) | null
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

function withheldFor(entry: RuleEntry): NotRecommended | null {
  const key = entry.engine === 'oxlint' ? entry.engineRuleId : ruleRefKey(entry)
  return NOT_RECOMMENDED_UNCATALOGUED[key] ?? NOT_RECOMMENDED_GENERATED[key] ?? null
}

// Every rule known, enabled or not — what `sgate rules list` cannot show, since it walks a run's
// enabled concepts.
export function buildRuleCatalogue(): CatalogueEntry[] {
  // `RULE_ENTRIES` is `as const`, so its element type is a union of literals where optional fields
  // exist only on the members that set them. Widening once keeps the body reading one shape.
  const all: readonly RuleEntry[] = RULE_ENTRIES

  const entries = all.map((entry): CatalogueEntry => {
    const concept = entry.concepts[0]
    const level = levelOf(entry.concepts)
    const withheld = withheldFor(entry)
    const described = describe(concept)
    const measured = reliabilityOf(ruleRefKey(entry))
    const tuned = entry.concepts.map((id) => OPTIONED_RECOMMENDED_RULES[id]).find((rule) => rule !== undefined)
    const seen = prevalenceOf(ruleRefKey(entry))

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
      status: level !== null ? 'recommended' : withheld !== null ? 'withheld' : 'unlisted',
      level,
      withheldReason: withheld?.reason ?? null,
      withheldEvidence: withheld?.evidence ?? null,
      impact: impactOf(concept, described.group),
      reliability: measured === null ? null : { ...measured, percent: reliabilityPercent(measured) },
      options: tuned !== undefined ? 'tuned' : entry.hasOptions === true ? 'default' : 'none',
      optionSetting: tuned?.setting ?? null,
      optionReason: tuned?.reason ?? null,
      optionEvidence: tuned?.evidence ?? null,
      prevalence: seen === null ? null : { ...seen, percent: Math.round((seen.seenIn / CORPUS_PROJECTS) * 100) },
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
  readonly byImpact: Readonly<Record<Impact, number>>
  readonly measured: number
  /** Rules that fired at least once over the corpus, and how many projects it holds. */
  readonly seenAtAll: number
  readonly corpusProjects: number
  readonly byEngine: readonly { readonly engine: string; readonly total: number; readonly recommended: number }[]
}

export function summariseCatalogue(entries: readonly CatalogueEntry[]): CatalogueSummary {
  const byStatus: Record<CatalogueStatus, number> = { recommended: 0, withheld: 0, unlisted: 0 }
  const byImpact: Record<Impact, number> = { 1: 0, 2: 0, 3: 0 }
  let measured = 0
  let seenAtAll = 0
  const byEngine = new Map<string, { total: number; recommended: number }>()

  for (const entry of entries) {
    byStatus[entry.status] += 1
    byImpact[entry.impact] += 1
    if (entry.reliability !== null) measured += 1
    if (entry.prevalence !== null) seenAtAll += 1
    const bucket = byEngine.get(entry.engine) ?? { total: 0, recommended: 0 }
    bucket.total += 1
    if (entry.status === 'recommended') bucket.recommended += 1
    byEngine.set(entry.engine, bucket)
  }

  return {
    total: entries.length,
    byStatus,
    byImpact,
    measured,
    seenAtAll,
    corpusProjects: CORPUS_PROJECTS,
    byEngine: [...byEngine]
      .map(([engine, counts]) => ({ engine, ...counts }))
      .sort((a, b) => b.total - a.total || compareStrings(a.engine, b.engine)),
  }
}
