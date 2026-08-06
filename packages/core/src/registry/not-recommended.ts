export type NotRecommended = {
  /** The figure, the conclusion, and any trap in undoing it. Length-capped by `not-recommended.test.ts`. */
  readonly reason: string
  /** Anchor in `docs/measurements.md` holding the method behind `reason`. */
  readonly evidence?: string
}

export const NOT_RECOMMENDED_UNCATALOGUED: Readonly<Record<string, NotRecommended>> = {
  'knip/files': {
    reason:
      '**105 findings on a 145k-line React monorepo, at least 98 of them a file that is loaded but not ' +
      'imported.** They decompose into six unrelated tool conventions — Cucumber, an in-house licence ' +
      'checker, `.mdx`, openapi-ts, lighthouse, a served service worker — and no predicate covers that ' +
      'set without reading each tool’s config, which spec §23.5 forbids.\n\n' +
      'This costs real coverage: a genuinely dead file now goes unreported by default, and 7 of the 105 ' +
      'looked like true positives. `dead-code.unused-file` in a config restores it.',
    evidence: 'knip-files',
  },
  'deps-security/missing-lockfile-entry': {
    reason:
      'The one rule in this engine with a structural false-positive mode: a manifest entry absent from ' +
      'the lockfile means either the package does not exist or the lockfile is out of date, and nothing ' +
      'offline separates them. A lockfile one commit stale would report every new dependency as imaginary.\n\n' +
      'Kept available by concept because the one case that reaches a committed lockfile — an unresolvable ' +
      '`optionalDependencies` entry, which npm and pnpm install past with exit 0 — is silent everywhere else.',
  },
  'actionlint/runner-label': {
    reason:
      '**308 of 447 findings (69%), zero true positives**, across 7 of 17 repositories. Every one is a ' +
      'runner label actionlint cannot know about — depot.dev, namespace.so, self-hosted pools, and ' +
      '`ubuntu-26.04`, which is a real GitHub-hosted runner the pinned binary predates.\n\n' +
      '**The rule itself works**; the problem is the allowlist. Revisit when `slop-gate.config.ts` can ' +
      'declare a repository’s own runner labels for the adapter to translate.',
    evidence: 'actionlint-runner-label',
  },
  'actionlint/action': {
    reason:
      '**Nondeterministic, and that is the disqualifying reason rather than the precision.** Ten identical ' +
      'runs over the same 403 files produced a different finding set each time, because actionlint caches ' +
      'action metadata across a concurrent lint and iterates jobs over a Go map. Ten runs over *one* file ' +
      'put the same finding on four different lines.\n\n' +
      '**No fingerprint scheme rescues it.** §10.1 hashes the text of the line, not its number, so a moved ' +
      'column is free — but a finding attributed to a different line, or absent altogether, is not. A ' +
      'baseline over this rule would churn however the hash is computed.\n\n' +
      'Also imprecise: 10 findings, 1 true positive.',
    evidence: 'actionlint-action',
  },
  'actionlint/syntax-check': {
    reason:
      '9 findings, 2 true positives, and all 7 false ones are the same failure mode: actionlint validates ' +
      'against a schema compiled into the binary, so **every Actions feature shipped after a release reads ' +
      'as an unexpected key**. Here that is parallel steps and `concurrency.queue`, both confirmed against ' +
      'GitHub’s changelog.\n\n' +
      'Because we pin the binary, that staleness is our choice on the user’s behalf — an argument for ' +
      'tracking upstream releases, and against a rule whose false-positive rate follows our release cadence.',
    evidence: 'actionlint-syntax-check',
  },
  'biome-css/noHexColors': {
    reason:
      '**5,815 findings across 376 of 1,729 production stylesheets, not one a bug** — the rule’s entire ' +
      'content is preferring `hsl()`/`oklch()` over `#rrggbb`. It fires in 9 of 10 corpus repositories, so ' +
      'no repository shape escapes it.\n\n' +
      'With the three CSS entries below this is 11,525 of the engine’s 12,125 findings and none of its ~27 ' +
      'real defects. Eleven thousand findings with no defect content does not teach a user their ' +
      'stylesheets are untidy; it teaches them the tool is noise, and takes the eighteen rules that *are* ' +
      'defects down with it. Available as `style.css-hex-color`.',
    evidence: 'biome-css-house-style',
  },
  'biome-css/noDescendingSpecificity': {
    reason:
      '2,206 findings in 435 files — **a quarter of every stylesheet measured** — in 8 of 10 repositories. ' +
      'Twelve were read and every one was ordinary, correct CSS. Real stylesheets are grouped by component ' +
      'rather than by specificity, and that is how they stay maintainable.\n\n' +
      'The sample was twelve, not 2,206, and the decision does not rest on the difference: at ten findings ' +
      'per thousand lines the rule is out whether its true-positive rate is 0% or 2%.',
    evidence: 'biome-css-house-style',
  },
  'biome-css/useBaseline': {
    reason:
      '2,002 findings in 467 files. **What it reports is a property of the project’s browser targets, which ' +
      'slop-gate does not know** — so on any repository it is either entirely right or entirely irrelevant, ' +
      'and nothing in the run can tell which. The corpus makes the point: 307 findings against an ' +
      'application that ships its own Chromium.\n\n' +
      'Revisit if slop-gate grows a way to declare a browser support floor for the adapter to translate.',
    evidence: 'biome-css-house-style',
  },
  'biome-css/noImportantStyles': {
    reason:
      '1,502 findings in 323 files, 1,071 of them one editor. Overused `!important` makes a cascade ' +
      'impossible to reason about; used deliberately it is how a theming layer wins against a component ' +
      'library it does not control — which is what a 1,071-finding editor is doing. Telling those apart ' +
      'needs the codebase’s conventions. Available as `complexity.css-important`.',
    evidence: 'biome-css-house-style',
  },
  'biome-css/noUnknownAtRules': {
    reason:
      '**Revisit trigger, not a verdict.** 26 findings, 0 true positives, and the rule is right in every one ' +
      'about what plain CSS defines: 25 `@extend` compiled by PostCSS, 1 `@tailwind`. That measures a corpus ' +
      'containing two preprocessed projects, not a check that is wrong.\n\n' +
      '**What puts it back: a framework profile that detects a CSS preprocessor and stands the rule down ' +
      'there.** The signals are already inventory-visible — a `postcss.config.*`, a `postcss`/`tailwindcss` ' +
      'dependency, or `@extend`/`@apply` in the file. Do not record this as an inaccurate rule; a reader ' +
      'comparing it to `noUnknownUnit`, which is genuinely wrong, must be able to tell them apart.',
    evidence: 'biome-css-preprocessor',
  },
  'biome-css/noUnknownFunction': {
    reason:
      '**Revisit trigger, on the identical condition as `noUnknownAtRules`.** 3 findings, 0 true positives, ' +
      'all three Mantine’s `alpha()` compiled away by PostCSS. On a plain-CSS repository an unknown function ' +
      'drops the whole declaration at parse time, which is real and completely invisible.',
    evidence: 'biome-css-preprocessor',
  },
  'biome-css/useGenericFontNames': {
    reason:
      '16 findings, 1 true positive. **15 are icon fonts**, and there the remediation is actively harmful: ' +
      'adding `sans-serif` after `codicon` means a reader missing the icon font sees arbitrary letters ' +
      'instead of the browser default they would have had.\n\n' +
      'The ratio keeps it out and is not obviously fixable — Biome cannot tell an icon font from a text ' +
      'font, and neither can we.',
  },
  'biome-css/noDuplicateSelectors': {
    reason:
      '178 findings in 78 files; ten were read across five repositories and none was a defect. Declaring a ' +
      'selector twice is what grouping declarations by concern looks like, and the rule cannot tell that ' +
      'from genuine redundancy. Also `nursery` upstream, which is Biome’s own statement that it is not ready ' +
      'to be a default.',
  },
  'biome-css/noEmptyBlock': {
    reason:
      '181 findings, **176 of them one repository’s documented convention** — highlight.js ships ' +
      '`.hljs-property {}` as a deliberate placeholder in 176 theme files. Outside it the rule is nearly ' +
      'silent: 5 findings in the other 1,553 files.\n\n' +
      'Excluded not for noise but because an empty block costs nothing at run time and removing one is never ' +
      'a fix. The concentration is disclosed because it would otherwise look like a much noisier rule.',
  },
}

