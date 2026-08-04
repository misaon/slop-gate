import { GENERATED_RULE_ENTRIES } from './entries.generated.ts'
import { UNCATALOGUED_RULE_ENTRIES } from './entries.uncatalogued.ts'
import type { RuleEntry } from './types.ts'

export const RULE_ENTRIES = [...UNCATALOGUED_RULE_ENTRIES, ...GENERATED_RULE_ENTRIES] as const satisfies readonly RuleEntry[]
