import type { CatalogueEntry, CatalogueStatus, CatalogueSummary } from '@misaon/slop-gate-core'

type RuleOrigin = { readonly commit: string; readonly date: string; readonly subject: string }

export type RulesPayload = {
  readonly generatedAt: string
  readonly rules: readonly CatalogueEntry[]
  readonly summary: CatalogueSummary
  readonly history: {
    readonly origins: Readonly<Record<string, RuleOrigin>>
    readonly removed: readonly { readonly ruleRefKey: string; readonly lastSeen: RuleOrigin }[]
  }
}

export type Row = CatalogueEntry & { readonly origin: RuleOrigin | null }

export async function fetchRules(): Promise<{ rows: Row[]; payload: RulesPayload }> {
  const response = await fetch('/api/rules')
  if (!response.ok) throw new Error(`/api/rules responded ${response.status}`)
  const payload = (await response.json()) as RulesPayload

  const rows = payload.rules.map((rule): Row => ({ ...rule, origin: payload.history.origins[rule.ruleRefKey] ?? null }))
  return { rows, payload }
}

export const STATUS_LABEL: Readonly<Record<CatalogueStatus, string>> = {
  recommended: 'on',
  withheld: 'withheld',
  unlisted: 'available',
}

export const STATUS_HELP: Readonly<Record<CatalogueStatus, string>> = {
  recommended: '`recommended` turns this on. The level column says how loudly.',
  withheld: 'Deliberately kept out of `recommended`, with a reason recorded in the registry.',
  unlisted: 'Known to slop-gate but not in any preset. Name its concept in your config to enable it.',
}
