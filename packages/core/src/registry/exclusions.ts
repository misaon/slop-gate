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
 *
 * **What no longer belongs here: an exclusion whose reason is "it depends on the framework".** That
 * is now a framework profile (spec §23, `packages/core/src/frameworks/profiles.ts`), which can turn a
 * rule off in the repositories where it is wrong and leave it on everywhere else. Two exclusions were
 * removed on exactly that basis — `typescript/no-extraneous-class` (now the `nestjs` profile) and the
 * twenty-four jest/vitest dual-firing rules (now the `test-framework` profile, whose reason text this
 * file used to carry verbatim as the unblocking condition). What stays here is the other kind: a rule
 * that is wrong regardless of what the repository is built with.
 */

export const RULE_EXCLUSIONS: Readonly<Record<string, RuleExclusion>> = {
  'vitest/valid-expect': {
    reason:
      "An oxlint bug rather than a judgement call, and the only exclusion here whose root cause is " +
      "quotable from a type declaration. Measured on this repository the moment framework detection " +
      "made the vitest scope electable: 27 findings, 27 false positives, every one the identical " +
      "message \"Expect takes at most 1 argument\" on `expect(value, message)` — which is vitest's own " +
      "documented two-argument form, declared as `<T>(actual: T, message?: string): Assertion<T>` in " +
      "`@vitest/expect` 3.2.7's `ExpectStatic`. oxlint's vitest plugin is applying *jest's* arity rule " +
      "to vitest, so the rule is wrong about the very framework it is named after. Scoped to the " +
      "vitest side deliberately: `jest/valid-expect` is correct, because jest genuinely has no such " +
      "overload, and in a vitest repository the `test-framework` profile disables it anyway.",
  },
  'jest/no-conditional-expect': {
    reason:
      "Measured on this repository: 8 findings, 8 false positives, all the same table-driven shape — " +
      "`if (entry.fixKind === 'none') expect(a).toEqual([]) else expect(b).toBeGreaterThan(0)` in the " +
      "registry's invariant tests, where *every* branch asserts. The defect this rule exists for is an " +
      "assertion that may never run (the `try { } catch { expect() }` shape), and a total if/else over " +
      "a loop variable structurally cannot be that: there is no path through it that asserts nothing. " +
      "Excluded for both scopes because the two plugins implement identical semantics here, so the " +
      "measurement transfers.",
  },
  'vitest/no-conditional-expect': {
    reason: "Same measurement and same reasoning as jest/no-conditional-expect above; identical rule, two plugins.",
  },
  'jest/require-to-throw-message': {
    reason:
      "Measured on this repository: 4 findings, 4 false positives, across three files, all the same " +
      "idiom — `await expect(loadConfig(dir)).rejects.toThrow()`, asserting *that* something rejects " +
      "where the test's own title already says what and why. Demanding a message string there adds a " +
      "second, weaker copy of the test name inside the assertion. A style preference oxlint files " +
      "under `correctness`, and the category is not the arbiter of whether a finding belongs in " +
      "`recommended` — the same argument recorded for no-underscore-dangle below.",
  },
  'vitest/require-to-throw-message': {
    reason: "Same measurement and same reasoning as jest/require-to-throw-message above; identical rule, two plugins.",
  },
  'import/no-unassigned-import': {
    reason:
      "Measured across both repositories this generator was validated against: 5 findings total " +
      "(1 on slop-gate itself, 4 on the srvc-bat playground), every single one a deliberate, " +
      "canonical side-effect-only import — `import 'reflect-metadata'` (a jest setup file), " +
      "`import 'dotenv/config'`, `import './custom.css'` (a VitePress theme), and `import '@/tracing'` " +
      "(app startup instrumentation), plus this repo's own CLI entry shim (`import '../dist/main.js'`). " +
      "These are the textbook use case side-effect imports exist for, not an accidentally-unused " +
      "import — 5/5 (100%) false positives across two independently-chosen, unrelated codebases.",
  },
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
  'no-underscore-dangle': {
    reason:
      "Measured against the srvc-bat playground: 5 of its 6 total `recommended` findings are this " +
      "rule, every one flagging the same identifier (`request_`) at its point of declaration, " +
      "repeated across one file (test/test-runner.ts:133,151,163,175,187) — confirmed deliberate, " +
      "not careless: that file imports `* as request` from `supertest` (line 15), so every method-" +
      "local `request_` is systematically avoiding a collision with that already-imported name, the " +
      "same convention applied consistently five times over. Not a defect. Same class as " +
      "typescript/no-extraneous-class above: oxlint files it under `suspicious`, but the category is " +
      "not the arbiter of whether it belongs in `recommended` — whether a finding represents " +
      "something a competent developer would actually want to change is, and a trailing underscore " +
      "adopted on purpose to dodge shadowing an outer binding does not. A quality gate that argues " +
      "with a codebase's own naming convention on every run teaches its user to ignore it.",
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
