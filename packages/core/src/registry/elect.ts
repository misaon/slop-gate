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
  languages: readonly LanguageId[]
}

export type ConceptOwnership = {
  readonly owner: RuleRef
  readonly languages: readonly LanguageId[]
}

export type IneligibilityReason =
  | 'deprecated'
  | 'engine-not-participating'
  | 'engine-unavailable'
  | 'missing-capability'
  | 'language-mismatch'
  | 'pinned-to-other-engine'

export type IneligibleCandidate = {
  concept: string
  candidate: RuleRef
  reason: IneligibilityReason
  capability?: Capability
}

export type ElectionInput = {
  entries: readonly RuleEntry[]
  enabledConcepts: ReadonlySet<string>
  capabilities: ReadonlySet<Capability>
  languages: ReadonlySet<LanguageId>
  participatingEngines: ReadonlySet<EngineId>
  unavailableEngines?: ReadonlySet<EngineId>
  pinnedOwners?: Readonly<Record<string, EngineId>>
  enginePreference?: readonly EngineId[]
}

export type ElectionResult = {
  owners: Map<string, readonly ConceptOwnership[]>
  selection: Map<EngineId, Set<string>>
  overlaps: RuleOverlap[]
  uncovered: string[]
  ineligible: IneligibleCandidate[]
  displaced: DisplacedOwner[]
}

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

  const isCapable = (entry: RuleEntry): boolean =>
    entry.deprecated === undefined &&
    input.participatingEngines.has(entry.engine) &&
    !unavailable.has(entry.engine) &&
    entry.requires.every((capability) => input.capabilities.has(capability))

  const isCapableIfInstalled = (entry: RuleEntry): boolean =>
    entry.deprecated === undefined &&
    input.participatingEngines.has(entry.engine) &&
    entry.requires.every((capability) => input.capabilities.has(capability))

  const isApplicable = (entry: RuleEntry): boolean =>
    isCapable(entry) && entry.languages.some((language) => input.languages.has(language))

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

    for (const candidate of candidates) {
      if (isApplicable(candidate)) continue
      ineligible.push({ concept, candidate: refOf(candidate), ...ineligibilityReason(candidate) })
    }

    const pinned = input.pinnedOwners?.[concept]

    const contested = [...new Set(ranked.flatMap((e) => e.languages))]
      .filter((language) => input.languages.has(language))
      .sort(compareStrings)

    const ownedLanguages = new Map<string, { entry: RuleEntry; languages: LanguageId[] }>()
    const lostLanguages = new Map<string, { record: Omit<RuleOverlap, 'languages'>; languages: LanguageId[] }>()
    const displacedLanguages = new Map<string, { entry: RuleEntry; instead: RuleEntry | undefined; languages: LanguageId[] }>()

    const rankedIfInstalled = candidates.filter(
      (e) => isCapableIfInstalled(e) && e.languages.some((language) => input.languages.has(language)),
    ).sort(compare)
    const contestedIfInstalled = [...new Set(rankedIfInstalled.flatMap((e) => e.languages))]
      .filter((language) => input.languages.has(language))
      .sort(compareStrings)

    for (const language of contestedIfInstalled) {
      const hereIfInstalled = rankedIfInstalled.filter((e) => e.languages.includes(language))
      const wouldWin = (pinned === undefined ? hereIfInstalled : hereIfInstalled.filter((e) => e.engine === pinned))[0]
      if (wouldWin === undefined || !unavailable.has(wouldWin.engine)) continue

      const here = ranked.filter((e) => e.languages.includes(language))
      const instead = (pinned === undefined ? here : here.filter((e) => e.engine === pinned))[0]
      const key = `${ruleRefKey(wouldWin)} ${instead === undefined ? '' : ruleRefKey(instead)}`
      const record = displacedLanguages.get(key) ?? { entry: wouldWin, instead, languages: [] }
      record.languages.push(language)
      displacedLanguages.set(key, record)
    }

    for (const key of [...displacedLanguages.keys()].sort(compareStrings)) {
      const { entry: wouldOwn, instead, languages } = displacedLanguages.get(key)!
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
        const pinOverrode = pinned !== undefined && compare(loser, winner) < 0
        const reason = reasonFor(winner, loser, pinOverrode)
        const key = `${loserKey}\0${winnerKey}\0${reason}`
        const lost = lostLanguages.get(key) ?? {
          record: { concept, loser: refOf(loser), winner: refOf(winner), reason },
          languages: [],
        }
        lost.languages.push(language)
        lostLanguages.set(key, lost)
      }
    }

    if (ownedLanguages.size > 0) {
      owners.set(
        concept,
        [...ownedLanguages.values()]
          .sort((a, b) => compare(a.entry, b.entry))
          .map(({ entry, languages }) => ({ owner: refOf(entry), languages })),
      )
      for (const key of [...lostLanguages.keys()].sort(compareStrings)) {
        const { record, languages } = lostLanguages.get(key)!
        overlaps.push({ ...record, languages })
      }
      continue
    }

    if (pinned !== undefined) {
      for (const candidate of ranked) ineligible.push({ concept, candidate: refOf(candidate), reason: 'pinned-to-other-engine' })
    }
    if (!SLOP_GATE_SERVICED_CONCEPTS.has(concept)) {
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
