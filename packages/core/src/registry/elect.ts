import { SLOP_GATE_SERVICED_CONCEPTS } from '../concepts/catalogue.ts'
import type { LanguageId } from '../languages.ts'
import { compareStrings } from '../ordering.ts'
import { ENGINE_PREFERENCE, ruleRefKey, type Capability, type EngineId, type RuleEntry, type RuleRef } from './types.ts'

export type OverlapReason = 'lower-tier' | 'engine-preference' | 'rule-id-tiebreak' | 'pinned-owner'

export type RuleOverlap = {
  concept: string
  loser: RuleRef
  winner: RuleRef
  reason: OverlapReason
  /**
   * The languages this rule actually lost on, sorted — never every language the concept spans. Two
   * rules that both cover `ts` collide there and nowhere else if that is all they share.
   *
   * One record per losing rule, not one per language, deliberately: a loser beaten across four
   * languages is one fact about one rule, and splitting it four ways would multiply the volume of
   * `rules conflicts` and `config.rule-overlap` for no added information.
   */
  languages: readonly LanguageId[]
}

/**
 * One rule's ownership of one concept, over the languages it won.
 *
 * A concept usually has exactly one of these. It has more than one when different engines own it for
 * different languages — `correctness.parse-error` belongs to oxlint for TypeScript and to the schema
 * engine for YAML — which is not a conflict, because no file is both.
 */
export type ConceptOwnership = {
  readonly owner: RuleRef
  /** Languages present in this repository that `owner` owns the concept for. Sorted. */
  readonly languages: readonly LanguageId[]
}

/**
 * Why a candidate never reached arbitration at all — as opposed to `OverlapReason`, which
 * explains why a candidate that *did* contest a concept lost. Ordered to match the short-circuit
 * order `isCapable`/`isApplicable` already check in: a candidate failing more than one of these
 * (e.g. deprecated *and* the wrong language) is attributed to whichever one `electOwners` itself
 * would have rejected it on first.
 */
export type IneligibilityReason =
  | 'deprecated'
  | 'engine-not-participating'
  /**
   * The engine is registered but its tooling is not installed here (`Engine.availability`).
   * Deliberately distinct from `engine-not-participating`: "this build does not include actionlint"
   * and "actionlint is not installed on this machine" are different facts, and a user comparing two
   * machines that disagree needs to be told which one they are looking at.
   */
  | 'engine-unavailable'
  | 'missing-capability'
  | 'language-mismatch'
  /**
   * `owners` pins this concept to a different engine, and every applicable, capable candidate here
   * belongs to some other engine — so none of them ever got a chance to contest it, even one that
   * would otherwise have won outright. Distinct from the ordinary `'pinned-owner'`
   * `OverlapReason`, which explains a candidate that *did* contest the concept and lost to the
   * pinned winner; this fires only when the pin leaves no winner at all (see the `'reports a
   * concept as uncovered when the pinned engine offers no rule'` test in `elect.test.ts`) and the
   * concept goes `uncovered` with no winner to record an overlap against.
   */
  | 'pinned-to-other-engine'

export type IneligibleCandidate = {
  concept: string
  candidate: RuleRef
  reason: IneligibilityReason
  /** Set only when `reason` is `'missing-capability'`: the specific capability that was absent. */
  capability?: Capability
}

export type ElectionInput = {
  entries: readonly RuleEntry[]
  enabledConcepts: ReadonlySet<string>
  capabilities: ReadonlySet<Capability>
  languages: ReadonlySet<LanguageId>
  /**
   * Engine ids actually instantiated for this run (e.g. `options.engines.map(e => e.id)` in
   * `check.ts`). Required, not optional, so a future caller cannot forget it the way this field's
   * absence let arbitration forget it before: an entry whose engine never runs must not contest a
   * concept or appear in a `RuleOverlap`, or arbitration reports an overlap that never
   * happened (see the M0 follow-up this closes — the registry's synthetic `eslint` entry made
   * every real run report an oxlint/eslint overlap even though no eslint engine ever ran).
   */
  participatingEngines: ReadonlySet<EngineId>
  /**
   * Registered engines whose tooling is absent (`Engine.availability`). They cannot own a concept:
   * the next-ranked eligible entry takes it.
   *
   * Gating ownership on availability rather than letting an absent engine win and then reporting
   * nothing is the difference between a gap we *have* and a gap we *elected*. actionlint outranks
   * the schema engine on workflow parse errors, so without this an uninstalled actionlint would
   * take workflow syntax checking down with it — while an always-present engine that could have
   * reported it sat unelected.
   */
  unavailableEngines?: ReadonlySet<EngineId>
  pinnedOwners?: Readonly<Record<string, EngineId>>
  enginePreference?: readonly EngineId[]
}

