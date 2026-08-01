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
 * against a real codebase, not a guess from reading the rule's description.
 */
export const RULE_EXCLUSIONS: Readonly<Record<string, RuleExclusion>> = {
  'typescript/no-extraneous-class': {
    reason:
      "Measured against a real 95-TS-file NestJS project (srvc-bat), enabled alongside no-shadow: " +
      "11 of 12 total findings, every one of the 11 a false positive — an empty " +
      "`@Module({...}) export class XModule {}`, one per `*.module.ts` file. NestJS (and any other " +
      "decorator-driven DI framework) requires that class body to be empty; the decorator, not the " +
      "class, carries the behaviour. 11/11 (100%) false positives in isolation. Recorded in full in " +
      "docs/superpowers/specs/2026-07-31-m0-followups.md, \"Deliberately excluded rules\". The " +
      "general lesson this rule is the example of: a rule's value can depend on the framework " +
      "present in the repository, which this registry has no way to detect yet.",
  },
  'no-implied-eval': {
    reason:
      "Verified directly against oxlint 1.76.0: `number_of_rules: 1` (the rule is genuinely active) " +
      "but zero diagnostics against every canonical trigger pattern " +
      "(setTimeout/setInterval/Function/execScript with a string-literal first argument). A rule " +
      "that never fires is worse than no rule — recommending it would claim coverage of " +
      "`security.implied-eval`-shaped bugs this registry does not actually provide. Dropped from " +
      "the M0 hand-written registry for the same reason; recorded in " +
      "docs/superpowers/specs/2026-07-31-m0-followups.md, \"Test gaps worth closing\". Scoped to " +
      "the bare `eslint`-scope rule specifically — `typescript/no-implied-eval` is a separate, " +
      "type-aware rule (excluded from `recommended` on that basis alone regardless of this entry).",
  },
}
