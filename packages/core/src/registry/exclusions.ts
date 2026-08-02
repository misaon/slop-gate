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
 *
 * ---
 *
 * **Two things anyone measuring an oxlint rule needs before they start, both learned the expensive
 * way (see the `feat/rule-options` work and its follow-ups).**
 *
 * **1. Count `"code": "<rule>"`, never `"message"`.** `--format json` puts oxlint's own `TS(…)` parse
 * diagnostics in the same `diagnostics` array as rule findings, and they are emitted whatever the
 * `rules` map says. Over any corpus containing deliberately-malformed input — prettier's
 * `tests/format` is 1,171 unparseable files on its own — counting messages reports the same inflated
 * total for every configuration you try, which reads exactly like a rule whose options do nothing.
 * Measured concretely: `eqeqeq` with `smart` counted 1249 by message and **84** by code.
 *
 * **2. Check an exclusion's own words against the engine's option schema before trusting it.** An
 * exclusion that describes a shape — "sorting an array just derived from a spread" — may be naming
 * an option the engine already offers, in which case the rule is promotable and nobody noticed.
 * `oxlint -c <config with {"__probe":1}>` prints the accepted field names for *most* rules, but read
 * the caution at the end of this comment before trusting a silent answer.
 *
 * That sweep has been done once, across every oxlint entry in `RULE_EXCLUSIONS`. **Five of the six
 * are not rescued and the sixth is an open question, not a promotion.** Recorded per entry below so
 * it is not repeated:
 *
 * - `unicorn/no-array-sort` (95 → 50), `unicorn/no-array-reverse` (4 → 4), `no-underscore-dangle`
 *   (135,767 → 5,255) and `import/no-unassigned-import` (3,000 → 1,662) each have a
 *   relevant-sounding option; none is rescued by it.
 * - `no-implied-eval` takes none — oxlint says so in as many words (*this rule does not accept
 *   configuration options*) — and never fires anyway, which is its actual exclusion.
 * - **`vitest/valid-expect` is the live one**, and the reason it is not simply promoted here is a
 *   split measurement worth reading before anyone acts on it. See its entry.
 *
 * The one rule the sweep did rescue outright was never in this table — `eqeqeq`, promoted in
 * `config/rule-options.ts`.
 *
 * A caution the sixth case earns: **`oxlint -c` with a probe key does not reliably tell you whether
 * a rule has options.** `eqeqeq`, `no-empty-object-type` and `no-implied-eval` reject an unknown key
 * by name; `vitest/valid-expect` and `ban-ts-comment` accept one in silence while still honouring
 * their real options. Silence means "unknown", not "no options" — check the upstream rule's
 * documented option names too, or a rule with a live option reads as having none.
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
  'deps-security/missing-lockfile-entry': {
    reason:
      'The only rule in this engine with a genuine false-positive mode, and it is structural rather ' +
      'than measurable away: a manifest entry absent from the lockfile has two causes — the package ' +
      'does not exist on the registry, or the lockfile predates the edit that added it — and nothing ' +
      'available without the network separates them. A lockfile one commit out of date would report ' +
      'every newly added dependency as possibly imaginary. It stays available by concept because ' +
      "knip's answer for the same shape is worse rather than merely absent (`deps.unused-dependency`, " +
      '"nothing imports this", when the truth is "this cannot be installed"), and because the one case ' +
      'that reaches a committed lockfile at all — an unresolvable `optionalDependencies` entry, which ' +
      'npm and pnpm both install past with exit 0 — is genuinely silent everywhere else.',
  },
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

  // `biome-css` (packages/engine-biome-css). Nine of its twenty-seven registry entries, and they
  // divide into three kinds that this file deliberately does not blur together: house style that was
  // never a defect, a right rule defeated by the wrong context, and a right rule whose precision is
  // simply too low. The measurement behind all of them is the same 1729-file corpus documented on
  // `BIOME_CSS_RULE_ENTRIES` in entries.manual.ts.
  'biome-css/noHexColors': {
    reason:
      '**House style, not a defect — the largest single class in the whole measurement.** 5815 ' +
      'findings across 376 of 1729 production stylesheets, and not one of them a bug: the rule\'s ' +
      'entire content is a preference for `hsl()`/`oklch()` over `#rrggbb`. It fires in 9 of 10 ' +
      'corpus repositories at 0.7 to 103 findings per thousand lines, so there is no repository shape ' +
      'that escapes it.\n\n' +
      'Together with the three entries below this is 11,525 of the engine\'s 12,125 findings and ' +
      'zero of its ~27 real defects. A first `sgate check` on a CSS codebase emitting eleven thousand ' +
      'findings with no defect content does not teach a user that their stylesheets are untidy; it ' +
      'teaches them that this tool is noise, permanently, and takes the eighteen rules that *are* ' +
      'defects down with it.\n\n' +
      '**Not a verdict on the rule.** A project that has adopted a colour-model convention and wants ' +
      'it enforced enables `style.css-hex-color` and gets exactly this. That is what the full entry ' +
      'in entries.manual.ts is for. What is being rejected is only the claim that it belongs in a ' +
      'default quality gate.',
  },
  'biome-css/noDescendingSpecificity': {
    reason:
      '2206 findings in 435 files — **a quarter of every stylesheet measured** — in 8 of 10 ' +
      'repositories at 2 to 19 per thousand lines. Twelve were read across eight repositories and ' +
      'every one was ordinary, correct CSS: `li, dt` in django\'s admin, `.timelist a:active` in its ' +
      'widgets, `ul.messagelist li` in its responsive sheet.\n\n' +
      'The rule asks that selectors appear in non-descending specificity order so that source order ' +
      'decides the cascade. Real stylesheets are grouped by component, and that is not a defect — it ' +
      'is how they are maintainable. Same class as `noHexColors`: available by concept for a codebase ' +
      'that has genuinely committed to specificity ordering, out of `recommended` for everyone else.\n\n' +
      '**The sample was twelve, not 2206**, and the decision does not rest on the difference: at ten ' +
      'findings per thousand lines the rule is excluded whether its true-positive rate is 0% or 2%. ' +
      'Read the count as the reason, not the sample as precision.',
  },
  'biome-css/useBaseline': {
    reason:
      '2002 findings in 467 files. **What this rule reports is a property of the project\'s browser ' +
      'targets, which slop-gate does not know** — so on any given repository it is either entirely ' +
      'right or entirely irrelevant, and nothing in the run can tell which. The corpus makes the ' +
      'point: 307 findings against Visual Studio Code, an application that ships its own Chromium.\n\n' +
      'By volume: `light-dark()` 813, `::selection` 385, `user-select` 259, `mask-image` 132. Those ' +
      'are intentional modern CSS, and `::selection` and `user-select` are universally supported in ' +
      'practice whatever Baseline\'s 30-month window says.\n\n' +
      'Revisit if slop-gate ever grows a first-class way to declare a repository\'s browser support ' +
      'floor — a browserslist-shaped input the adapter could translate into this rule\'s own options. ' +
      'At that point it becomes a genuine correctness check rather than a policy nobody configured.',
  },
  'biome-css/noImportantStyles': {
    reason:
      '1502 findings in 323 files, 1071 of them Visual Studio Code alone. `!important` overused makes ' +
      'a cascade impossible to reason about; used deliberately it is how a theming layer wins against ' +
      'a component library it does not control, which is exactly what a 1071-finding editor is doing. ' +
      'Distinguishing the two needs to know the codebase\'s conventions, and a linter that does not ' +
      'is just counting a keyword.\n\n' +
      'The fourth of the four house-style rules, excluded on the same argument, available by concept ' +
      'as `complexity.css-important` for a team that has decided it wants no `!important` at all.',
  },

  // Right rule, wrong context. Neither of the next two is excluded on its own merits — both are
  // correct checks defeated by a preprocessor standing between the `.css` file and the browser — so
  // the reason is written as the condition that would put them back, not as a judgement. §23
  // framework awareness is where this properly belongs.
  'biome-css/noUnknownAtRules': {
    reason:
      '**Revisit trigger, not a verdict.** 26 findings, 0 true positives — and the rule is right in ' +
      'every one of them about what plain CSS defines. 25 are `@extend` (zulip, compiled by PostCSS) ' +
      'and 1 is `@tailwind` (Tailwind v3). Both are valid input to their own build step and never ' +
      'reach a browser as written, so this measures a corpus containing two preprocessed projects, ' +
      'not a check that is wrong.\n\n' +
      '**The condition that puts it back in `recommended`: a framework profile that detects a CSS ' +
      'preprocessor and stands the rule down there.** The signals are concrete and already ' +
      'inventory-visible — a `postcss.config.*`, a `postcss`/`postcss-preset-*` dependency, a ' +
      '`tailwindcss` dependency, or `@extend`/`@tailwind`/`@apply` in the file itself. In a repository ' +
      'that genuinely ships plain CSS this rule catches a misspelled at-rule, which nothing else does, ' +
      'and CSS silently discards.\n\n' +
      'Note what would go wrong if this were recorded as "inaccurate rule" instead: a future reader ' +
      'comparing it against `noUnknownUnit` — which is genuinely, reproducibly wrong about `1x` — ' +
      'would have no way to tell the two apart, and would either fix neither or delete both.',
  },
  'biome-css/noUnknownFunction': {
    reason:
      '**Revisit trigger, on the identical condition as `noUnknownAtRules` above.** 3 findings, 0 ' +
      'true positives, all three the same function in one file: Mantine\'s `alpha()`, provided by ' +
      '`postcss-preset-mantine` and compiled away before a browser sees it. The rule is correct that ' +
      'CSS defines no `alpha()`.\n\n' +
      'Stands down under the same preprocessor detection, and returns to `recommended` with it. On a ' +
      'plain-CSS repository an unknown function means the whole declaration is dropped at parse time, ' +
      'which is a real and completely invisible failure.',
  },

  // Right rule, precision too low — measured on its own merits, unlike the two above.
  'biome-css/useGenericFontNames': {
    reason:
      '16 findings, 1 true positive. **15 are icon fonts** — `codicon` in Visual Studio Code, ' +
      '`PrismTreeview` in Prism — and for those the rule\'s remediation is actively harmful: adding ' +
      '`sans-serif` after `codicon` means a reader missing the icon font sees arbitrary letters where ' +
      'icons should be, instead of the browser default they would have got anyway.\n\n' +
      'The single true positive (`font-family: courier` in pdf.js\'s debugger overlay) is the rule ' +
      'working exactly as documented, which is why the entry stays available by concept. It is the ' +
      'ratio that keeps it out of `recommended`, and the ratio is not obviously fixable: Biome cannot ' +
      'tell an icon font from a text font, and neither can we.',
  },
  'biome-css/noDuplicateSelectors': {
    reason:
      '178 findings in 78 files; ten were read across five repositories and none was a defect. ' +
      'Declaring a selector twice in one stylesheet is what grouping declarations by concern looks ' +
      'like — django\'s admin re-opens `#content-related` under a `/* SIDEBAR */` heading, ' +
      'highlight.js groups `.hljs-selector-tag` with the other selectors of its colour. The rule ' +
      'cannot distinguish that from genuine redundancy, and the idiomatic case is far commoner.\n\n' +
      'Also `nursery` upstream, which is Biome\'s own statement that it is not ready to be a default.',
  },
  'biome-css/noEmptyBlock': {
    reason:
      '181 findings — and **176 of them are one repository\'s documented convention**: highlight.js ' +
      'ships `.hljs-property {}` in 176 base16 theme files as a deliberate placeholder marking a token ' +
      'class the theme leaves unstyled. Outside that convention the rule is nearly silent: 5 findings ' +
      'in the other 1553 files.\n\n' +
      'Excluded not because it is noisy in general — it is not — but because an empty declaration ' +
      'block costs nothing at run time and removing one is never a fix for anything. It is tidiness ' +
      'with a plausible intentional reading, which is the definition of opt-in here. The single-repo ' +
      'concentration is disclosed because it would otherwise look like a much noisier rule than it is.',
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
      "string-literal calls the vitest rule correctly allows.\n\n" +
      "**The option sweep found a live candidate here and deliberately stopped short of promoting " +
      "it, because the measurement splits.** The rule accepts `maxArgs`, and `maxArgs: 2` is not a " +
      "workaround but the literally correct statement of vitest's signature — the one this reason " +
      "already quotes, `<T>(actual: T, message?: string)`. It removes exactly the defect described " +
      "above and nothing else: verified against a fixture carrying every other thing the rule " +
      "checks, `expect` with no matcher, `expect()` with no argument and an un-awaited async " +
      "matcher all still fire, and `expect(1, 2, 3)` is still caught as genuinely too many.\n\n" +
      "Then the numbers diverge. **On this repository: 48 findings on defaults, 0 with " +
      "`maxArgs: 2`** (up from the 27 above; the repository grew, the ratio did not). **On the " +
      "32,035-file third-party corpus: 18 either way** — the option changes nothing, because nobody " +
      "else passes a computed second argument to `expect`. So the false-positive class it removes is " +
      "close to a slop-gate house idiom, and a promotion cannot rest on 'it fixes our repository'.\n\n" +
      "What the promotion needs, and what this sweep did not do: audit those 18 corpus findings " +
      "(nest 10, hono 4, vue core 2, prettier 2) to establish the rule has defect content on code " +
      "that is not ours. If they are real, this comes out of the table and goes into " +
      "`config/rule-options.ts` with `['error', { maxArgs: 2 }]`. Note the extra care that needs: " +
      "the rule is `correctness`-category, so removing the exclusion puts it into " +
      "`GENERATED_RECOMMENDED_RULES` at its *default* configuration and the optioned table has to " +
      "override it afterwards — which means a later deletion of that row silently restores the 48. " +
      "`eqeqeq` has no such trap, because nothing else puts it in `recommended`.",
  },
  'import/no-unassigned-import': {
    reason:
      "Measured across both repositories this generator was validated against: 5 findings total " +
      "(1 on slop-gate itself, 4 on the srvc-bat playground), every single one a deliberate, " +
      "canonical side-effect-only import — `import 'reflect-metadata'` (a jest setup file), " +
      "`import 'dotenv/config'`, `import './custom.css'` (a VitePress theme), and `import '@/tracing'` " +
      "(app startup instrumentation), plus this repo's own CLI entry shim (`import '../dist/main.js'`). " +
      "These are the textbook use case side-effect imports exist for, not an accidentally-unused " +
      "import — 5/5 (100%) false positives across two independently-chosen, unrelated codebases.\n\n" +
      "Swept for a rescuing option. It has exactly one, `allow`, taking globs — and the sweep is why " +
      "this entry now carries a third-party number it never had: **3,000 findings over the " +
      "32,035-file corpus**, against the 5 this reason was originally written from. A generous " +
      "generic allowlist (`**/*.css`, `**/*.scss`, `**/*.less`, `**/*.sass`, `reflect-metadata`, " +
      "`dotenv/config`, `**/polyfills*`) brings that to **1,662**, which is still two orders of " +
      "magnitude past anything in `recommended`. The residue is what an allowlist cannot generalise " +
      "over — application-local startup imports like `@/tracing` and this repository's own " +
      "`packages/cli/bin/sgate.js` shim, which are legitimate and unguessable. Same shape as " +
      "`biome-css/useBaseline`: the option exists, and the value it would need is a fact about the " +
      "project that slop-gate does not know.",
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
      "typescript/no-extraneous-class below, applied to a different rule.\n\n" +
      "**Re-checked once per-rule options could reach an adapter, because this exclusion's own " +
      "wording — \"sorting an array just derived from a spread\" — names an option oxlint offers: " +
      "`allowAfterSpread`. It does not rescue the rule.** Measured on this repository at oxlint " +
      "1.76.0: 95 findings on defaults, **50 with `allowAfterSpread: true`** (and 50 with " +
      "`allowExpressionStatement` added, which changes nothing here). The option covers the literal " +
      "`[...x].sort()` form only, and the residue is the other half of the same idiom — " +
      "`x.map(...).sort()`, `x.filter(...).sort()`, `Object.entries(x).sort()` — which the rule " +
      "cannot tell from mutating a caller-owned array either. Recorded so the next reader does not " +
      "repeat the measurement, and as the counter-example to `pedantic.eqeqeq`, where the same " +
      "question got the opposite answer (see config/rule-options.ts).",
  },
  'unicorn/no-array-reverse': {
    reason:
      "Same measurement and same reasoning as unicorn/no-array-sort immediately above (the two rules " +
      "share a rationale in oxlint itself): all 3 occurrences on this repository reverse an array " +
      "just produced by a spread, with nothing else aliasing it.\n\n" +
      "Swept for an option that would rescue it, like its sibling. It has one — " +
      "`allowExpressionStatement` — and it changes nothing here: 4 findings on this repository with " +
      "it and 4 without. Notably it does **not** have `allowAfterSpread`, which is the option that " +
      "would have been relevant, so this rule has less recourse than the one above rather than more.",
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
      "with a codebase's own naming convention on every run teaches its user to ignore it.\n\n" +
      "**Swept for a rescuing option and it is the strongest exclusion in this table, not the " +
      "weakest.** It has ten (`allow`, `allowAfterThis`, `allowFunctionParams`, " +
      "`allowInObjectDestructuring`, and so on), and turning on every one that could plausibly apply " +
      "takes it from **135,767 findings to 5,255** over the 32,035-file third-party corpus — a 96% " +
      "reduction that still leaves more findings than every rule in `recommended` produces combined. " +
      "The default figure is the largest of any rule ever measured for this registry. None of the " +
      "options addresses the case this exclusion is actually about either: `allow` is an exact-name " +
      "list, so exempting a *trailing* underscore adopted to dodge a shadowed import means naming " +
      "each identifier, which is a per-repository decision and not a preset's to make.",
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
