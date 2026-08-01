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

const JEST_VITEST_DUAL_FIRING_REASON =
  "Measured on this repository (vitest-only, no jest dependency at all): the jest-scope and " +
  "vitest-scope versions of this rule both fired on the identical file and line for every single " +
  "occurrence — oxlint's jest/vitest plugins evidently pattern-match on the generic " +
  "describe/it/expect call shape rather than checking which package it was imported from, so " +
  "electing both (which disambiguation makes possible — see the registry-generation report) " +
  "means every real finding is reported twice under two different concept ids. Excluding only one " +
  "side would silently drop coverage for whichever framework a project actually uses (the two " +
  "plugins' rule sets are near-identical, one-for-one), so both are excluded until framework " +
  "detection can elect the one that is actually installed — the same 'registry has no notion of " +
  "framework awareness' gap recorded for typescript/no-extraneous-class below, applied to a second, " +
  "independently measured case rather than assumed to generalise from the first."

/** The 12 concepts oxlint's `jest` and `vitest` plugins both claim, `correctness`/`suspicious`
 *  category, non-type-aware — i.e. the ones this generator's `recommended` policy would otherwise
 *  enable for both scopes at once. See `JEST_VITEST_DUAL_FIRING_REASON`. */
const JEST_VITEST_SHARED_RULE_VALUES = [
  'expect-expect',
  'no-commented-out-tests',
  'no-conditional-expect',
  'no-disabled-tests',
  'no-focused-tests',
  'no-standalone-expect',
  'prefer-snapshot-hint',
  'require-to-throw-message',
  'valid-describe-callback',
  'valid-expect',
  'valid-expect-in-promise',
  'valid-title',
] as const

const jestVitestExclusions = Object.fromEntries(
  JEST_VITEST_SHARED_RULE_VALUES.flatMap((value) => [
    [`jest/${value}`, { reason: JEST_VITEST_DUAL_FIRING_REASON }],
    [`vitest/${value}`, { reason: JEST_VITEST_DUAL_FIRING_REASON }],
  ]),
) as Record<string, RuleExclusion>

export const RULE_EXCLUSIONS: Readonly<Record<string, RuleExclusion>> = {
  ...jestVitestExclusions,
  'unicorn/no-array-sort': {
    reason:
      "Measured on this repository: every one of 21 occurrences — not a sample, all of them — is " +
      "`[...x].sort(...)`, `x.map(...).sort(...)` or `Object.entries(x).sort(...)`: sorting an array " +
      "just derived from a spread, map or filter, which nothing else holds a reference to. That is " +
      "this codebase's standard idiom for deterministic ordering (`compareStrings`-based sorts appear " +
      "this way throughout, including in this generator's own source), and the rule cannot tell that " +
      "pattern apart from mutating a caller-owned array in place, which is the real bug it exists to " +
      "catch. 21/21 (100%) false positives here specifically because of how this codebase happens to " +
      "call `.sort()`, not because the rule is wrong in general — the same category of gap as " +
      "typescript/no-extraneous-class below, applied to a different rule.",
  },
  'unicorn/no-array-reverse': {
    reason:
      "Same measurement and same reasoning as unicorn/no-array-sort immediately above (the two rules " +
      "share a rationale in oxlint itself): all 3 occurrences on this repository reverse an array " +
      "just produced by a spread, with nothing else aliasing it.",
  },
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