export const NOT_RECOMMENDED_GENERATED: Readonly<Record<string, NotRecommended>> = {
  'vitest/valid-expect': {
    reason:
      'oxlint reports "Expect takes at most 1 argument" whenever `expect`’s second argument is not a *string ' +
      'literal*, which vitest’s own signature allows — `<T>(actual: T, message?: string)`. 27 of 27 findings ' +
      'here are that shape.\n\n' +
      '**`jest/valid-expect` is deliberately not excluded** — same message, same code, and correct there, ' +
      'because jest’s `expect` really does take one argument.\n\n' +
      '**`maxArgs: 2` would fix it and is not promoted**, because it changes nothing on the 32,035-file ' +
      'corpus: the class it removes is close to a house idiom. Note the trap in undoing this — the rule is ' +
      '`correctness`-category, so deleting this row puts it into `recommended` at its *default* ' +
      'configuration.',
    evidence: 'vitest-valid-expect',
  },
  'import/no-unassigned-import': {
    reason:
      '5 findings across both repositories the registry was validated against, **5/5 false positives** — every ' +
      'one a canonical side-effect import: `reflect-metadata`, `dotenv/config`, a theme stylesheet, startup ' +
      'instrumentation.\n\n' +
      'Swept for a rescuing option. `allow` takes globs, and a generous generic allowlist still leaves **1,662 ' +
      'findings over the 32,035-file corpus**, two orders of magnitude past anything in `recommended`. The ' +
      'residue is application-local startup imports, which are legitimate and unguessable — same shape as ' +
      '`useBaseline`: the option exists, and the value it needs is a fact about the project.',
    evidence: 'import-no-unassigned-import',
  },
  'unicorn/no-array-sort': {
    reason:
      'All 21 occurrences here — not a sample — are `[...x].sort()`, `x.map(…).sort()` or ' +
      '`Object.entries(x).sort()`: sorting an array just derived from a spread or map that nothing else ' +
      'holds. The rule cannot tell that from mutating a caller-owned array, which is the bug it exists for.\n\n' +
      '**`allowAfterSpread` does not rescue it**, checked because this reason’s own wording names the option: ' +
      '95 findings on defaults, 50 with it. It covers the literal spread form only, and the residue is the ' +
      'other half of the same idiom. Recorded as the counter-example to `pedantic.eqeqeq`, where the same ' +
      'question got the opposite answer.',
    evidence: 'unicorn-no-array-sort',
  },
  'unicorn/no-array-reverse': {
    reason:
      'Same measurement and reasoning as `unicorn/no-array-sort` above, which shares its rationale upstream: ' +
      'all 3 occurrences reverse an array just produced by a spread. Its only option, `allowExpressionStatement`, ' +
      'changes nothing (4 findings either way), and it notably lacks `allowAfterSpread` — so it has less ' +
      'recourse than its sibling rather than more.',
  },
  'no-underscore-dangle': {
    reason:
      '5 of the playground’s 6 total findings are this rule, all on `request_` in one file that imports ' +
      '`* as request` from supertest — a trailing underscore adopted deliberately to dodge a shadowed import, ' +
      'applied consistently five times. A gate that argues with a codebase’s naming convention on every run ' +
      'teaches its user to ignore it.\n\n' +
      '**The strongest exclusion in this table, not the weakest.** Turning on every plausible option takes it ' +
      'from **135,767 findings to 5,255** over the 32,035-file corpus — still more than every rule in ' +
      '`recommended` combined, and the default figure is the largest ever measured for this registry.',
    evidence: 'no-underscore-dangle',
  },
  'no-implied-eval': {
    reason:
      'Verified against oxlint 1.76.0: the rule loads (`number_of_rules: 1`) and produces **zero diagnostics ' +
      'against every canonical trigger** — setTimeout, setInterval, Function and execScript with a string ' +
      'first argument. A rule that never fires is worse than no rule, because recommending it claims coverage ' +
      'of `security.implied-eval` that this registry does not provide.\n\n' +
      'Scoped to the bare `eslint` rule; `typescript/no-implied-eval` is separate and type-aware.',
    evidence: 'no-implied-eval',
  },
  'hadolint/DL3008': {
    reason:
      '**132 findings, zero true positives** — the largest class in the Dockerfile corpus. Pinning ' +
      '`apt-get install pkg=1.2.3` is actively defeated by Debian and Ubuntu, whose archives keep only the ' +
      'current version, so a pin stops resolving the moment a security update lands. Not one of the 84 files ' +
      'that trigger it complies.\n\n' +
      '`DL3018` (apk) and `DL3013` (pip) are excluded on the identical argument. What brings it back: scoping ' +
      'to a base image whose distribution offers a stable pinned archive, which is a §23 question.',
  },
  'hadolint/DL3018': { reason: '**49 findings, zero true positives.** The apk half of `DL3008` — Alpine does not retain old package versions either.' },
  'hadolint/DL3013': { reason: '**10 findings, zero true positives.** The pip half of `DL3008`.' },
  'hadolint/DL3059': {
    reason:
      '**84 findings, zero true positives.** A layer-count preference BuildKit made obsolete: separate `RUN` ' +
      'steps are frequently deliberate, because each caches independently and consolidating them means one ' +
      'changed dependency re-runs the whole chain.',
  },
  'hadolint/DL3020': {
    reason:
      '**51 findings, zero true positives**, at `error` severity — which is most of why hadolint’s own ' +
      'severity cannot be mapped onto ours. For a local file `ADD` behaves exactly as `COPY` except that it ' +
      'auto-extracts tar archives, and none of the 51 was a tarball. The rule is otherwise well built: it ' +
      'correctly stays silent on `ADD <url>`.',
  },
  'hadolint/DL3015': {
    reason:
      '**45 findings, zero true positives.** `--no-install-recommends` is an image-size optimisation, and ' +
      'omitting it is sometimes required — several corpus images depend on a recommended package arriving.',
  },
  'hadolint/DL3003': {
    reason:
      '**39 findings, zero true positives.** A `cd` inside a single `RUN` is scoped to that shell invocation ' +
      'and is correct; `WORKDIR` changes the directory for every later instruction, which is a different ' +
      'thing and often not what was wanted.',
  },
  'hadolint/DL3009': {
    reason:
      '**24 findings, zero true positives.** An image-size optimisation, routinely pointless in a build stage ' +
      'a later multi-stage `COPY` discards wholesale. Contrast `DL3042`, which ships: that one is a single ' +
      'flag on the same command.',
  },
  'hadolint/DL3019': { reason: '**10 findings, zero true positives.** The apk `--no-cache` counterpart of `DL3009`.' },
  'hadolint/DL3045': {
    reason:
      '**20 findings, zero true positives.** Docker defines the default working directory as `/`, so a `COPY` ' +
      'to a relative destination lands where the author intended. Implicit, not wrong.',
  },
  'hadolint/DL4001': {
    reason:
      '**12 findings, zero true positives**, from 3 files. A consistency preference with no failure behind it; ' +
      'the corpus cases use each of wget and curl where it fits better.',
  },
  'hadolint/DL3047': { reason: '**7 findings, zero true positives.** `wget` without `--progress`, an output-noise preference.' },
  'hadolint/DL3066': {
    reason:
      '**69 findings, zero true positives, and the rule fires on the correct fix.** It complains about ' +
      '`USER nobody`, `USER node`, `USER appuser` — running as a named non-root user is what every container ' +
      'hardening guide asks for.\n\n' +
      '**Read this before re-proposing it, because the name makes it look right.** hadolint cannot catch a ' +
      'container running as root: **a Dockerfile with no `USER` at all produces zero findings**, because ' +
      '`DL3002` only fires on an explicit `USER root`. So hadolint is silent when a container runs as root and ' +
      'complains when it does not. The real gap needs a check of our own.',
    evidence: 'hadolint-dl3066',
  },
  'hadolint/DL3064': {
    reason:
      '**7 of 25 true, and excluded *because* it is a security rule rather than despite it.** 28% is the best ' +
      'precision among the excluded rules and still the wrong trade: a security finding wrong three times in ' +
      'four teaches people to dismiss the category.\n\n' +
      'It substring-matches the *variable name*, so it is right about `ENV PGPASSWORD=…` and wrong about ' +
      '`TIKTOKEN_CACHE_DIR` and a value-less `ARG SENTRY_AUTH_TOKEN`, which bakes nothing. **What brings it ' +
      'back**: matching the assigned value rather than the name — a different rule from the one upstream ' +
      'ships, so it arrives as an ast-grep pattern rather than as this row being deleted.',
    evidence: 'hadolint-dl3064',
  },
}