export type ElectionResult = {
  /**
   * Concept → the rules that own it, one entry per owning rule, ordered by engine preference then
   * rule id. Empty-array entries are never stored: a concept with no owner is simply absent, which
   * keeps `owners.has(concept)` meaning what it always did.
   */
  owners: Map<string, readonly ConceptOwnership[]>
  selection: Map<EngineId, Set<string>>
  overlaps: RuleOverlap[]
  /**
   * Concepts with no elected owner for a reason *other* than "the repository does not contain the
   * language this concept applies to" — i.e. a genuine coverage gap: the concept's only candidates
   * are deprecated, belong to an engine this run never instantiated, or require a capability no
   * participating engine provides. A concept whose every candidate is otherwise fully capable and
   * fails only on language (e.g. a Vue-scoped rule in a repository with no `.vue` files) is
   * correctly uncovered but is *not* pushed here — that is expected behaviour, not a shortfall, and
   * reporting it on every run would be noise about the repository's shape, not the tool's coverage.
   */
  uncovered: string[]
  /**
   * Every candidate that never reached arbitration for a concept it declares, with the specific
   * reason it was rejected — the data `isCapable`/`isApplicable` used to filter out and discard
   * silently. `why` (the `sgate rules why` CLI command) reads this rather than re-deriving it: a
   * concept with no owner is either here (a specific, recorded reason exists) or in neither
   * `overlaps` nor `ineligible` at all, which itself means no `RuleEntry` ever claimed it in the
   * first place — see `servicedBySlopGate` for that last case.
   */
  ineligible: IneligibleCandidate[]
  /**
   * Ownership an absent engine would have taken had it been installed — the data behind the
   * coverage gap a run reports, and behind `rules why` being able to say "actionlint would own this,
   * but it is not installed, so the schema engine does".
   *
   * Only populated where the absent engine would actually have *won*. An absent engine that would
   * have lost anyway changes nothing, and naming it would send a reader to install a tool that
   * would not have helped.
   */
  displaced: DisplacedOwner[]
}

/** One concept an absent engine would have owned. `insteadOwnedBy` is undefined when nothing else can. */
export type DisplacedOwner = {
  readonly concept: string
  readonly languages: readonly LanguageId[]
  readonly wouldOwn: RuleRef
  readonly insteadOwnedBy: RuleRef | undefined
}

const refOf = (entry: RuleEntry): RuleRef => ({ engine: entry.engine, engineRuleId: entry.engineRuleId })

