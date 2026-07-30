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
  pinnedOwners?: Readonly<Record<string, EngineId>>
  enginePreference?: readonly EngineId[]
}

export type ElectionResult = {
  owners: Map<string, RuleRef>
  selection: Map<EngineId, Set<string>>
  suppressed: SuppressionRecord[]
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

  const isApplicable = (entry: RuleEntry): boolean =>
    entry.deprecated === undefined &&
    entry.requires.every((capability) => input.capabilities.has(capability)) &&
    entry.languages.some((language) => input.languages.has(language))

  const compare = (a: RuleEntry, b: RuleEntry): number =>
    a.tier - b.tier ||
    (rank.get(a.engine) ?? preference.length) - (rank.get(b.engine) ?? preference.length) ||
    compareStrings(a.engineRuleId, b.engineRuleId)

  for (const concept of [...input.enabledConcepts].sort(compareStrings)) {
    const ranked = input.entries
      .filter((e) => e.concepts.includes(concept as never) && isApplicable(e))
      .sort(compare)
    const pinned = input.pinnedOwners?.[concept]
    const eligible = pinned === undefined ? ranked : ranked.filter((e) => e.engine === pinned)

    if (eligible.length === 0) {
      uncovered.push(concept)
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
