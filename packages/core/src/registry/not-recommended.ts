export type NotRecommended = {
  readonly reason: string
}

export const NOT_RECOMMENDED_UNCATALOGUED: Readonly<Record<string, NotRecommended>> = {
  'knip/files': {
    reason:
      'Promoted into `recommended` once, on a re-measurement taken against the NestJS-shaped fixture ' +
      'after §23 framework awareness landed — which is to say, against the very cases the profiles ' +
      'had just been written to fix. A 145k-line React monorepo (28 workspace packages, 1,251 ' +
      'TypeScript sources) took it straight back out: **105 findings**, of which at least 98 are a ' +
      'file that is loaded but not imported.\n\n' +
      '**The composition is the argument, not the count.** Those 98 decompose into six unrelated ' +
      'conventions: 60 Cucumber step definitions and page objects globbed by a `cucumber` config, 17 ' +
      "configs for an in-house licence checker, 11 `.mdx` content files, 5 `@hey-api/openapi-ts` " +
      'configs, 3 `lighthouserc.js`, and a `public/serviceworker.js` that is served rather than ' +
      'imported. No predicate covers that set. The nearest candidate — "a file referenced only by ' +
      'some tool\'s own config" — is not decidable without understanding each tool\'s config format, ' +
      'which is executing repository code by another name (spec §23.5 forbids it). So this is not a ' +
      'gap that four more framework profiles close; it is what the concept *is* on a repository that ' +
      'uses more tools than knip has plugins for, and knip ships around 100 of those.\n\n' +
      'The concept stays available and unchanged — `\'dead-code.unused-file\': \'warn\'` in a config ' +
      'restores it, and a repository whose conventions knip does cover gets a genuinely useful check. ' +
      'What it must not be is the *default*, where its first impression is 105 findings nobody can ' +
      'act on. **This does cost real coverage**: a genuinely dead file now goes unreported by default, ' +
      "and 7 of the 105 above (five `src/v*/index.ts` package entry points among them) could not be " +
      'explained away and may well have been true positives.',
  },
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
      '99, 71, 316 and 359. Per-file invocation does not fix it.\n\n' +
      '**And no fingerprint scheme rescues it, which is worth stating precisely because the obvious ' +
      'summary — "fingerprints are position-based, so they thrash" — is not what §10.1 does.** A ' +
      'fingerprint hashes no line or column number at all; it hashes the *text* of the line the finding ' +
      'lands on. So a column moving within a line is free, and the emission order of a file\'s findings ' +
      'is free too (`FingerprintInput.occurrenceIndex`). What is not free is the same finding being ' +
      'attributed to a different line, because that line reads differently — and a finding that is ' +
      'simply absent from the next run has no fingerprint to stabilise in the first place. Both of ' +
      'those are what this rule does, so a baseline over it would churn no matter how the hash is ' +
      'computed. Keeping it out of `recommended` is the fix; there is no other one.\n\n' +
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
      'in entries.uncatalogued.ts is for. What is being rejected is only the claim that it belongs in a ' +
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

export const NOT_RECOMMENDED_GENERATED: Readonly<Record<string, NotRecommended>> = {
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
  'hadolint/DL3008': {
    reason:
      '**132 findings, zero true positives** — the largest single class in the Dockerfile corpus. ' +
      '"Pin versions in apt get install" asks for `apt-get install pkg=1.2.3`, which Debian and Ubuntu ' +
      'actively defeat: their archives keep only the current version of a package, so a pinned version ' +
      'stops resolving the moment a security update lands and the build breaks. That is why not one of ' +
      'the 84 files that trigger it complies. `DL3018` (apk, 49) and `DL3013` (pip, 10) are excluded on ' +
      'the identical argument, and `DL3062` (go, 7) is kept out of `recommended` for the weaker version ' +
      'of it. What would bring it back: scoping to a base image whose distribution offers a stable ' +
      'version-pinned archive, which is a §23 framework-awareness question rather than a rule fix.',
  },
  'hadolint/DL3018': {
    reason:
      '**49 findings, zero true positives.** The apk half of `DL3008` above — same argument, same ' +
      'outcome: Alpine\'s repositories do not retain old package versions either.',
  },
  'hadolint/DL3013': {
    reason: '**10 findings, zero true positives.** The pip half of `DL3008` above.',
  },
  'hadolint/DL3059': {
    reason:
      '**84 findings, zero true positives.** "Multiple consecutive `RUN` instructions. Consider ' +
      'consolidation." A layer-count preference that BuildKit made obsolete: separate `RUN` steps are ' +
      'frequently deliberate, because each is cached independently and consolidating them means one ' +
      'changed dependency re-runs the whole chain. Nothing about a consecutive `RUN` is incorrect.',
  },
  'hadolint/DL3020': {
    reason:
      '**51 findings, zero true positives**, and `error` severity, which is most of why hadolint\'s own ' +
      'severity cannot be mapped onto ours. "Use COPY instead of ADD for files and folders" is a ' +
      'clarity preference: for a local file `ADD` behaves exactly as `COPY` except that it ' +
      'auto-extracts tar archives, and none of the 51 was a tarball. Worth noting the rule is otherwise ' +
      'well built — it correctly stays silent on `ADD <url>`, which is a legitimate use.',
  },
  'hadolint/DL3015': {
    reason:
      '**45 findings, zero true positives.** `--no-install-recommends` is an image-size optimisation, ' +
      'and omitting it is sometimes required — several corpus images depend on a recommended package ' +
      'arriving implicitly. Not a defect in any of the 45.',
  },
  'hadolint/DL3003': {
    reason:
      '**39 findings, zero true positives.** "Use WORKDIR to switch to a directory", fired on ' +
      '`RUN cd x && …`. A `cd` inside a single `RUN` is scoped to that one shell invocation and is ' +
      'correct; `WORKDIR` changes the directory for every later instruction, which is a different ' +
      'thing and often not what was wanted.',
  },
  'hadolint/DL3009': {
    reason:
      '**24 findings, zero true positives.** "Delete the apt lists after installing." An image-size ' +
      'optimisation, and routinely pointless in a build stage that a later multi-stage `COPY` discards ' +
      'wholesale. Contrast `DL3042`, which ships: that one is a single flag on the same command.',
  },
  'hadolint/DL3019': {
    reason: '**10 findings, zero true positives.** The apk `--no-cache` counterpart of `DL3009` above.',
  },
  'hadolint/DL3045': {
    reason:
      '**20 findings, zero true positives.** "`COPY` to a relative destination without `WORKDIR` set." ' +
      'Docker defines the default working directory as `/`, so the copy lands where the author ' +
      'intended and the image is correct. Implicit, not wrong.',
  },
  'hadolint/DL4001': {
    reason:
      '**12 findings, zero true positives**, from 3 files. "Either use Wget or Curl but not both." A ' +
      'consistency preference with no failure behind it; the corpus cases use each where it is the ' +
      'better fit, most often `wget -qO-` for a key and `curl -fsSL` for a script.',
  },
  'hadolint/DL3047': {
    reason:
      '**7 findings, zero true positives.** `wget` without `--progress`, an output-noise preference.',
  },
  'hadolint/DL3066': {
    reason:
      '**69 findings, zero true positives, and the rule fires on the correct fix.** ' +
      '"Non-numeric user-id may not be resolvable by host system" fired on `USER nobody`, `USER node`, ' +
      '`USER appuser`, `USER airflow`, `USER trino:trino` — running as a named non-root user is the ' +
      'practice every container hardening guide asks for, and this is the rule that complains about ' +
      'it. The underlying concern is real but narrow: Kubernetes `runAsNonRoot` needs a numeric UID to ' +
      'verify the user is not root before the image runs. It does not apply to `nobody`, which is ' +
      'present in every base image in the corpus.\n\n' +
      '**Recorded at length because this rule is re-derivable from its name and will be re-proposed.** ' +
      'The Dockerfile engine was prioritised on the expectation that hadolint would catch a container ' +
      'running as root. It cannot: **a Dockerfile with no `USER` instruction at all produces zero ' +
      'hadolint findings**, because `DL3002` only fires on an explicit `USER root`. So hadolint is ' +
      'silent when a container runs as root and complains when it does not. Anyone re-enabling this ' +
      'should read that sentence twice. The genuine gap — "this image never drops privileges" — is not ' +
      'covered by any rule hadolint has, and would need an ast-grep rule or a check of our own.',
  },
  'hadolint/DL3064': {
    reason:
      '**7 of 25 true, and excluded *because* it is a security rule rather than despite it.** 28% is ' +
      'the best precision among the excluded rules here, and it is still the wrong trade: a security ' +
      'finding that is wrong three times in four teaches people to dismiss the category, which is worse ' +
      'than a rule that never fires.\n\n' +
      'The mechanism is substring matching on the *variable name*. It is right about ' +
      '`ENV PGPASSWORD=password`, `ENV MINIO_ROOT_PASSWORD="clickhouse"` and ' +
      '`ENV AWS_SECRET_ACCESS_KEY=$…`, where `ENV` really does persist the value into the image layer. ' +
      'It is wrong about `ENV TIKTOKEN_CACHE_DIR=/code/.tiktoken_cache` (matched on "TOKEN"), ' +
      '`ENV MINIO_ACCESS_KEY_FILE=access_key` (a filename), `ARG USERNAME=github`, ' +
      '`ENV MYSQL_DATABASE="testdata"`, `ENV GOPRIVATE=…`, and about bare `ARG SENTRY_AUTH_TOKEN` ' +
      'declarations that carry no value and therefore bake nothing.\n\n' +
      '**The condition that brings it back**: matching on the assigned *value* rather than the name — ' +
      'firing on `ENV X=<literal that looks like a credential>` and staying silent on a value-less ' +
      '`ARG` and on any name-only match. That is a different rule from the one upstream ships, so it ' +
      'would arrive as an ast-grep pattern rather than as this exclusion being deleted.',
  },
}
