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

/**
 * The same idea for engines whose entries are hand-written rather than generated, keyed by
 * `ruleRefKey` (`<engine>/<engineRuleId>`) because those ids are not unique across engines the way
 * oxlint's are within it.
 *
 * It has to be a second table rather than more rows in `RULE_EXCLUSIONS`: that one is consumed only
 * by the oxlint registry generator, keyed by bare rule id, and an `actionlint` row there would either
 * be ignored or — worse, for a name like `id` or `matrix` — silently exclude an oxlint rule that
 * happens to share it.
 *
 * Unlike `RULE_EXCLUSIONS`, which the generator applies, this table is *checked* rather than applied:
 * a manual engine's rules reach `recommended` only by being listed in `config/presets.ts`, so the
 * exclusion is enforced by `entries.test.ts` asserting that no concept named here appears in that
 * preset. That keeps the reason and the effect from drifting apart — which is exactly what happened
 * to the two `slop.*` exclusions, whose reasons live in a comment in `presets.ts` with nothing
 * checking them. Backfilling those (and knip's) into this table is a follow-up.
 */
export const MANUAL_RULE_EXCLUSIONS: Readonly<Record<string, RuleExclusion>> = {
  'actionlint/runner-label': {
    reason:
      'The largest single finding class in the whole corpus measurement and the least useful: **308 of ' +
      '447 findings (69%), zero true positives**, across 7 of 17 repositories. Every one is a runner ' +
      'label that is legitimate and that actionlint has no way to know about — depot.dev (`depot-*`, 9 ' +
      'distinct labels), namespace.so (`namespace-profile-*`), grafana\'s and vercel\'s own larger and ' +
      'self-hosted runners, and 18 findings for `ubuntu-26.04`/`ubuntu-26.04-arm`, which are *real ' +
      'GitHub-hosted runners* that actionlint 1.7.12 predates. cpython\'s own committed ' +
      '`.github/actionlint.yaml` declares those two with a comment citing the upstream pull request ' +
      'that adds them, which is the affected project reaching the same conclusion independently.\n\n' +
      'actionlint\'s answer is `self-hosted-runner.labels` in `.github/actionlint.yaml`. That is not ' +
      'available to us: spec §13 is explicit that users never see or maintain engine-native config ' +
      'files, and reading theirs would only half-solve it anyway — honouring each repository\'s own ' +
      'config removes 191 of the 308 and leaves 117 in the five repositories that ship no config.\n\n' +
      '**The rule itself works** — an authored `runs-on: ubuntu-lastest` is caught, proved by fixture ' +
      '— so the problem is the allowlist, not the check. Revisit when slop-gate has a first-class way ' +
      'to declare a repository\'s own runner labels in `slop-gate.config.ts`, which this adapter would ' +
      'then translate into its ephemeral actionlint config. At that point the rule catches a real ' +
      'class of typo that nothing else does.',
  },
  'actionlint/action': {
    reason:
      'Two independent reasons, and the second is the disqualifying one.\n\n' +
      '**It is nondeterministic.** Across ten identical runs over the same 403 files, this rule — and ' +
      'only this rule — produced a different set of findings each time (442–447 findings per run; 441 ' +
      'stable, 6 not, all of them `could not parse action metadata`). The mechanism is exact: ' +
      '`LocalActionsCache.FindMetadata` (`action_metadata.go:255-281`) reports a metadata parse failure ' +
      'only on the *uncached* lookup and writes `nil` on failure, so whichever reference reaches a ' +
      'broken local action first reports it and every later one silently gets a cache hit. actionlint ' +
      'lints files concurrently (`linter.go:347`, an `errgroup` sharing one cache) **and iterates a ' +
      'workflow\'s jobs over `Jobs map[string]*Job`, whose order Go randomises** — so this is unstable ' +
      'even for a single file in a single process: ten runs over one file put the same finding on line ' +
      '99, 71, 316 and 359. Per-file invocation does not fix it. Position-based fingerprints (§10.1) ' +
      'would therefore thrash on every run, taking the cache and the baseline with them.\n\n' +
      '**And it is imprecise.** 10 findings, 1 true positive (a Docker action whose `runs.image` names ' +
      'a file not called `Dockerfile`). The other 9 are all `could not parse action metadata in "…": ' +
      'unexpected key "type" for definition of input "…"` — a `type:` key under a composite action\'s ' +
      '`inputs`, which is genuinely not in GitHub\'s action metadata schema and which GitHub genuinely ' +
      'ignores at run time: the actions concerned are bun\'s `setup-bun` and oxc\'s, used by nearly ' +
      'every workflow in those repositories. Correct-but-inert, and the message overstates it — the ' +
      'real consequence is that actionlint then stops checking that action\'s inputs at all.\n\n' +
      'Excluded as a whole rule rather than by message pattern: the nondeterminism argues against the ' +
      'rule, not against one of its messages, and the one true positive is not worth an unstable ' +
      'fingerprint.',
  },
  'actionlint/syntax-check': {
    reason:
      '9 findings, 2 true positives, 7 false — and all 7 are the same failure mode, which is the reason ' +
      'to exclude rather than the count. actionlint validates workflows against a schema compiled into ' +
      'the binary, so **every GitHub Actions feature that ships after a release reads as an unexpected ' +
      'key until the next one**. The 7 are exactly that: 5 for parallel/background steps ' +
      '(`background: true` and `wait:`, [shipped 2026-06-25](https://github.blog/changelog/2026-06-25-actions-steps-can-now-be-run-in-parallel/)) ' +
      'and 2 for `concurrency.queue: max` ([shipped 2026-05-07](https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues/)). ' +
      'Both were confirmed against GitHub\'s own changelog rather than inferred.\n\n' +
      'This recurs by construction, and because we pin the binary the staleness is **our** choice on ' +
      'the user\'s behalf: someone whose `PATH` already holds a newer actionlint gets fewer false ' +
      'positives than someone we downloaded for. That is an argument for tracking upstream releases ' +
      'actively (recorded in the M0 follow-ups), and against putting a rule whose false-positive rate ' +
      'is a function of our own release cadence into `recommended`.\n\n' +
      'The 2 true positives — `secrets:` nested under `workflow_dispatch`, where only `workflow_call` ' +
      'takes it, and a YAML sequence passed to an action input that must be a string — are real but do ' +
      'not carry the rule. Separately: this entry claims only `config.workflow-syntax`. actionlint ' +
      'reports YAML parse errors and duplicate keys under the same `kind`, and the adapter drops both ' +
      'classes because the `schema` engine owns them for `github-workflow`.',
  },
}

export const RULE_EXCLUSIONS: Readonly<Record<string, RuleExclusion>> = {
  'vitest/valid-expect': {
    reason:
      "A narrow oxlint defect, reproduced directly against 1.76.0 and stated in terms of the `code` " +
      "field actually observed rather than the plugin scope it was found under. `vitest/valid-expect` " +
      "reports \"Expect takes at most 1 argument\" whenever `expect`'s second argument is anything " +
      "other than a *string literal*: `expect(x, 'msg')` is accepted, `expect(x, key(x))` is not. Both " +
      "are legal — vitest declares `<T>(actual: T, message?: string): Assertion<T>` " +
      "(`@vitest/expect` 3.2.7, `dist/index.d.ts:165-166`), and a computed string is still a string. " +
      "Measured on this repository: 27 diagnostics, all `code: \"vitest(valid-expect)\"`, all the " +
      "computed-argument form, 27/27 false positives. `jest/valid-expect` is deliberately NOT excluded " +
      "— it reports the same message on the same code, and there it is correct, because jest's " +
      "`expect` genuinely takes one argument. Verified by running each rule alone: over this " +
      "repository jest reports 37 and vitest 27, and the 10 it does not report are exactly the " +
      "string-literal calls the vitest rule correctly allows.",
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
