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
}

export const NOT_RECOMMENDED_GENERATED: Readonly<Record<string, NotRecommended>> = {
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
  'import/no-default-export': {
    reason:
      '**17 of 17 findings in this repository are files whose loader requires a default export** — thirteen '
      + '`tsdown.config.ts`, `vitest.config.ts`, `vite.config.ts`, `commitlint.config.js` and '
      + '`slop-gate.config.ts`. The rule cannot be obeyed there: the default export *is* the file format, so '
      + 'the only way to silence it is to stop using the tool.\n\n'
      + 'It is not withheld for being noisy. It is withheld because slop-gate has no way to scope a preset '
      + 'rule to a path, so shipping it would put an unfixable finding in every project that has a config '
      + 'file. Give the preset path scoping and this becomes `recommended` with `**/*.config.*` exempt.',
    evidence: 'no-default-export',
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
  'import/no-amd': { reason: 'Same argument as `import/no-commonjs` above.' },
  'jest/require-hook': {
    reason:
      '**21,629 findings in 7,009 files across 47 of 48 corpus repositories, and the samples are not tests** — ' +
      '`src/index.tsx`, `src/main.ts`, `dev-docs/.../index.js`. The rule asks that setup live in a hook and applies ' +
      String.raw`that to every file it is given rather than to test files.\n\nIts vitest twin is excluded with it, on the same ` +
      'measurement.',
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
  'vitest/require-hook': { reason: '**21,629 findings**, the vitest twin of `jest/require-hook` above, on the same corpus and the same argument.' },
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
  'import/no-named-export': { reason: '**930 findings.** It requires every module to export only a default. The mirror image of `import/no-default-export`, which is also excluded: the two cannot both be right, which is what makes them house style.' },
  'no-ternary': { reason: '**617 findings.** It bans the conditional operator outright.' },
  'vitest/no-importing-vitest-globals': { reason: '**151 findings.** It wants the globals used implicitly rather than imported. This repository imports them on purpose — see `vitest/no-importing-vitest-globals` in docs/measurements.md#oxlint-multi-label-anchoring, where the same rule is one of the eight multi-label cases.' },
  'oxc/no-async-await': { reason: '**1,190 findings.** It bans `async`/`await` outright, in favour of raw promise chains. There is no reading of this repository, or of modern JavaScript, where that is the safer form.' },
  'oxc/no-optional-chaining': { reason: '**712 findings.** It bans `?.`, whose entire purpose is to make an absent value explicit rather than a `TypeError`. Aimed at output-size budgets on old transpile targets, which is a build decision.' },
  'no-undefined': { reason: '**542 findings.** It bans the `undefined` literal. In TypeScript it is a value the type system names, and `void 0` is not clearer than it.' },
  'oxc/no-rest-spread-properties': { reason: '**336 findings.** It bans object rest and spread, for the same transpile-target reason as `oxc/no-optional-chaining` above.' },
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
  'typescript/require-await': { reason: '**86 findings**, the type-aware twin of `require-await` above and excluded on the identical argument: an interface declaring a `Promise` return makes `async` the contract, and neither rule can see the signature that requires it.' },
  'typescript/no-unnecessary-condition': { reason: '**29 findings**, and it is `nursery`. It reports a check the types prove redundant — which is exactly the check that survives data arriving from outside the types, where the guarantee was never real.' },
  'typescript/dot-notation': { reason: '**6 findings**, and all of them are index access this repository writes on purpose: `noPropertyAccessFromIndexSignature` requires it, so the rule and the compiler ask for opposite things.' },
  'typescript/non-nullable-type-assertion-style': { reason: '**5 findings.** It prefers `!` to `as NonNullable<T>` — the opposite of what AGENTS.md asks for, which is the explicit form.' },
  'typescript/prefer-nullish-coalescing': { reason: '**4 findings.** `||` and `??` differ on empty string and zero, and which one is wanted is a property of the value rather than of the operator. Where the two differ this repository already uses `??`.' },
  'typescript/prefer-optional-chain': { reason: '**3 findings**, and `nursery`. Chained `&&` guards and `?.` differ on whether an intermediate is falsy or absent, so the rewrite is not always equivalent.' },
  'typescript/use-unknown-in-catch-callback-variable': { reason: '**2 findings.** `useUnknownInCatchVariables` already types a `catch` binding as `unknown`; this extends it to the `.catch()` callback, where the same discipline is already applied by hand.' },
  'typescript/prefer-find': { reason: 'Silent here, and `style`. `perf.prefer-array-find` — unicorn\'s version of the same check — is already in `recommended`, so this would be a second concept for one question.' },
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
  'oxc/no-map-spread': {
    reason:
      '8 findings here, every one `.map(([key, value]) => ({ key, ...value }))` over a fixed-size object — not ' +
      'the accumulation the name suggests, which is `oxc/no-accumulating-spread` and is in `recommended`.\n\n' +
      '**The documented fix is `Object.assign(element, …)`, which mutates the array being mapped.** Trading an ' +
      'allocation for in-place mutation of data the caller still holds is a worse defect than the one it removes.',
    evidence: 'perf-nursery-audit',
  },
  'max-nested-callbacks': { reason: 'A threshold argument, same as `max-lines-per-function` above. Silent here, which is a fact about this codebase and not about the rule.' },
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
  'hadolint/DL1000': {
    reason:
      '**Could not be made to fire.** Authored Dockerfiles built from the rule\'s own description produced nothing, with the rule forced to `error` through an `override` block so a default-off severity cannot be the explanation. A rule whose behaviour cannot be demonstrated must not be shipped as coverage.',
  },
  'hadolint/DL1001': {
    reason:
      '**It forbids hadolint\'s own `# hadolint ignore=` pragma, which is a suppression question rather than a Dockerfile one.** slop-gate already models a foreign tool\'s suppression directly, so routing the same concern through a lint rule would report it twice and in the weaker of the two places. Off by default upstream for the same reason.',
  },
  'hadolint/DL3026': {
    reason:
      '**Reports nothing without a label schema the project supplies.** Verified: a fixture that produced 0 findings on its own produced 7 under a `label-schema` block. The rule holds no opinion of its own — the list of required labels, their formats and whether extras are allowed are all facts about a project. Naming it in a preset would be decoration, the same as `no-restricted-syntax`.',
  },
  'hadolint/DL3032': {
    reason:
      '**Excluded on the identical argument as `DL3009` and `DL3019`**: an image-size optimisation, routinely pointless in a build stage that a later multi-stage `COPY` discards wholesale. It reports that a cache directory survived into a layer, not that anything in the image is wrong.',
  },
  'hadolint/DL3033': {
    reason:
      '**Excluded on the identical argument as `DL3008`**: the package archive keeps only the current version, so a pin stops resolving the moment a security update lands. That is why `DL3016` (npm), `DL3028` (gem) and `DL3062` (go) ship and this one does not — those registries keep every version published, and a pin there stays valid.',
  },
  'hadolint/DL3036': {
    reason:
      '**Excluded on the identical argument as `DL3009` and `DL3019`**: an image-size optimisation, routinely pointless in a build stage that a later multi-stage `COPY` discards wholesale. It reports that a cache directory survived into a layer, not that anything in the image is wrong.',
  },
  'hadolint/DL3037': {
    reason:
      '**Excluded on the identical argument as `DL3008`**: the package archive keeps only the current version, so a pin stops resolving the moment a security update lands. That is why `DL3016` (npm), `DL3028` (gem) and `DL3062` (go) ship and this one does not — those registries keep every version published, and a pin there stays valid.',
  },
  'hadolint/DL3040': {
    reason:
      '**Excluded on the identical argument as `DL3009` and `DL3019`**: an image-size optimisation, routinely pointless in a build stage that a later multi-stage `COPY` discards wholesale. It reports that a cache directory survived into a layer, not that anything in the image is wrong.',
  },
  'hadolint/DL3041': {
    reason:
      '**Excluded on the identical argument as `DL3008`**: the package archive keeps only the current version, so a pin stops resolving the moment a security update lands. That is why `DL3016` (npm), `DL3028` (gem) and `DL3062` (go) ship and this one does not — those registries keep every version published, and a pin there stays valid.',
  },
  'hadolint/DL3046': {
    reason:
      '**Could not be made to fire.** Authored Dockerfiles built from the rule\'s own description produced nothing, with the rule forced to `error` through an `override` block so a default-off severity cannot be the explanation. A rule whose behaviour cannot be demonstrated must not be shipped as coverage.',
  },
  'hadolint/DL3049': {
    reason:
      '**Reports nothing without a label schema the project supplies.** Verified: a fixture that produced 0 findings on its own produced 7 under a `label-schema` block. The rule holds no opinion of its own — the list of required labels, their formats and whether extras are allowed are all facts about a project. Naming it in a preset would be decoration, the same as `no-restricted-syntax`.',
  },
  'hadolint/DL3050': {
    reason:
      '**Reports nothing without a label schema the project supplies.** Verified: a fixture that produced 0 findings on its own produced 7 under a `label-schema` block. The rule holds no opinion of its own — the list of required labels, their formats and whether extras are allowed are all facts about a project. Naming it in a preset would be decoration, the same as `no-restricted-syntax`.',
  },
  'hadolint/DL3051': {
    reason:
      '**Reports nothing without a label schema the project supplies.** Verified: a fixture that produced 0 findings on its own produced 7 under a `label-schema` block. The rule holds no opinion of its own — the list of required labels, their formats and whether extras are allowed are all facts about a project. Naming it in a preset would be decoration, the same as `no-restricted-syntax`.',
  },
  'hadolint/DL3052': {
    reason:
      '**Reports nothing without a label schema the project supplies.** Verified: a fixture that produced 0 findings on its own produced 7 under a `label-schema` block. The rule holds no opinion of its own — the list of required labels, their formats and whether extras are allowed are all facts about a project. Naming it in a preset would be decoration, the same as `no-restricted-syntax`.',
  },
  'hadolint/DL3053': {
    reason:
      '**Reports nothing without a label schema the project supplies.** Verified: a fixture that produced 0 findings on its own produced 7 under a `label-schema` block. The rule holds no opinion of its own — the list of required labels, their formats and whether extras are allowed are all facts about a project. Naming it in a preset would be decoration, the same as `no-restricted-syntax`.',
  },
  'hadolint/DL3054': {
    reason:
      '**Reports nothing without a label schema the project supplies.** Verified: a fixture that produced 0 findings on its own produced 7 under a `label-schema` block. The rule holds no opinion of its own — the list of required labels, their formats and whether extras are allowed are all facts about a project. Naming it in a preset would be decoration, the same as `no-restricted-syntax`.',
  },
  'hadolint/DL3055': {
    reason:
      '**Reports nothing without a label schema the project supplies.** Verified: a fixture that produced 0 findings on its own produced 7 under a `label-schema` block. The rule holds no opinion of its own — the list of required labels, their formats and whether extras are allowed are all facts about a project. Naming it in a preset would be decoration, the same as `no-restricted-syntax`.',
  },
  'hadolint/DL3056': {
    reason:
      '**Reports nothing without a label schema the project supplies.** Verified: a fixture that produced 0 findings on its own produced 7 under a `label-schema` block. The rule holds no opinion of its own — the list of required labels, their formats and whether extras are allowed are all facts about a project. Naming it in a preset would be decoration, the same as `no-restricted-syntax`.',
  },
  'hadolint/DL3058': {
    reason:
      '**Reports nothing without a label schema the project supplies.** Verified: a fixture that produced 0 findings on its own produced 7 under a `label-schema` block. The rule holds no opinion of its own — the list of required labels, their formats and whether extras are allowed are all facts about a project. Naming it in a preset would be decoration, the same as `no-restricted-syntax`.',
  },
  'hadolint/DL3060': {
    reason:
      '**Excluded on the identical argument as `DL3009` and `DL3019`**: an image-size optimisation, routinely pointless in a build stage that a later multi-stage `COPY` discards wholesale. It reports that a cache directory survived into a layer, not that anything in the image is wrong.',
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
