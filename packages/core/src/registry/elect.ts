import type { LanguageId } from '../languages.ts'
import { ENGINE_PREFERENCE, type Capability, type EngineId, type RuleEntry, type RuleRef } from './types.ts'

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
    a.engineRuleId.localeCompare(b.engineRuleId)

  for (const concept of [...input.enabledConcepts].sort()) {
    const applicable = input.entries.filter((e) => e.concepts.includes(concept as never) && isApplicable(e))
    const pinned = input.pinnedOwners?.[concept]
    const eligible = pinned === undefined ? applicable : applicable.filter((e) => e.engine === pinned)

    if (eligible.length === 0) {
      uncovered.push(concept)
      continue
    }

    const [winner, ...losers] = [...eligible].sort(compare)
    owners.set(concept, refOf(winner!))

    const enabled = selection.get(winner!.engine) ?? new Set<string>()
    enabled.add(winner!.engineRuleId)
    selection.set(winner!.engine, enabled)

    const alsoRejectedByPin = pinned === undefined ? [] : applicable.filter((e) => e.engine !== pinned)
    for (const loser of [...losers, ...alsoRejectedByPin]) {
      suppressed.push({
        concept,
        suppressed: refOf(loser),
        winner: refOf(winner!),
        reason: reasonFor(winner!, loser, pinned !== undefined),
      })
    }
  }

  return { owners, selection, suppressed, uncovered }
}

function reasonFor(winner: RuleEntry, loser: RuleEntry, isPinned: boolean): SuppressionReason {
  if (isPinned) return 'pinned-owner'
  if (winner.tier !== loser.tier) return 'lower-tier'
  if (winner.engine !== loser.engine) return 'engine-preference'
  return 'rule-id-tiebreak'
}