export function electOwners(input: ElectionInput): ElectionResult {
  const preference = input.enginePreference ?? ENGINE_PREFERENCE
  const rank = new Map(preference.map((engine, index) => [engine, index]))

  const owners = new Map<string, readonly ConceptOwnership[]>()
  const selection = new Map<EngineId, Set<string>>()
  const overlaps: RuleOverlap[] = []
  const uncovered: string[] = []
  const ineligible: IneligibleCandidate[] = []
  const displaced: DisplacedOwner[] = []
  const unavailable = input.unavailableEngines ?? new Set<EngineId>()

  // Everything `isApplicable` checks except the language intersection — i.e. "would this candidate
  // run at all, in this configuration, regardless of what the repository's files are written in".
  // Splitting this out is what lets the empty-`eligible` branch below tell a genuine coverage gap
  // (no capable engine, full stop) apart from a language mismatch (a capable engine exists, the
  // repository just doesn't contain that language).
  const isCapable = (entry: RuleEntry): boolean =>
    entry.deprecated === undefined &&
    input.participatingEngines.has(entry.engine) &&
    !unavailable.has(entry.engine) &&
    entry.requires.every((capability) => input.capabilities.has(capability))

  /**
   * The same ranking, ignoring availability — what the election *would* have produced with
   * everything installed. Used only to fill `displaced`, never to elect anything.
   */
  const isCapableIfInstalled = (entry: RuleEntry): boolean =>
    entry.deprecated === undefined &&
    input.participatingEngines.has(entry.engine) &&
    entry.requires.every((capability) => input.capabilities.has(capability))

  const isApplicable = (entry: RuleEntry): boolean =>
    isCapable(entry) && entry.languages.some((language) => input.languages.has(language))

  // The single reason `isApplicable` rejected `entry`, checked in the same order `isCapable`
  // itself short-circuits in. Only ever called on an entry that already failed `isApplicable`, so
  // exactly one of these always fires — there is no "still applicable" fall-through to handle.
  const ineligibilityReason = (entry: RuleEntry): { reason: IneligibilityReason; capability?: Capability } => {
    if (entry.deprecated !== undefined) return { reason: 'deprecated' }
    if (!input.participatingEngines.has(entry.engine)) return { reason: 'engine-not-participating' }
    if (unavailable.has(entry.engine)) return { reason: 'engine-unavailable' }
    const missing = entry.requires.find((capability) => !input.capabilities.has(capability))
    if (missing !== undefined) return { reason: 'missing-capability', capability: missing }
    return { reason: 'language-mismatch' }
  }

  const compare = (a: RuleEntry, b: RuleEntry): number =>
    a.tier - b.tier ||
    (rank.get(a.engine) ?? preference.length) - (rank.get(b.engine) ?? preference.length) ||
    compareStrings(a.engineRuleId, b.engineRuleId)

  for (const concept of [...input.enabledConcepts].sort(compareStrings)) {
    const candidates = input.entries.filter((e) => e.concepts.includes(concept as never))
    const ranked = candidates.filter(isApplicable).sort(compare)

    // Every candidate that did not make it into `ranked` is about to become invisible to both
    // `overlaps` (which only ever records losers drawn from `ranked`) and `uncovered` (a bare
    // concept id, no per-candidate detail) — record why each one specifically was rejected before
    // that happens, or a deprecated rule, one whose engine never ran, one missing a capability, or
    // one scoped to a language this repository doesn't contain vanishes without a trace.
    for (const candidate of candidates) {
      if (isApplicable(candidate)) continue
      ineligible.push({ concept, candidate: refOf(candidate), ...ineligibilityReason(candidate) })
    }

    const pinned = input.pinnedOwners?.[concept]

    // **Arbitration runs once per language, not once per concept.** A file has exactly one language,
    // so this is the scope at which "only one rule may report a concept here" is actually a
    // statement about anything: two rules that never share a language never meet on a file and were
    // never in conflict. `ranked` is already in arbitration order, so the per-language winner is
    // just its first entry that covers that language.
    const contested = [...new Set(ranked.flatMap((e) => e.languages))]
      .filter((language) => input.languages.has(language))
      .sort(compareStrings)

    const ownedLanguages = new Map<string, { entry: RuleEntry; languages: LanguageId[] }>()
    const lostLanguages = new Map<string, { record: Omit<RuleOverlap, 'languages'>; languages: LanguageId[] }>()
    const displacedLanguages = new Map<string, { entry: RuleEntry; instead: RuleEntry | undefined; languages: LanguageId[] }>()

    // The candidate set as it would be with everything installed, so a language whose *only*
    // candidate is absent still gets considered — `ranked` has already dropped those, so iterating
    // `contested` alone would miss exactly the case where absence costs the concept its last owner.
    const rankedIfInstalled = candidates.filter(
      (e) => isCapableIfInstalled(e) && e.languages.some((language) => input.languages.has(language)),
    ).sort(compare)
    const contestedIfInstalled = [...new Set(rankedIfInstalled.flatMap((e) => e.languages))]
      .filter((language) => input.languages.has(language))
      .sort(compareStrings)

    for (const language of contestedIfInstalled) {
      const hereIfInstalled = rankedIfInstalled.filter((e) => e.languages.includes(language))
      const wouldWin = (pinned === undefined ? hereIfInstalled : hereIfInstalled.filter((e) => e.engine === pinned))[0]
      // Only an absent engine that would actually have *won* is worth naming. One that would have
      // lost anyway changes nothing, and reporting it would send a reader to install a tool that
      // would not have helped.
      if (wouldWin === undefined || !unavailable.has(wouldWin.engine)) continue

      const here = ranked.filter((e) => e.languages.includes(language))
      const instead = (pinned === undefined ? here : here.filter((e) => e.engine === pinned))[0]
      const key = ruleRefKey(wouldWin)
      const record = displacedLanguages.get(key) ?? { entry: wouldWin, instead, languages: [] }
      record.languages.push(language)
      displacedLanguages.set(key, record)
    }

    for (const { entry: wouldOwn, instead, languages } of displacedLanguages.values()) {
      displaced.push({
        concept,
        languages,
        wouldOwn: refOf(wouldOwn),
        insteadOwnedBy: instead === undefined ? undefined : refOf(instead),
      })
    }

    for (const language of contested) {
      const here = ranked.filter((e) => e.languages.includes(language))
      const eligible = pinned === undefined ? here : here.filter((e) => e.engine === pinned)
      const winner = eligible[0]
      if (winner === undefined) continue

      const winnerKey = ruleRefKey(winner)
      const owned = ownedLanguages.get(winnerKey) ?? { entry: winner, languages: [] }
      owned.languages.push(language)
      ownedLanguages.set(winnerKey, owned)

      const enabled = selection.get(winner.engine) ?? new Set<string>()
      enabled.add(winner.engineRuleId)
      selection.set(winner.engine, enabled)

      for (const loser of here) {
        const loserKey = ruleRefKey(loser)
        if (loserKey === winnerKey) continue
        // A pin only explains a loss for a candidate that arbitration would otherwise have
        // ranked ahead of the winner (`compare(loser, winner) < 0`) — checking `loser.engine !==
        // pinned` instead mislabels any non-pinned-engine loser as 'pinned-owner' even when it
        // would have lost to the winner anyway, so a pin that merely agrees with what arbitration
        // would already have picked hides the real reason (finding 2).
        const pinOverrode = pinned !== undefined && compare(loser, winner) < 0
        const reason = reasonFor(winner, loser, pinOverrode)
        // Keyed by loser *and* winner *and* reason: a rule beaten by two different winners on two
        // languages is two distinct facts, and collapsing them would attribute both to whichever
        // language happened to be processed first.
        const key = `${loserKey} ${winnerKey} ${reason}`
        const lost = lostLanguages.get(key) ?? {
          record: { concept, loser: refOf(loser), winner: refOf(winner), reason },
          languages: [],
        }
        lost.languages.push(language)
        lostLanguages.set(key, lost)
      }
    }

    if (ownedLanguages.size > 0) {
      // Sorted by arbitration order, not by whichever language happened to be processed first:
      // `owners` is read straight into `rules list` and `rules why`, and a reader comparing two
      // owners of one concept is comparing tiers, so the faster engine belongs first.
      owners.set(
        concept,
        [...ownedLanguages.values()]
          .sort((a, b) => compare(a.entry, b.entry))
          .map(({ entry, languages }) => ({ owner: refOf(entry), languages })),
      )
      // Emitted in loser order rather than language order so the sequence does not depend on which
      // language happened to be arbitrated first (see the entry-order-independence test).
      for (const key of [...lostLanguages.keys()].sort(compareStrings)) {
        const { record, languages } = lostLanguages.get(key)!
        overlaps.push({ ...record, languages })
      }
      continue
    }

    // No language elected an owner. Everything below is the pre-existing no-owner accounting,
    // unchanged in meaning — it just now asks "did this concept find an owner anywhere" rather than
    // "did this concept find an owner".
    //
    // A pin naming an engine absent from `ranked` discards every otherwise-viable candidate: without
    // this, a candidate that would have won on merit — tier, engine preference, everything —
    // vanishes with no record at all. `pinned !== undefined` is not redundant here: when there is no
    // pin, an empty result already means an empty `ranked` and this loop is a no-op either way.
    if (pinned !== undefined) {
      for (const candidate of ranked) ineligible.push({ concept, candidate: refOf(candidate), reason: 'pinned-to-other-engine' })
    }
    // A concept slop-gate emits itself (e.g. `config.rule-overlap`) will never have a `RuleEntry`
    // — counting it against the repository's engine coverage would warn about the tool's own
    // diagnostics on every single run.
    if (!SLOP_GATE_SERVICED_CONCEPTS.has(concept)) {
      // Recomputed ignoring the language filter specifically: if some candidate is otherwise fully
      // capable (right engine, right capabilities, not deprecated) and only fails on language, the
      // repository simply doesn't contain that language — not a coverage gap. Only push a concept
      // here when *no* candidate would run even discounting language entirely.
      const capable = candidates.filter(isCapable)
      const eligibleIgnoringLanguage = pinned === undefined ? capable : capable.filter((e) => e.engine === pinned)
      if (eligibleIgnoringLanguage.length === 0) uncovered.push(concept)
    }
  }

  return { owners, selection, overlaps, uncovered, ineligible, displaced }
}

function reasonFor(winner: RuleEntry, loser: RuleEntry, pinOverrode: boolean): OverlapReason {
  if (pinOverrode) return 'pinned-owner'
  if (winner.tier !== loser.tier) return 'lower-tier'
  if (winner.engine !== loser.engine) return 'engine-preference'
  return 'rule-id-tiebreak'
}
