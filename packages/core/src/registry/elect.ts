import { SLOP_GATE_SERVICED_CONCEPTS } from '../concepts/catalogue.ts'
import type { LanguageId } from '../languages.ts'
import { compareStrings } from '../ordering.ts'
import { ENGINE_PREFERENCE, ruleRefKey, type Capability, type EngineId, type RuleEntry, type RuleRef } from './types.ts'

export type SuppressionReason = 'lower-tier' | 'engine-preference' | 'rule-id-tiebreak' | 'pinned-owner'

export type SuppressionRecord = {
  concept: string
  suppressed: RuleRef
  winner: RuleRef
  reason: SuppressionReason
}

/**
 * Why a candidate never reached arbitration at all — as opposed to `SuppressionReason`, which
 * explains why a candidate that *did* contest a concept lost. Ordered to match the short-circuit
 * order `isCapable`/`isApplicable` already check in: a candidate failing more than one of these
 * (e.g. deprecated *and* the wrong language) is attributed to whichever one `electOwners` itself
 * would have rejected it on first.
 */
export type IneligibilityReason =
  | 'deprecated'
  | 'engine-not-participating'
  | 'missing-capability'
  | 'language-mismatch'
  /**
   * `owners` pins this concept to a different engine, and every applicable, capable candidate here
   * belongs to some other engine — so none of them ever got a chance to contest it, even one that
   * would otherwise have won outright. Distinct from the ordinary `'pinned-owner'`
   * `SuppressionReason`, which explains a candidate that *did* contest the concept and lost to the
   * pinned winner; this fires only when the pin leaves no winner at all (see the `'reports a
   * concept as uncovered when the pinned engine offers no rule'` test in `elect.test.ts`) and the
   * concept goes `uncovered` with no owner to suppress in favour of.
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
   * concept or appear in a suppression record, or arbitration reports a suppression that never
   * happened (see the M0 follow-up this closes — the registry's synthetic `eslint` entry made
   * every real run report an oxlint/eslint overlap even though no eslint engine ever ran).
   */
  participatingEngines: ReadonlySet<EngineId>
  pinnedOwners?: Readonly<Record<string, EngineId>>
  enginePreference?: readonly EngineId[]
}

export type ElectionResult = {
  owners: Map<string, RuleRef>
  selection: Map<EngineId, Set<string>>
  suppressed: SuppressionRecord[]
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
   * `suppressed` nor `ineligible` at all, which itself means no `RuleEntry` ever claimed it in the
   * first place — see `servicedBySlopGate` for that last case.
   */
  ineligible: IneligibleCandidate[]
}

const refOf = (entry: RuleEntry): RuleRef => ({ engine: entry.engine, engineRuleId: entry.engineRuleId })

export function electOwners(input: ElectionInput): ElectionResult {
  const preference = input.enginePreference ?? ENGINE_PREFERENCE
  const rank = new Map(preference.map((engine, index) => [engine, index]))

  const owners = new Map<string, RuleRef>()
  const selection = new Map<EngineId, Set<string>>()
  const suppressed: SuppressionRecord[] = []
  const uncovered: string[] = []
  const ineligible: IneligibleCandidate[] = []

  // Everything `isApplicable` checks except the language intersection — i.e. "would this candidate
  // run at all, in this configuration, regardless of what the repository's files are written in".
  // Splitting this out is what lets the empty-`eligible` branch below tell a genuine coverage gap
  // (no capable engine, full stop) apart from a language mismatch (a capable engine exists, the
  // repository just doesn't contain that language).
  const isCapable = (entry: RuleEntry): boolean =>
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
    // `suppressed` (which only ever records losers drawn from `ranked`) and `uncovered` (a bare
    // concept id, no per-candidate detail) — record why each one specifically was rejected before
    // that happens, or a deprecated rule, one whose engine never ran, one missing a capability, or
    // one scoped to a language this repository doesn't contain vanishes without a trace.
    for (const candidate of candidates) {
      if (isApplicable(candidate)) continue
      ineligible.push({ concept, candidate: refOf(candidate), ...ineligibilityReason(candidate) })
    }

    const pinned = input.pinnedOwners?.[concept]
    const eligible = pinned === undefined ? ranked : ranked.filter((e) => e.engine === pinned)

    if (eligible.length === 0) {
      // A pin naming an engine absent from `ranked` discards every otherwise-viable candidate the
      // same way: the `continue` below means the suppressed-recording loop further down never
      // runs for this concept, so without this, a candidate that would have won on merit — tier,
      // engine preference, everything — vanishes with no record at all, same as the pre-ranking
      // case just above. `pinned !== undefined` is not redundant with `eligible.length === 0`
      // here: when there is no pin, `eligible` is just `ranked`, so an empty `eligible` already
      // means an empty `ranked` and this loop is a no-op either way.
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
      continue
    }

    const winner = eligible[0]!
    owners.set(concept, refOf(winner))

    const enabled = selection.get(winner.engine) ?? new Set<string>()
    enabled.add(winner.engineRuleId)
    selection.set(winner.engine, enabled)

    const winnerKey = ruleRefKey(winner)
    for (const loser of ranked) {
      if (ruleRefKey(loser) === winnerKey) continue
      // A pin only explains a suppression for a candidate that arbitration would otherwise have
      // ranked ahead of the winner (`compare(loser, winner) < 0`) — checking `loser.engine !==
      // pinned` instead mislabels any non-pinned-engine loser as 'pinned-owner' even when it
      // would have lost to the winner anyway, so a pin that merely agrees with what arbitration
      // would already have picked hides the real reason (finding 2).
      const pinOverrode = pinned !== undefined && compare(loser, winner) < 0
      suppressed.push({
        concept,
        suppressed: refOf(loser),
        winner: refOf(winner),
        reason: reasonFor(winner, loser, pinOverrode),
      })
    }
  }

  return { owners, selection, suppressed, uncovered, ineligible }
}

function reasonFor(winner: RuleEntry, loser: RuleEntry, pinOverrode: boolean): SuppressionReason {
  if (pinOverrode) return 'pinned-owner'
  if (winner.tier !== loser.tier) return 'lower-tier'
  if (winner.engine !== loser.engine) return 'engine-preference'
  return 'rule-id-tiebreak'
}
