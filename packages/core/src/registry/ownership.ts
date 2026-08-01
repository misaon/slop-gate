import type { LanguageId } from '../languages.ts'
import type { ConceptOwnership } from './elect.ts'
import type { EngineId } from './types.ts'

export type OwnershipCandidate = {
  concept: string
  engine: EngineId
  engineRuleId: string
  /**
   * The language of the file the finding is about. Ownership is `(concept, language)`-keyed, so this
   * is what makes the check exact: a rule that won a concept for `ts` and lost it for `vue` must not
   * have its `vue` findings kept merely because it owns the concept somewhere.
   *
   * Optional, and omitting it means "owned for any language". That is the honest answer for a caller
   * with no file in hand — `judgedBy` asks about a directive's target, not about a finding — and it
   * is never the weaker answer by accident, because the caller that has a file always passes it.
   */
  language?: LanguageId
}

export type OwnerMap = ReadonlyMap<string, readonly ConceptOwnership[]>

/**
 * Whether this rule is the one entitled to report this concept on this file.
 *
 * **The language is only consulted when the concept has more than one owner.** That is the whole
 * job the language dimension does: it decides *which* of several owners speaks for a given file.
 * Where a single rule owns a concept outright there is nobody to disambiguate against, and applying
 * the filter anyway would drop legitimate findings — a project engine reports against files it was
 * never handed and whose language its rule does not list, `tsc` naming `tsconfig.json` (language
 * `jsonc`) being the case in this repository's own test suite.
 *
 * **Enforcing the language unconditionally here is a coverage loss dressed up as an invariant.** The
 * first version of this function did exactly that, and the `tsc`/`tsconfig.json` test caught it. An
 * invariant that discards real findings is worse than the looser rule it replaced.
 *
 * The residual gap: a concept split across languages *and* owned by a project engine that reports
 * outside its own language would have that finding dropped. No such concept exists — every split
 * candidate today is file-granularity — and the fix if one appears is for the engine to say which
 * file its finding is really about, not to widen this.
 */
export function isOwned(owners: OwnerMap, candidate: OwnershipCandidate): boolean {
  const ownership = owners.get(candidate.concept) ?? []
  const contested = ownership.length > 1
  return ownership.some(
    ({ owner, languages }) =>
      owner.engine === candidate.engine &&
      owner.engineRuleId === candidate.engineRuleId &&
      (!contested || candidate.language === undefined || languages.includes(candidate.language)),
  )
}

export function filterOwned<T extends OwnershipCandidate>(owners: OwnerMap, candidates: readonly T[]): T[] {
  return candidates.filter((candidate) => isOwned(owners, candidate))
}

/** Every engine owning a concept, across all languages. Empty when nothing owns it. */
export function owningEngines(owners: OwnerMap, concept: string): readonly EngineId[] {
  return (owners.get(concept) ?? []).map(({ owner }) => owner.engine)
}
