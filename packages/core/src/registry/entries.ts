import { GENERATED_RULE_ENTRIES } from './entries.generated.ts'
import { UNCATALOGUED_RULE_ENTRIES } from './entries.uncatalogued.ts'
import type { RuleEntry } from './types.ts'

/**
 * The live registry, in two halves that split on one fact: **oxlint is the only engine with a rule
 * catalogue we can query.** `entries.generated.ts` is every oxlint rule, produced by
 * `packages/core/scripts/generate-registry.ts` with `registry/overrides.ts` and
 * `registry/not-recommended.ts` already folded in; `entries.uncatalogued.ts` holds the entries no
 * catalogue lists — nine engines exposing no queryable rule set, plus the synthetic ids adapters invent
 * (`oxlint/parse-error`) — hand-written permanently, not until someone gets round to it.
 *
 * `as const satisfies` so each entry keeps its narrow literal type — see `entries.test.ts`'s
 * `WIDENED_ENTRIES` for what that costs a consumer that needs the declared shape instead.
 */
export const RULE_ENTRIES = [...UNCATALOGUED_RULE_ENTRIES, ...GENERATED_RULE_ENTRIES] as const satisfies readonly RuleEntry[]
