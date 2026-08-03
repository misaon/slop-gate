import type { ProvenanceLayer, ProvenanceStep, RuleSetResolver } from '../config/resolve.ts'
import type { RuleLevel, RuleOptions, RuleSetting } from '../config/types.ts'
import { splitRuleSetting } from '../config/types.ts'

/**
 * `layer` because two kinds of block now land in the same list: a user's own `overrides` entry, and a
 * framework profile's path-scoped adjustment. They are not interchangeable — one beats the base
 * config and one is beaten by it — so a renderer that could not tell them apart would print the same
 * word for both and mislead about precedence.
 */
export type OverrideMention = { layer: ProvenanceLayer; source: string; setting: RuleSetting }

export type ConceptEnablement = {
  /** `resolver.anyEnabledConcepts.has(concept)` — enabled anywhere in this run, base or override. */
  enabled: boolean
  /** The strongest level any layer assigns, base or override — `resolver.maxLevelOf(concept)`. */
  level: RuleLevel
  /** The options the engine is actually configured with — `resolver.optionsOf(concept)`, so base
   *  cascade only. Empty when no layer set any. */
  options: RuleOptions
  /** Which layer those options came from. The whole reason this is carried separately from
   *  `baseProvenance`: options and level can be decided by two different layers (a config raising
   *  the severity of a rule a preset configured), and "what won" has to be answerable for each. */
  optionsFrom: { layer: ProvenanceLayer; source: string } | undefined
  /** The base cascade's provenance for this concept — preset, root config, workspace config, in
   *  application order — or empty when no base layer ever mentions it. */
  baseProvenance: readonly ProvenanceStep[]
  /** Override blocks that mention this concept, regardless of which files they match — see
   *  `RuleSetResolver.overridesFor`'s own doc comment for why this is separate from `forFile`. */
  overrides: readonly OverrideMention[]
}

/**
 * Assembles the facts behind "is this concept enabled, and what put it there" from data the
 * resolver already computed — `resolveEnablement` derives nothing new, it only reads
 * `resolver.anyEnabledConcepts`, `resolver.maxLevelOf`, `resolver.base.rules` and
 * `resolver.overridesFor` for one concept. Shared by `sgate rules list`'s condensed "why enabled"
 * column and `sgate rules why`'s full explanation so the two can never disagree about the same
 * question.
 */
export function resolveEnablement(resolver: RuleSetResolver, concept: string): ConceptEnablement {
  return {
    enabled: resolver.anyEnabledConcepts.has(concept),
    level: resolver.maxLevelOf(concept),
    options: resolver.optionsOf(concept),
    optionsFrom: resolver.base.rules.get(concept as never)?.optionsFrom,
    baseProvenance: resolver.base.rules.get(concept as never)?.provenance ?? [],
    overrides: resolver.overridesFor(concept),
  }
}

/**
 * True when some step in `baseProvenance` set a non-`off` level before the base cascade's final,
 * currently-effective step — i.e. "a layer enabled this and a later one turned it off", as opposed
 * to no layer ever having enabled it at all. Only meaningful to ask when the base cascade's own
 * final level is `off`; a caller checks that first (see `sgate rules why`'s renderer).
 *
 * A pure, tiny, separately-testable classification over already-fetched provenance — deliberately
 * not folded into `resolveEnablement` itself, which only assembles facts; this is the one piece of
 * interpretation `why` needs, kept in core so a test can pin its behaviour down directly rather
 * than only through rendered prose.
 */
export function wasEnabledBeforeBeingDisabled(baseProvenance: readonly ProvenanceStep[]): boolean {
  if (baseProvenance.length === 0) return false
  const last = baseProvenance.at(-1)!
  if (splitRuleSetting(last.setting).level !== 'off') return false
  return baseProvenance.some((step) => splitRuleSetting(step.setting).level !== 'off')
}
