import { GENERATED_RULE_ENTRIES } from './entries.generated.ts'
import { UNCATALOGUED_RULE_ENTRIES } from './entries.uncatalogued.ts'
import type { RuleEntry } from './types.ts'

/**
 * The live registry, in two halves that split on one fact: **oxlint is the only engine with a rule
 * catalogue we can query.**
 *
 * - `entries.generated.ts` — every oxlint rule, produced by
 *   `packages/core/scripts/generate-registry.ts` from the live catalogue, with `registry/overrides.ts`
 *   and `registry/not-recommended.ts` already folded in.
 * - `entries.uncatalogued.ts` — the 75 entries no catalogue lists, so no generator can produce them:
 *   nine engines that expose no queryable rule set at all, plus the synthetic ids adapters invent
 *   (`oxlint/parse-error`) which oxlint's own catalogue does not carry either. These are hand-written
 *   permanently, not until someone gets round to it.
 *
 * `RULE_ENTRIES` is deliberately `as const satisfies readonly RuleEntry[]` so each entry keeps its
 * narrow literal type — see `entries.test.ts`'s `WIDENED_ENTRIES` for what that costs a consumer
 * that needs the declared shape instead.
 */
export const RULE_ENTRIES = [...UNCATALOGUED_RULE_ENTRIES, ...GENERATED_RULE_ENTRIES] as const satisfies readonly RuleEntry[]
