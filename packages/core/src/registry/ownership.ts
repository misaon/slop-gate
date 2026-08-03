import type { LanguageId } from '../languages.ts'
import type { ConceptOwnership } from './elect.ts'
import type { EngineId } from './types.ts'

export type OwnershipCandidate = {
  concept: string
  engine: EngineId
  engineRuleId: string
  /** The language of the file the finding is about. Ownership is `(concept, language)`-keyed, so this is
   *  what makes the check exact: a rule that won a concept for `ts` and lost it for `vue` must not have
   *  its `vue` findings kept merely because it owns the concept somewhere. Omitting it means "owned for
   *  any language" — the honest answer for a caller with no file in hand, like `judgedBy`. */
  language?: LanguageId
}

export type OwnerMap = ReadonlyMap<string, readonly ConceptOwnership[]>

/**
 * Whether this rule is the one entitled to report this concept on this file.
 *
 * **The language is only consulted when the concept has more than one owner** — deciding *which* of
 * several owners speaks for a given file is the whole job the language dimension does. Where a single
 * rule owns a concept outright there is nobody to disambiguate against, and **enforcing the language
 * anyway is a coverage loss dressed up as an invariant**: a project engine reports against files it was
 * never handed and whose language its rule does not list, and the first version of this function
 * dropped those until the `tsc`/`tsconfig.json` (language `jsonc`) test caught it.
 *
 * The residual gap: a concept split across languages *and* owned by a project engine that reports
 * outside its own language would have that finding dropped. No such concept exists today, and the fix
 * if one appears is for the engine to say which file its finding is really about, not to widen this.
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
