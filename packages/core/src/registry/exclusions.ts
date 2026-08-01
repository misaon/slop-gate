export type RuleExclusion = {
  /**
   * Why this rule never enters `recommended`, stated plainly enough that nobody re-adds it later
   * thinking its absence was an oversight (design plan decision 3). Excluded rules still get a full
   * generated `RuleEntry` — they remain available to anyone who wants to enable them by concept —
   * this only removes them from the policy `packages/core/src/config/presets.ts` uses to compute
   * the `recommended` preset.
   */
  readonly reason: string
}

/**
 * Keyed the same way as `RULE_OVERRIDES` (see registry/overrides.ts): the oxlint `engineRuleId`
 * exactly as the generator derives it.
 *
 * Hand-authored, committed, and small by construction — each entry records a real measurement
 * against a real codebase, not a guess from reading the rule's description. Populated in the
 * registry-generation plan's Task 2.
 */
export const RULE_EXCLUSIONS: Readonly<Record<string, RuleExclusion>> = {}
