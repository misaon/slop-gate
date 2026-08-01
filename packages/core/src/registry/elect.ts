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
}

const refOf = (entry: RuleEntry): RuleRef => ({ engine: entry.engine, engineRuleId: entry.engineRuleId })

export function electOwners(input: ElectionInput): ElectionResult {
  const preference = input.enginePreference ?? ENGINE_PREFERENCE
  const rank = new Map(preference.map((engine, index) => [engine, index]))

  const owners = new Map<string, RuleRef>()
  const selection = new Map<EngineId, Set<string>>()
  const suppressed: SuppressionRecord[] = []
  const uncovered: string[] = []

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

  const compare = (a: RuleEntry, b: RuleEntry): number =>
    a.tier - b.tier ||
    (rank.get(a.engine) ?? preference.length) - (rank.get(b.engine) ?? preference.length) ||
    compareStrings(a.engineRuleId, b.engineRuleId)

  for (const concept of [...input.enabledConcepts].sort(compareStrings)) {
    const candidates = input.entries.filter((e) => e.concepts.includes(concept as never))
    const ranked = candidates.filter(isApplicable).sort(compare)
    const pinned = input.pinnedOwners?.[concept]
    const eligible = pinned === undefined ? ranked : ranked.filter((e) => e.engine === pinned)

    if (eligible.length === 0) {
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

  return { owners, selection, suppressed, uncovered }
}

function reasonFor(winner: RuleEntry, loser: RuleEntry, pinOverrode: boolean): SuppressionReason {
  if (pinOverrode) return 'pinned-owner'
  if (winner.tier !== loser.tier) return 'lower-tier'
  if (winner.engine !== loser.engine) return 'engine-preference'
  return 'rule-id-tiebreak'
}
