import { GENERATED_RULE_ENTRIES } from './entries.generated.ts'
import { MANUAL_RULE_ENTRIES } from './entries.manual.ts'
import type { RuleEntry } from './types.ts'

/**
 * The live registry: every oxlint rule (`entries.generated.ts`, produced by
 * `packages/core/scripts/generate-registry.ts` from the live catalogue, with
 * `registry/overrides.ts` and `registry/exclusions.ts` already folded in) plus the two entries no
 * generator can produce (`entries.manual.ts`).
 *
 * `RULE_ENTRIES` is deliberately `as const satisfies readonly RuleEntry[]` so each entry keeps its
 * narrow literal type — see `entries.test.ts`'s `WIDENED_ENTRIES` for what that costs a consumer
 * that needs the declared shape instead.
 */
export const RULE_ENTRIES = [...MANUAL_RULE_ENTRIES, ...GENERATED_RULE_ENTRIES] as const satisfies readonly RuleEntry[]
