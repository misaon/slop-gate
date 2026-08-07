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
  'astgrep/slop-swallowed-error': {
    reason:
      '**433 findings across the third-party corpus and 0 here, and roughly 19 of a 22-item sample were ' +
      'deliberate** — feature probes, optional reads, best-effort cleanup. An empty `catch` is a defect when ' +
      'the error mattered and a statement of intent when it did not, and the block cannot say which.\n\n' +
      'Shipped without the "only logs and continues" half for the same reason: 5 findings, every one a CLI ' +
      'printing an error at its top level. Available as `slop.swallowed-error`; §14 of the design spec holds ' +
      'the sample.',
  },
  'astgrep/slop-emoji-in-code': {
    reason:
      '**20 findings on this repository and 20 of 20 false** — the pretty reporter’s severity glyphs and the ' +
      'tests for wide characters, which is to say the two places a tool that prints to a terminal must have ' +
      'them. 127 more on the third-party corpus.\n\n' +
      'The rule is accurate about what it looks for; what it cannot know is whether the string reaches a ' +
      'terminal or a source file. Available as `slop.emoji-in-code`, and `docs/rules/slop.emoji-in-code.md` ' +
      'documents scoping it to the directories that do not render.',
  },
  'knip/dependencies': {
    reason:
      '**5 findings across this repository, 5 false**, and every one is the same structural gap: a dependency ' +
      'that is used but never imported. `oxlint` and `oxfmt` are resolved by path from their own engine ' +
      'packages so a binary can be spawned; `@commitlint/cli` is run by CI through `pnpm exec`; ' +
      '`@misaon/slop-gate` is a `sgate` bin.\n\n' +
      'An import graph cannot see any of those, and no option adds them — the shapes are a spawn, a script and ' +
      'a bin entry rather than a specifier. Removing what it reports breaks the build that uses it, which is ' +
      'the worst direction for a wrong finding to point. `knip/devDependencies` is excluded with it.',
    evidence: 'engine-audit',
  },
  'knip/devDependencies': { reason: '**2 of the 5 findings** in `knip/dependencies` above, on the identical argument: a devDependency invoked as a binary is invisible to an import graph.' },
  'oxfmt/unformatted': {
    reason:
      '**446 findings — nearly every file in the repository**, because it reports any file oxfmt would ' +
      'rewrite, and this project formats with something else. Its own help text says as much: "turn ' +
      '`format.unformatted` off to keep your own formatter".\n\n' +
      'A formatter is a decision a project has already made, and a quality gate that arrives with a different ' +
      'one reformats the tree on first run. It also costs twice: adding a file-granularity engine multiplies ' +
      'the synthesised `config.unused-suppression` and `config.suppression-missing-reason` counts, which is ' +
      'the effect docs/measurements.md records for ast-grep.',
    evidence: 'engine-audit',
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
  'no-template-curly-in-string': {
    reason:
      '**9 findings, zero true positives, and all of them the same syntax**: `${{ … }}` written as text — ' +
      'GitHub Actions expressions in workflow fixtures and in the concept descriptions that explain them. ' +
      'Actions interpolation is not JavaScript interpolation, and the rule matches on the braces.\n\n' +
      'The bug it exists for is real — a `${…}` inside single quotes never substitutes — and on a codebase ' +
      'that does not quote another language’s templates it would find it.',
    evidence: 'style-audit',
  },
  'unicorn/prefer-structured-clone': {
    reason:
      '**2 findings, and at least one is deliberate.** `JSON.parse(JSON.stringify(buildTelemetryPayload(…)))` ' +
      'is not a deep clone: it is the test modelling what the payload becomes over the wire, and ' +
      '`structuredClone` would keep the `Date` objects that the transport is supposed to flatten.\n\n' +
      'The rule is right that a JSON round-trip loses dates, maps and `undefined` and throws on a cycle. It ' +
      'cannot tell a clone written that way from a serialisation written that way on purpose.',
    evidence: 'style-audit',
  },
  'jest/no-done-callback': {
    reason:
      '**2 findings, 2 false, and one cause**: both are `test.for(TABLE)(\'…\', ([a, b]) => …)`, where the ' +
      'second parameter is the table row. The jest rule does not know vitest’s `test.for` and reads any ' +
      'second parameter as a `done` callback.\n\n' +
      'The pattern it targets is real — a callback never called times the test out, and called twice fails ' +
      'confusingly — so this is an engine mismatch rather than a verdict.',
    evidence: 'style-audit',
  },
  'arrow-body-style': { reason: '**9,546 findings across 44 of 48 corpus repositories.** Whether an arrow body is wrapped in braces, which oxfmt neither adds nor removes.' },
  'import/newline-after-import': { reason: '**1,018 findings across 35 of 48 corpus repositories.** A blank line, which oxfmt owns.' },
  'import/no-amd': { reason: 'Same argument as `import/no-commonjs` above.' },
  'import/no-commonjs': {
    reason:
      '**7,059 findings across 36 of 48 corpus repositories.** Promoted on the grounds that this repository is ' +
      'ESM-only — which is a fact about this repository and not about the code being checked. A CommonJS project is ' +
      'not defective; it made a different decision.\\n\\n`no-require-imports`, `no-var-requires` and `no-amd` are ' +
      'excluded with it, on the same reading.',
    evidence: 'rule-corpus',
  },
  'import/no-namespace': {
    reason:
      '**3,524 findings across 40 of 48 corpus repositories.** `import * as` is how a module with many exports is ' +
      'used, and how every `node:` builtin is imported.',
    evidence: 'rule-corpus',
  },
  'jest/consistent-test-it': {
    reason:
      '**10,613 findings across 28 of 48 corpus repositories.** `test` against `it` is what a suite is called, not ' +
      'what it checks. The vitest twin is excluded with it.',
    evidence: 'rule-corpus',
  },
  'jest/prefer-called-with': {
    reason:
      '**1,051 findings across 21 of 48 corpus repositories.** Asserting that a call happened is a weaker check than ' +
      'asserting its arguments, and sometimes it is the check that was wanted.',
    evidence: 'rule-corpus',
  },
  'jest/prefer-importing-jest-globals': { reason: '**3,455 findings**, the jest twin of `vitest/prefer-importing-vitest-globals` above, and in the same collision.' },
  'jest/prefer-lowercase-title': { reason: '**6,573 findings across 31 of 48 corpus repositories.** The first letter of a test name.' },
  'jest/prefer-to-be': { reason: '**6,468 findings across 24 of 48 corpus repositories.** `toBe` against `toEqual` for a primitive, where both are correct.' },
  'jest/prefer-to-have-length': { reason: '**3,724 findings across 24 of 48 corpus repositories.** `toHaveLength` against `toBe` on `.length`.' },
  'jest/require-hook': {
    reason:
      '**21,629 findings in 7,009 files across 47 of 48 corpus repositories, and the samples are not tests** — ' +
      '`src/index.tsx`, `src/main.ts`, `dev-docs/.../index.js`. The rule asks that setup live in a hook and applies ' +
      String.raw`that to every file it is given rather than to test files.\n\nIts vitest twin is excluded with it, on the same ` +
      'measurement.',
    evidence: 'rule-corpus',
  },
  'no-implicit-coercion': {
    reason:
      '**2,005 findings across 40 of 48 corpus repositories.** `!!x` and `+x` are idiomatic conversions, and ' +
      '`pedantic.prefer-number-coercion` already argues the narrower half.',
    evidence: 'rule-corpus',
  },
  'no-shadow': {
    reason:
      '**10,605 findings in 2,270 files across 46 of 48 corpus repositories** — `children`, `variant`, `err`, ' +
      '`projects`: a parameter named after something in an enclosing scope, which is how a callback is ' +
      String.raw`written.\n\nThe bug it exists for is real and rare; at 159 findings per thousand files it buries the rules ` +
      'that find it. Available as `correctness.shadows-outer-binding`.',
    evidence: 'rule-corpus',
  },
  'object-shorthand': { reason: '**2,238 findings across 36 of 48 corpus repositories.** `{ x: x }` against `{ x }`.' },
  'prefer-arrow-callback': {
    reason:
      '**7,908 findings across 32 of 48 corpus repositories.** A function expression brings its own `this`, which is ' +
      'sometimes the point; the rule cannot see which.',
    evidence: 'rule-corpus',
  },
  'promise/prefer-await-to-callbacks': {
    reason:
      '**4,564 findings across 43 of 48 corpus repositories.** A callback-based API is not rewritten by wishing; the ' +
      'rule reports the call site rather than the API.',
    evidence: 'rule-corpus',
  },
  'react/jsx-no-useless-fragment': {
    reason:
      '**1,122 findings across 17 of 48 corpus repositories.** A fragment around one child, which is often what a ' +
      'conditional branch needs to stay symmetrical.',
    evidence: 'rule-corpus',
  },
  'react/react-in-jsx-scope': {
    reason:
      '**56,079 findings across 23 of 48 corpus repositories — the noisiest rule in the whole measurement.** It ' +
      'requires `React` in scope for JSX, which the automatic runtime removed in React 17: every one of the 56,079 is ' +
      String.raw`a file compiled by a toolchain that does not need the import.\n\nThe classic runtime still exists and there ` +
      'the rule is right, so this is a default that expired rather than a check that is wrong. What brings it back is ' +
      'a framework profile reading the JSX transform out of tsconfig, which §23 already resolves for `resolveJsx`.',
    evidence: 'rule-corpus',
  },
  'react/self-closing-comp': { reason: '**1,220 findings across 17 of 48 corpus repositories.** Whether an empty element closes itself.' },
  'typescript/consistent-indexed-object-style': { reason: '**1,088 findings across 38 of 48 corpus repositories.** `Record<K, V>` against an index signature, which differ in what they accept for a key.' },
  'typescript/no-require-imports': { reason: '**5,762 findings across 35 of 48 corpus repositories.** Same argument as `import/no-commonjs` above: a module system is a project decision.' },
  'typescript/no-var-requires': { reason: 'Same argument as `import/no-commonjs` above.' },
  'typescript/parameter-properties': {
    reason:
      '**1,789 findings across 23 of 48 corpus repositories**, and constructor parameter properties are the idiom ' +
      'dependency injection is written in — NestJS and Angular both generate them.',
    evidence: 'rule-corpus',
  },
  'unicorn/consistent-function-scoping': {
    reason:
      '**4,439 findings across 43 of 48 corpus repositories.** A closure that could be hoisted is usually kept where ' +
      'it is read, and the rule cannot see the capture that stops it moving.',
    evidence: 'rule-corpus',
  },
  'unicorn/filename-case': { reason: '**7,418 findings across 38 of 48 corpus repositories.** A file naming convention, and the corpus shows at least three in use.' },
  'unicorn/no-nested-ternary': { reason: '**1,091 findings across 40 of 48 corpus repositories.** Parentheses around a nested ternary.' },
  'unicorn/prefer-dom-node-append': { reason: '**1,024 findings across 25 of 48 corpus repositories.** `appendChild` against `append`, where the older name is the one every tutorial uses.' },
  'unicorn/prefer-global-this': {
    reason:
      '**2,978 findings across 36 of 48 corpus repositories**, and the samples are browser files using `window`, ' +
      'where `window` is the correct name and `globalThis` is the generalisation.',
    evidence: 'rule-corpus',
  },
  'unicorn/prefer-ternary': {
    reason:
      '**1,156 findings across 44 of 48 corpus repositories.** An `if`/`else` that assigns is often clearer than the ' +
      'ternary the rule asks for, and `style.no-nested-ternary` argues the other direction.',
    evidence: 'rule-corpus',
  },
  'unicorn/switch-case-braces': { reason: '**4,361 findings across 41 of 48 corpus repositories.** Braces around a case body.' },
  'vars-on-top': { reason: '**2,208 findings across 19 of 48 corpus repositories.** Declaration placement, and only for `var`, which `style.no-var` already argues about.' },
  'vitest/consistent-test-it': { reason: '**10,613 findings**, the vitest twin of `jest/consistent-test-it` above.' },
  'vitest/prefer-called-once': { reason: '**2,180 findings across 24 of 48 corpus repositories.** `toHaveBeenCalledOnce` against `toHaveBeenCalledTimes(1)`.' },
  'vitest/prefer-called-with': { reason: 'The vitest twin of `jest/prefer-called-with` above.' },
  'vitest/prefer-importing-vitest-globals': {
    reason:
      '**7,893 findings across 40 of 48 corpus repositories**, and it is the opposite of ' +
      '`vitest/no-importing-vitest-globals`, which is excluded above. The two cannot both be right: one wants the ' +
      'globals imported and the other wants them implicit. Whichever a project chose, one of the pair reports every ' +
      'test file it has.',
    evidence: 'rule-corpus',
  },
  'vitest/prefer-lowercase-title': { reason: 'The vitest twin of `jest/prefer-lowercase-title` above.' },
  'vitest/prefer-to-be': { reason: 'The vitest twin of `jest/prefer-to-be` above.' },
  'vitest/prefer-to-have-length': { reason: 'The vitest twin of `jest/prefer-to-have-length` above.' },
  'vitest/require-hook': { reason: '**21,629 findings**, the vitest twin of `jest/require-hook` above, on the same corpus and the same argument.' },
  'unicorn/no-await-expression-member': {
    reason:
      '**976 findings across 35 of 48 corpus repositories, and 44 here** — not a noisy rule, but its fix is ' +
      'not a lint fix. `(await response).json()` becomes two statements, and the second needs a name for ' +
      'the intermediate value that neither oxlint’s fixer nor a script can choose.\n\n' +
      'oxlint marks it `fixable_dangerous_fix` for that reason. A rule whose remedy is a rename at every ' +
      'site is a refactor a team schedules, not a default a tool applies.',
    evidence: 'rule-corpus',
  },
  'unicorn/prefer-export-from': {
    reason:
      '**695 findings across 29 of 48 corpus repositories, and 18 here.** Same shape as ' +
      '`no-await-expression-member` above: collapsing an import and a re-export into `export … from` is ' +
      'correct, and doing it removes a binding the rest of the module may still use — so the fix is only ' +
      'safe where the import has no other reader, which the rule does not check.',
    evidence: 'rule-corpus',
  },
  'vitest/prefer-each': {
    reason:
      '**Fires outside test files.** Nine findings here and one of them is `for (const manifest of ' +
      'input.manifests)` in `engine-deps-security/src/scan.ts` — production code, told to use `test.each`. ' +
      'Same defect as `jest/require-hook`: a test-runner rule applied to every file it is handed.\n\n' +
      '241 findings across 29 of 48 corpus repositories, so the volume is not the objection; the targeting is.',
    evidence: 'rule-corpus',
  },
  'node/callback-return': {
    reason:
      '**6 findings here, 6 false, and all one expression**: `written.push(writeFile(…))`. The rule looks for ' +
      'a node-style callback being invoked without `return` and matched `push` as one.\n\n' +
      'The pattern it exists for — a callback called twice because the first call was not returned — is real ' +
      'and this is not it. 826 findings across 38 of 48 corpus repositories.',
    evidence: 'rule-corpus',
  },
  'promise/prefer-catch': {
    reason:
      '**Its fix changes what is caught.** `then(onFulfilled, onRejected)` does not route an error thrown by ' +
      '`onFulfilled` to `onRejected`; `then(onFulfilled).catch(onRejected)` does. The two forms exist because ' +
      'that difference is sometimes the point.\n\n' +
      '81 findings across 21 of 48 corpus repositories, so this is not about volume — a rule whose remedy ' +
      'widens an error handler cannot be a default.',
    evidence: 'rule-corpus',
  },
  'oxc/no-async-endpoint-handlers': {
    reason:
      '**213 findings across 13 of 50 corpus repositories, and it cannot tell Express from the frameworks ' +
      'that are not Express.** 34 are in fastify’s own tests and 1 in elysia’s — both handle a rejected ' +
      'async handler natively, which is the whole failure this rule exists to prevent. It matches ' +
      '`.get(path, async fn)` on any object, and `got`, an HTTP client, contributes 141.\n\n' +
      'Its premise is also historical: Express 5 routes a rejected promise to the error middleware. What ' +
      'would bring it back is a framework profile that knows which router is in the manifest.',
    evidence: 'rule-corpus',
  },
  'vitest/require-mock-type-parameters': {
    reason:
      '**3,866 findings across 17 of 50 corpus repositories**, and every one is `vi.fn()` written without a ' +
      'type argument — which infers, and is what the documentation shows.\n\n' +
      'Typing a mock against the function it replaces is a good discipline and a project can adopt it; a ' +
      'preset asking for it reports every mock in every suite that did not.',
    evidence: 'rule-corpus',
  },
  'sort-keys': {
    reason:
      '**4,513 findings, the largest count this registry has ever recorded on this repository.** It wants ' +
      'every object literal alphabetised, including the ones whose order is the meaning — a preset read ' +
      'top-down, a table of exit codes, a record whose keys are steps in sequence.\n\n' +
      'The head of a category oxlint fills with formatting and house style: 96 of `style`\'s 270 reachable ' +
      'rules fire here and not one holds a defect. `oxfmt` owns the formatting half; the rest is a decision ' +
      'a team makes once, and `sort-imports` (787), `capitalized-comments` (139) and `id-length` (574) are ' +
      'excluded on the identical argument.',
    evidence: 'style-audit',
  },
  'no-magic-numbers': { reason: '**2,517 findings.** Every literal that is not 0, 1 or -1 has to become a named constant, including the ones in a test\'s expected values and in a byte-offset calculation, where the number is the point.' },
  'vitest/prefer-expect-assertions': { reason: '**1,828 findings — one per test.** It wants `expect.assertions(n)` at the top of each, which is a count to keep in step with the body by hand. `jest/prefer-expect-assertions` is the same rule and excluded with it.' },
  'jest/prefer-expect-assertions': { reason: '**1,828 findings**, the jest twin of `vitest/prefer-expect-assertions` above.' },
  'vitest/require-top-level-describe': { reason: '**1,799 findings.** A file whose tests are all one subject does not need a wrapper to say so, and the file name already does. `jest/require-top-level-describe` is excluded with it.' },
  'jest/require-top-level-describe': { reason: '**1,799 findings**, the jest twin of `vitest/require-top-level-describe` above.' },
  'curly': { reason: '**936 findings.** Brace style on a single-statement body, which is formatting — `oxfmt` owns that and does not add them.' },
  'import/no-named-export': { reason: '**930 findings.** It requires every module to export only a default. The mirror image of `import/no-default-export`, which is also excluded: the two cannot both be right, which is what makes them house style.' },
  'vitest/prefer-strict-equal': { reason: '**869 findings.** `toStrictEqual` also compares `undefined` keys and prototypes, which is stricter than most assertions want; where it matters the test says so. `jest/prefer-strict-equal` is excluded with it.' },
  'jest/prefer-strict-equal': { reason: '**869 findings**, the jest twin of `vitest/prefer-strict-equal` above.' },
  'sort-imports': { reason: '**787 findings.** Import order, which `oxfmt` does not sort and no runtime depends on.' },
  'func-style': { reason: '**660 findings.** `function foo()` against `const foo = () =>`, where the difference that matters — hoisting — is the reason to keep both.' },
  'import/group-exports': { reason: '**656 findings.** One export statement per module, which turns every export into a maintenance point far from what it exports.' },
  'no-ternary': { reason: '**617 findings.** It bans the conditional operator outright.' },
  'id-length': { reason: '**574 findings** at a two-character minimum, so `a`, `b` in a comparator and `i` in a loop are reported.' },
  'import/no-nodejs-modules': { reason: '**409 findings.** It bans importing Node built-ins, which is aimed at code that must run in a browser. Four of the fifteen packages here are a CLI.' },
  'import/exports-last': { reason: '**373 findings.** Export placement within a file.' },
  'import/consistent-type-specifier-style': { reason: '**331 findings.** `import type { X }` against `import { type X }`, where both erase identically and TypeScript accepts each.' },
  'unicorn/no-null': { reason: '**293 findings.** It bans `null` in favour of `undefined`. This registry distinguishes them deliberately — `null` is "measured and absent", `undefined` is "not measured" — and several public types depend on that.' },
  'typescript/consistent-type-definitions': { reason: '**275 findings.** `interface` against `type`, where the difference that matters — declaration merging — is a reason to choose per declaration.' },
  'max-statements': { reason: '**195 findings** at a default of 10. A threshold argument, the same as the `max-*` family in `pedantic`.' },
  'no-continue': { reason: '**154 findings.** `continue` is how a loop states a guard clause; the alternative is a nested `if` around the rest of the body.' },
  'vitest/no-importing-vitest-globals': { reason: '**151 findings.** It wants the globals used implicitly rather than imported. This repository imports them on purpose — see `vitest/no-importing-vitest-globals` in docs/measurements.md#oxlint-multi-label-anchoring, where the same rule is one of the eight multi-label cases.' },
  'capitalized-comments': { reason: '**139 findings.** The first letter of a comment.' },
  'unicorn/max-nested-calls': { reason: '**138 findings** at a default depth of 3. A threshold argument, and the calls it counts are `join(dirname(fileURLToPath(x)))`-shaped composition.' },
  'init-declarations': { reason: '**126 findings.** It requires (or forbids) an initialiser on every `let`, and `dead-code.useless-assignment` — promoted by this audit — reports the initialisers that are actually dead.' },
  'vitest/require-test-timeout': {
    reason:
      '**1,790 findings — every test in the repository**, because it wants an explicit timeout argument on ' +
      'each one. A suite\'s timeout is a property of the suite and belongs in its config, where vitest already ' +
      'takes it; repeating it per test is 1,790 copies of one number to keep in step.\n\n' +
      'The largest single class in the `restriction` category and a fair summary of what that category is: ' +
      'oxlint files a rule there when it restricts something on preference rather than on a defect, and 37 ' +
      'of them fire here. The others below are excluded on that same reading, each with its own count.',
    evidence: 'restriction-audit',
  },
  'oxc/no-async-await': { reason: '**1,190 findings.** It bans `async`/`await` outright, in favour of raw promise chains. There is no reading of this repository, or of modern JavaScript, where that is the safer form.' },
  'oxc/no-optional-chaining': { reason: '**712 findings.** It bans `?.`, whose entire purpose is to make an absent value explicit rather than a `TypeError`. Aimed at output-size budgets on old transpile targets, which is a build decision.' },
  'no-undefined': { reason: '**542 findings.** It bans the `undefined` literal. In TypeScript it is a value the type system names, and `void 0` is not clearer than it.' },
  'oxc/no-rest-spread-properties': { reason: '**336 findings.** It bans object rest and spread, for the same transpile-target reason as `oxc/no-optional-chaining` above.' },
  'import/no-relative-parent-imports': { reason: '**349 findings.** It bans `../`, which requires either a path alias in every consumer\'s toolchain or a flat tree. A repository layout decision, not a defect.' },
  'no-use-before-define': { reason: '**245 findings.** Function declarations hoist and TypeScript reports a genuine use-before-initialisation as an error, so what is left is ordering — and reading a file top-down from its exports is a defensible order.' },
  'typescript/no-non-null-assertion': {
    reason:
      '**234 findings, and this one is uncomfortable**: AGENTS.md does say null and undefined go explicit ' +
      'rather than through `!`. Nearly all 234 are `array[index]!` under `noUncheckedIndexedAccess`, ' +
      'immediately after a bound has been checked — where the alternative is a branch that cannot be taken ' +
      'and cannot be tested.\n\n' +
      'Recorded rather than resolved. The rule is right about the pattern AGENTS.md means and wrong about the ' +
      'one that dominates the count, and separating them needs the index type, not this rule.',
    evidence: 'restriction-audit',
  },
  'typescript/explicit-function-return-type': { reason: '**226 findings.** Inference is a feature of the language, and an annotation on every arrow is noise that also goes stale. `explicit-module-boundary-types` is the narrower version and is excluded with it — 46 findings, same argument.' },
  'typescript/explicit-module-boundary-types': { reason: '**46 findings**, the exported-surface half of `typescript/explicit-function-return-type` above.' },
  'react/no-unknown-property': {
    reason:
      '**187 findings, zero true positives, and one cause**: every one is `class=` in a Preact component. ' +
      'Preact takes the DOM attribute names, so `class` and `for` are correct there and `className` is the ' +
      'alias. The rule is React\'s property table with no way to know which renderer it is looking at.\n\n' +
      '**Measured against React itself to be sure the rule is not simply wrong: 4 findings across three real ' +
      'React applications**, against 187 here. That contrast is the whole entry — it is accurate where it ' +
      'belongs and blind to which renderer it is looking at. Revisit if framework detection (§23) can stand ' +
      'it down on a Preact tree, which is a signal the inventory already carries.',
    evidence: 'react-corpus',
  },
  'unicorn/import-style': { reason: '**131 findings.** It prescribes namespace against named against default per module, from a built-in table — a house style, and one that disagrees with `node:path` being imported named.' },
  'node/no-process-env': { reason: '**89 findings.** Reading the environment is how a process is configured; the rule wants it funnelled through one module, which is a design a project chooses rather than a defect.' },
  'react/jsx-no-literals': { reason: '**40 findings.** It requires every visible string to come from a translation call. That is an internationalisation decision, and on a project without one it reports all text.' },
  'no-plusplus': { reason: '**21 findings.** `index += 1` against `index++`, with the ASI hazard it was written for removed by every formatter in use.' },
  'react/no-multi-comp': { reason: '**20 findings.** One component per file is a layout preference; a small presentational helper beside its only caller is not a defect.' },
  'no-bitwise': { reason: '**18 findings**, all deliberate — a seeded PRNG and a hash. Bitwise operators are how those are written.' },
  'node/no-top-level-await': { reason: '**18 findings.** Top-level await is ES2022 and this repository is ESM-only on Node 24. The rule targets bundling for environments neither of those includes.' },
  'no-void': { reason: '**16 findings**, all `void promise` — the idiom for marking a floating promise deliberate, which is the opposite of a defect.' },
  'complexity': { reason: '**15 findings at the default of 20.** A threshold argument, the same as the `max-*` family: a cyclomatic number says nothing about whether a function does one thing.' },
  'import/no-default-export': { reason: '**15 findings.** Default against named exports is a convention, and several tools in this tree require a default export from a config file.' },
  'no-empty-function': { reason: '**13 findings.** An empty function is how a no-op callback and a default handler are spelled.' },
  'react/jsx-filename-extension': { reason: '**12 findings.** A file-naming convention with no behaviour behind it.' },
  'typescript/explicit-member-accessibility': { reason: '**12 findings.** `public` on every member restates the default in front of each one.' },
  'unicorn/no-process-exit': { reason: '**8 findings**, all in build scripts. The concern is real — `process.exit` can truncate a buffered write — but the CLI already sets `process.exitCode` by policy, and these are scripts whose last act is the exit. Revisit when the scripts share the CLI\'s exit handling.' },
  'typescript/no-dynamic-delete': { reason: '**7 findings.** `delete map[key]` on a record used as a map, which is what a record used as a map is for.' },
  'typescript/no-invalid-void-type': { reason: '**7 findings**, all `Promise<void>` and `void` returns in generic positions the rule reads as invalid but TypeScript accepts.' },
  'unicorn/no-array-for-each': { reason: '**6 findings.** `forEach` against `for…of` is a preference, and the argument for it — no `break`, no `await` — does not apply where neither is wanted.' },
  'no-empty': { reason: '**4 findings.** An empty block with a comment in it is deliberate, and a swallowed error is already caught by `slop.swallowed-error`, which reads the catch rather than counting braces.' },
  'react/only-export-components': { reason: '**4 findings.** A Fast Refresh constraint from one bundler\'s HMR implementation, not a property of the code.' },
  'default-case': { reason: '**3 findings.** On a discriminated union an exhaustive `switch` without a default is what makes TypeScript check exhaustiveness, so the rule asks for the branch that turns that check off.' },
  'no-console': { reason: '**2 findings.** For a CLI the console is the product. Where output discipline matters this repository already writes through `process.stdout`, which the rule does not distinguish.' },
  'no-eq-null': { reason: '**2 findings.** `!= null` is the deliberate two-value check, and `pedantic.eqeqeq` is configured with `smart` for exactly that reason — see docs/measurements.md#pedantic-eqeqeq.' },
  'class-methods-use-this': { reason: '**1 finding.** A method that does not read `this` is often an interface implementation that must stay a method.' },
  'unicorn/prefer-module': { reason: '**1 finding**, a test asserting that a resolver handles `require.resolve`. This repository is ESM-only and the rules that enforce that — `no-commonjs`, `no-require-imports`, `no-var-requires`, `no-amd` — are in `recommended` as of this audit.' },
  'typescript/prefer-readonly-parameter-types': {
    reason:
      '**1,123 findings in 236 files — the largest count any type-aware rule produces here.** It requires ' +
      'every parameter to be deeply `readonly`, so every engine method, every context object and every ' +
      'options bag is reported.\n\n' +
      'That is a type discipline a project adopts wholesale or not at all, and adopting it means annotating ' +
      'the transitive shape of everything that crosses a function boundary. It says nothing about whether ' +
      'any of them is mutated.',
    evidence: 'type-aware-audit',
  },
  'typescript/no-unsafe-type-assertion': {
    reason:
      '**225 findings, and the dominant shape is `JSON.parse(text) as T`** — the assertion every boundary ' +
      'that reads external data makes. The rule is right that nothing checks it, and the fix is a validator ' +
      'at each of those boundaries, which is a design decision rather than a lint repair.\n\n' +
      'Distinct from `no-unnecessary-type-assertion`, which is in `recommended`: that one finds assertions ' +
      'that do nothing, this one finds assertions that do something unchecked.',
    evidence: 'type-aware-audit',
  },
  'typescript/no-unsafe-assignment': {
    reason:
      '**35 findings, and they trace to two sources outside this codebase\'s own types**: `JSON.parse`, which ' +
      'returns `any` by construction, and vitest\'s `expect.stringContaining`, which is typed `any` upstream. ' +
      '14 files, almost all tests.\n\n' +
      'The four siblings below report the same `any` at a different point in its travel and are excluded with ' +
      'it. Worth revisiting together once the boundaries that produce the `any` are validated rather than ' +
      'asserted — see `typescript/no-unsafe-type-assertion` above, which is the same decision.',
    evidence: 'type-aware-audit',
  },
  'typescript/no-unsafe-member-access': { reason: '**34 findings**, and 31 of them are one expression: `JSON.parse(await readFile(...)).rules` in a test. The same `any` as `typescript/no-unsafe-assignment` above, read one step later.' },
  'typescript/no-unsafe-call': { reason: '**23 findings.** The same `any` as `typescript/no-unsafe-assignment` above, invoked rather than read.' },
  'typescript/no-unsafe-argument': { reason: '**8 findings.** The same `any` as `typescript/no-unsafe-assignment` above, passed on rather than read.' },
  'typescript/no-unsafe-return': { reason: '**4 findings.** The same `any` as `typescript/no-unsafe-assignment` above, returned rather than read.' },
  'typescript/require-await': { reason: '**86 findings**, the type-aware twin of `require-await` above and excluded on the identical argument: an interface declaring a `Promise` return makes `async` the contract, and neither rule can see the signature that requires it.' },
  'typescript/promise-function-async': {
    reason:
      '**79 findings.** It requires every function returning a promise to be declared `async`, which for one ' +
      'that returns a promise it was handed — a cached lookup, a memoised call, a passthrough — adds a ' +
      'microtask and a wrapper around a value that was already the right shape.\n\n' +
      'The case it exists for is a synchronous throw escaping a promise-returning function. That is real, and ' +
      'it is a narrower rule than this one.',
    evidence: 'type-aware-audit',
  },
  'typescript/strict-void-return': { reason: '**72 findings.** It forbids returning a value from anything typed `void`, including the shorthand arrow bodies that make a callback one line. The contract is already that the value is ignored.' },
  'typescript/no-confusing-void-expression': { reason: '**26 findings.** Same family as `strict-void-return` above: it reports `void` appearing in a position that discards it, which is what `void` is for.' },
  'typescript/strict-boolean-expressions': { reason: '**6 findings.** It requires every condition to be an actual boolean, so a nullable string or a number has to be compared explicitly. A dialect a project adopts, not a defect.' },
  'typescript/no-unnecessary-condition': { reason: '**29 findings**, and it is `nursery`. It reports a check the types prove redundant — which is exactly the check that survives data arriving from outside the types, where the guarantee was never real.' },
  'typescript/restrict-plus-operands': { reason: '**10 findings.** It forbids `+` between different types, including the string-and-number concatenation that a template literal is the alternative to. `restrict-template-expressions`, which is the version that catches a real stringification bug, is in `recommended`.' },
  'typescript/dot-notation': { reason: '**6 findings**, and all of them are index access this repository writes on purpose: `noPropertyAccessFromIndexSignature` requires it, so the rule and the compiler ask for opposite things.' },
  'typescript/non-nullable-type-assertion-style': { reason: '**5 findings.** It prefers `!` to `as NonNullable<T>` — the opposite of what AGENTS.md asks for, which is the explicit form.' },
  'typescript/prefer-nullish-coalescing': { reason: '**4 findings.** `||` and `??` differ on empty string and zero, and which one is wanted is a property of the value rather than of the operator. Where the two differ this repository already uses `??`.' },
  'typescript/prefer-optional-chain': { reason: '**3 findings**, and `nursery`. Chained `&&` guards and `?.` differ on whether an intermediate is falsy or absent, so the rewrite is not always equivalent.' },
  'typescript/use-unknown-in-catch-callback-variable': { reason: '**2 findings.** `useUnknownInCatchVariables` already types a `catch` binding as `unknown`; this extends it to the `.catch()` callback, where the same discipline is already applied by hand.' },
  'typescript/return-await': { reason: '**2 findings.** `return await` inside a `try` keeps the frame in the stack trace and outside one adds a microtask, so the right answer depends on the block — which the default configuration does not distinguish.' },
  'typescript/consistent-type-exports': {
    reason:
      'Silent here, and `style`. It separates type re-exports from value ones, which `isolatedModules` ' +
      'already forces at the point it matters.\n\n' +
      'The seven type-aware `style` rules below are silent here too and excluded on the argument the style ' +
      'audit settled: a rule oxlint files under `style` earns `recommended` by holding a defect, and these ' +
      'hold a preference. See docs/measurements.md#style-audit.',
    evidence: 'style-audit',
  },
  'typescript/no-unnecessary-qualifier': { reason: 'Silent here, and `style`: a namespace qualifier inside its own namespace. Same argument as `typescript/consistent-type-exports` above.' },
  'typescript/prefer-find': { reason: 'Silent here, and `style`. `perf.prefer-array-find` — unicorn\'s version of the same check — is already in `recommended`, so this would be a second concept for one question.' },
  'typescript/prefer-readonly': { reason: 'Silent here, and `style`: a private field never reassigned could be `readonly`. Same argument as `typescript/consistent-type-exports` above.' },
  'typescript/prefer-reduce-type-parameter': { reason: 'Silent here, and `style`: the accumulator typed through `reduce`\'s parameter rather than by asserting the seed. Same argument as `typescript/consistent-type-exports` above.' },
  'typescript/prefer-regexp-exec': { reason: 'Silent here, and `style`. `match` and `exec` differ only when the pattern is global, and there the rule does not fire. Same argument as `typescript/consistent-type-exports` above.' },
  'typescript/prefer-return-this-type': { reason: 'Silent here, and `style`: a fluent method returning the class rather than `this`. Same argument as `typescript/consistent-type-exports` above.' },
  'typescript/prefer-string-starts-ends-with': { reason: 'Silent here, and `style`: a prefix test written through `indexOf` or a regular expression. Same argument as `typescript/consistent-type-exports` above.' },
  'typescript/unbound-method': {
    reason:
      '**10 findings, zero true positives, and one shape.** Every one is a function-valued property on an ' +
      'object literal returned by a factory — `inFlight.track`, `context.readText` — declared with method ' +
      'shorthand and closing over locals rather than reading `this`.\n\n' +
      'The rule reports a method-shorthand declaration whatever its body does, which is the right call for a ' +
      'class and the wrong one for the factory-plus-closure this codebase is written in. Its only option is ' +
      '`ignoreStatic`, which covers none of them. The bug it exists for — `const f = obj.method; f()` where ' +
      '`method` reads `this` — is real, and nothing else here catches it.',
    evidence: 'type-aware-audit',
  },
  'typescript/no-misused-spread': {
    reason:
      '**4 findings, all `[...someString]`,** in `diagnostics/position.ts`, `frameworks/literal.ts` and their ' +
      'tests — the two modules whose entire subject is counting code points rather than UTF-16 units. ' +
      'Spreading a string is how that is written.\n\n' +
      'Its `allow` option takes type specifiers, so exempting `string` would exempt the accidental case ' +
      'along with the deliberate one. The rule is right that spreading a string is usually a mistake; here it ' +
      'is the intent, and it cannot see the difference.',
    evidence: 'type-aware-audit',
  },
  'typescript/consistent-return': {
    reason:
      '**4 findings, all exhaustive `switch` statements over a discriminated union** with a `return` in every ' +
      'arm and no `default` — which is precisely what makes TypeScript check exhaustiveness for you. The rule ' +
      'reads the missing fall-through as an implicit `return undefined` that the type system has already ' +
      'proved unreachable.\n\n' +
      'Same argument as `default-case`, excluded above: a rule that asks for the branch which turns off the ' +
      'compiler\'s own exhaustiveness check is asking for less safety, not more.',
    evidence: 'type-aware-audit',
  },
  'typescript/no-unnecessary-type-parameters': {
    reason:
      '**2 findings, and in both the parameter constrains the implementation rather than the call.** ' +
      '`openPackedStore<Key>` threads `Key` through a `Map<string, StoredEntry<Key>>` the signature never ' +
      'mentions, and a test helper uses `<T>` as the caller\'s way of naming what it expects back.\n\n' +
      'The rule counts appearances in the signature only, so a type parameter doing work inside the body ' +
      'reads to it as an assertion in disguise.',
    evidence: 'type-aware-audit',
  },
  'require-unicode-regexp': {
    reason:
      '**305 findings, zero defects.** Every one is an ASCII pattern where `u` changes nothing — `/\\\\/g`, ' +
      '`/^https:\\/\\//`, `/^ {2}[│╭╰]/`. The flag is worth having where a pattern touches astral characters or ' +
      'uses `\\p{…}`, and there the code already carries it.\n\n' +
      'A rule that reports a third of a codebase to harden the handful of patterns it actually helps is the ' +
      '`biome-css/noHexColors` shape: house style with no defect content, at a volume that buries the rules ' +
      'which do have some. Available as `pedantic.require-unicode-regexp`.',
    evidence: 'pedantic-audit',
  },
  'require-await': {
    reason:
      '**113 findings, and the shape is structural.** `async version(cache)`, `async materializeConfig(…)`, ' +
      '`async dispose()`, `async detect(context)` — implementations of an interface that declares a `Promise` ' +
      'return, where this implementation happens not to await. The `async` keyword there is the contract, not ' +
      'an oversight, and removing it means hand-writing `Promise.resolve`.\n\n' +
      'The rule sees one function at a time and has no way to know a signature requires it. Test doubles are ' +
      'the rest: `async () => "1.2.3"` standing in for something that really is asynchronous.',
    evidence: 'pedantic-audit',
  },
  'vitest/no-conditional-in-test': {
    reason:
      '**153 findings, and none is a conditional assertion.** The real target — an `expect` behind an `if` that ' +
      'may never run — is worth catching. What it reports here is a mock implementation with a ternary ' +
      '(`levelOf: (concept) => concept === … ? "warn" : undefined`), a table-driven `for` over fixtures, and ' +
      '`expect(a === b && c)`.\n\n' +
      'It cannot tell a test body apart from the setup inside it, so on any suite that builds its doubles ' +
      'inline the count is a function of how the mocks are written. `jest/no-conditional-in-test` is the same ' +
      'rule and excluded with it.',
    evidence: 'pedantic-audit',
  },
  'jest/no-conditional-in-test': { reason: '**153 findings**, the jest twin of `vitest/no-conditional-in-test` above, on the same code and the same argument.' },
  'unicorn/no-useless-undefined': {
    reason:
      '**37 findings, and in TypeScript `undefined` is a value the signature names.** `levelOf: () => undefined` ' +
      'satisfies `(concept) => Level | undefined`; `defaultEngines(dir, undefined, undefined)` fills positional ' +
      'parameters that have no other spelling. Dropping either changes what the type says.\n\n' +
      'Its two options (`checkArguments`, `checkArrowFunctionBody`) each remove one of those classes and both ' +
      'are needed, which leaves the rule reporting only `return undefined` — three findings, also explicit on ' +
      'purpose.',
    evidence: 'pedantic-audit',
  },
  'unicorn/no-array-callback-reference': {
    reason:
      '**24 findings, zero true positives.** All are `.map(ruleRefKey)` and friends: single-parameter functions, ' +
      'where the extra `(index, array)` arguments a callback receives are ignored.\n\n' +
      'The bug it exists for is real and famous — `["1","2","3"].map(parseInt)` — but telling that apart needs ' +
      'the callee\'s arity, which this rule does not have. A type-aware check would; this one reports every ' +
      'point-free callback in the codebase instead.',
    evidence: 'pedantic-audit',
  },
  'unicorn/prefer-math-trunc': {
    reason:
      '**3 findings, and taking its advice would introduce a bug.** All three are the `>>> 0` in a seeded PRNG ' +
      '(`state = (state + 0x6d2b79f5) >>> 0`), where the shift is not truncation but coercion to uint32 — the ' +
      'whole arithmetic depends on it. `Math.trunc` does not wrap at 2³² and the generator would stop matching ' +
      'its reference implementation.\n\n' +
      'Bitwise-as-truncation is the pattern the rule is right about; bitwise-as-uint32 reads identically and it ' +
      'cannot separate them.',
    evidence: 'pedantic-audit',
  },
  'unicorn/prefer-single-call': { reason: '**28 findings, zero defects.** Consecutive `lines.push(…)` calls in report builders, where one statement per line is what makes the branch structure readable. A style preference with a micro-allocation story behind it.' },
  'no-inline-comments': { reason: '**23 findings, zero defects**, and it contradicts AGENTS.md, which asks for a constraint stated on one line — often the line it constrains. A trailing comment is a legitimate form of that, not a lesser one.' },
  'no-negated-condition': { reason: '**6 findings, zero defects.** `level !== null ? recommended : withheld` reads in the order the reader cares about; inverting it to satisfy the rule puts the uninteresting branch first.' },
  'unicorn/no-negated-condition': { reason: '**6 findings**, the unicorn twin of `no-negated-condition` above, on the same expressions.' },
  'unicorn/escape-case': { reason: '**3 findings, zero defects.** It wants `\\u00D7` rather than `\\u00d7`. Letter case inside an escape sequence, which changes nothing a reader or an engine can observe.' },
  'no-promise-executor-return': {
    reason:
      '**6 findings, zero defects.** All are `new Promise((resolve) => setImmediate(resolve))` and its siblings ' +
      '— an arrow body wrapping a callback API, which is the canonical way to promisify one, and whose returned ' +
      'value is a `Timeout` nobody meant to use.\n\n' +
      'Its `allowVoid` option only accepts the fix already written as `void …`. The case it exists for is an ' +
      'executor that returns a promise someone thought was awaited, and it cannot tell that from a one-line ' +
      'wrapper.',
    evidence: 'pedantic-audit',
  },
  'no-await-in-loop': {
    reason:
      '**77 findings here, and one of them is `await Promise.all(...)`** — the very construct the rule tells ' +
      'you to use, reported because it sits inside an outer loop. The rest are sequential reads and writes ' +
      'whose order is the point.\n\n' +
      'It takes no options. And this repository has already measured the advice it gives: `PROBE_CONCURRENCY` ' +
      'bounds a fan-out that unbounded cost 49 MB of peak RSS to save 41 ms, because `readFile` runs on a ' +
      'four-wide threadpool and the surplus only queues. A rule that argues with that on every loop is not a gate.',
    evidence: 'perf-nursery-audit',
  },
  'oxc/no-map-spread': {
    reason:
      '8 findings here, every one `.map(([key, value]) => ({ key, ...value }))` over a fixed-size object — not ' +
      'the accumulation the name suggests, which is `oxc/no-accumulating-spread` and is in `recommended`.\n\n' +
      '**The documented fix is `Object.assign(element, …)`, which mutates the array being mapped.** Trading an ' +
      'allocation for in-place mutation of data the caller still holds is a worse defect than the one it removes.',
    evidence: 'perf-nursery-audit',
  },
  'jsdoc/require-returns': {
    reason:
      '**30 findings, and the rule asks for what AGENTS.md forbids.** Every one is a typed function whose ' +
      '`@returns` would restate its return type in prose — "Nikdy nekomentuj: podpis funkce slovy". In ' +
      'TypeScript the signature is the documentation, and a tag repeating it is a second copy that goes stale ' +
      'on the first refactor.\n\n' +
      '`require-param` and the five type and description rules below are excluded on the identical argument. ' +
      'A JavaScript project that documents with JSDoc enables the `pedantic.jsdoc-*` concepts and gets them all.',
    evidence: 'pedantic-audit',
  },
  'jsdoc/require-param': { reason: '**27 findings.** The parameter half of `jsdoc/require-returns` above: a `@param` beside a typed parameter restates the signature in prose, which AGENTS.md forbids.' },
  'jsdoc/require-param-description': { reason: 'Same argument as `jsdoc/require-returns` above, applied to descriptions.' },
  'jsdoc/require-param-name': { reason: 'Same argument as `jsdoc/require-returns` above.' },
  'jsdoc/require-param-type': { reason: 'Same argument as `jsdoc/require-returns` above, and in TypeScript a `@param {type}` tag is the type written twice.' },
  'jsdoc/require-returns-description': { reason: 'Same argument as `jsdoc/require-returns` above.' },
  'jsdoc/require-returns-type': { reason: 'Same argument as `jsdoc/require-returns` above, and in TypeScript a `@returns {type}` tag is the type written twice.' },
  'jsdoc/require-throws-type': { reason: 'Same argument as `jsdoc/require-returns` above.' },
  'jsdoc/require-yields-type': { reason: 'Same argument as `jsdoc/require-returns` above.' },
  'max-lines-per-function': {
    reason:
      '**68 findings at the default of 50 lines**, and the number is the whole rule. A threshold that is not ' +
      'this repository\'s to choose: it says nothing about whether a function does one thing, which is what ' +
      'AGENTS.md actually asks for, and a 60-line exhaustive `switch` is not improved by being split.\n\n' +
      '`max-lines`, `max-depth`, `max-classes-per-file`, `max-nested-callbacks` and `import/max-dependencies` ' +
      'are excluded on the identical argument. Each is available by concept for a team that has agreed a number.',
    evidence: 'pedantic-audit',
  },
  'max-lines': { reason: '**29 findings at the default of 300 lines.** A threshold argument, same as `max-lines-per-function` above.' },
  'max-depth': { reason: '**3 findings at the default of 4.** A threshold argument, same as `max-lines-per-function` above.' },
  'max-classes-per-file': { reason: '**1 finding at the default of 1 class.** A threshold argument, same as `max-lines-per-function` above.' },
  'max-nested-callbacks': { reason: 'A threshold argument, same as `max-lines-per-function` above. Silent here, which is a fact about this codebase and not about the rule.' },
  'import/max-dependencies': { reason: '**12 findings at the default of 10 imports.** A threshold argument, same as `max-lines-per-function` above, and the count it caps is a property of what a module composes rather than of its quality.' },
  'no-else-return': { reason: 'Style with no defect behind it: whether the early return or the symmetric `if`/`else` reads better depends on whether the two branches are peers. Silent here.' },
  'no-lonely-if': { reason: 'Style with no defect behind it — `else { if … }` against `else if`. Silent here.' },
  'unicorn/no-lonely-if': { reason: 'The unicorn twin of `no-lonely-if` above, on the same argument.' },
  'sort-vars': { reason: 'Declaration order inside one statement, which no reader depends on. `sort-keys` and `sort-imports` are excluded on the same ground — they produced 4,513 and 787 findings here between them.' },
  'accessor-pairs': { reason: 'A getter without its setter is a deliberate read-only property far more often than it is an omission, and the rule cannot tell those apart. Silent here.' },
  'unicorn/explicit-length-check': { reason: '`array.length` in a boolean position is unambiguous — the only falsy length is 0. A preference for `> 0`, with no defect behind it.' },
  'unicorn/prefer-top-level-await': {
    reason:
      'It reads a `main().catch(…)` entry point as legacy, and for a CLI it is not: `bin/sgate.js` needs a ' +
      'synchronous body so `module.enableCompileCache()` runs before the module graph loads, which is worth ' +
      '26 ms of every run (see docs/measurements.md). Top-level await also changes how a bundler can emit the ' +
      'module, which is a packaging decision and not a lint one.',
  },
  'unicorn/consistent-assert': { reason: '`assert(x)` against `assert.ok(x)` — its own documentation calls this consistency and readability, and both spellings do the same thing.' },
  'unicorn/prefer-event-target': { reason: 'Node\'s `EventEmitter` to `EventTarget` is a migration with different semantics — no `once` return value, no listener count, different error handling — not a defect. A project that has chosen `EventTarget` enables the concept.' },
  'react/no-array-index-key': {
    reason:
      '**30 findings across excalidraw, redux-toolkit and vercel/commerce, and sixteen were read: every one ' +
      'is a static list.** `<hr key={idx}>` between menu sections, `<kbd key={index}>` over the parts of a ' +
      'split string, `<Feature key={idx}>` over a constant array — none inserted into, sorted or filtered.\n\n' +
      'The rule is right about the general case: an index is a position, so after an insertion every later ' +
      'item inherits its neighbour\'s key. It cannot see whether the list is one that moves, and on real ' +
      'React the ones it finds are the ones that do not.',
    evidence: 'react-corpus',
  },
  'react-perf/jsx-no-new-function-as-prop': {
    reason:
      '**786 findings across three real React applications** — excalidraw 479, redux-toolkit 289, ' +
      'vercel/commerce 18. An inline `onClick={() => …}` is how React is written, and the identity it ' +
      'creates only costs anything when the child is memoised, which the rule cannot see.\n\n' +
      'With its three siblings this is 1,544 findings on 544 components and no defect among them. Available ' +
      'by concept for a codebase that has memoised its tree and wants the discipline that goes with it.',
    evidence: 'react-corpus',
  },
  'react-perf/jsx-no-new-object-as-prop': { reason: '**311 findings** across the same three applications. The object half of `react-perf/jsx-no-new-function-as-prop` above, on the identical argument.' },
  'react-perf/jsx-no-new-array-as-prop': { reason: '**133 findings** across the same three applications. The array half of `react-perf/jsx-no-new-function-as-prop` above.' },
  'react-perf/jsx-no-jsx-as-prop': { reason: '**64 findings** across the same three applications. Passing an element as a prop is what a `renderHeader`-shaped API is; same argument as its three siblings above.' },
  'react/react-compiler': {
    reason:
      '**216 findings across three real React applications.** It reports code the React Compiler cannot ' +
      'memoise, which is a fact about that compiler rather than about the code — a project not using it ' +
      'gets a list of non-problems, and one using it already gets the same information from its build.\n\n' +
      'Also `nursery` upstream.',
    evidence: 'react-corpus',
  },
  'no-undef': {
    reason:
      '**564 findings here, zero true positives.** 20 distinct names, 19 of them standard globals — `process` ' +
      '383 times, then `AbortSignal`, `TextEncoder`, `fetch`, `URL`, `Buffer`, `console`. The twentieth is in a ' +
      'deliberately-invalid ast-grep fixture.\n\n' +
      'Two reasons it cannot be rescued here. It needs an `env`/`globals` declaration, which is a section of ' +
      'oxlint config the engine never writes (§13: rules, categories and plugins only). And in TypeScript an ' +
      'undefined identifier is a compile error `types.type-error` already reports, with a better message.',
    evidence: 'perf-nursery-audit',
  },
  'no-unreachable-loop': {
    reason:
      '2 findings, both false. `cache/atomic-write.ts` is a retry loop whose `catch` either rethrows or delays ' +
      'and falls through to the next attempt; the rule reports it as allowing one iteration, because it does not ' +
      'follow the path that leaves a `catch` without throwing.\n\n' +
      '`nursery` upstream, and with `no-undef` that is two of the four nursery rules which fire here being wrong ' +
      'or unusable. Read that as the reason to promote a nursery rule on its own argument and never on the ' +
      'category — not as a verdict on the check, which is real.',
    evidence: 'perf-nursery-audit',
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
