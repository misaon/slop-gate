# Measurement records

Numbers that justify a decision in the source, recorded here rather than in the comment above the code.

The comment keeps the conclusion — the sentence that stops someone making the change again. This file
keeps the method and the figures, which are worth having and are not worth reading every time you open
the function. Every entry names the code it belongs to, so the two can be reconciled.

---

## `stats.durationMs` — what a run's wall clock covers

`packages/core/src/run/check.ts`

Left at its default, `durationMs` spans `streamCheck` and nothing else. On a one-shot CLI process that
under-reports the run by about 46%: node boot ~11 ms, the module graph ~40 ms and `loadCliConfig` ~22 ms
all happen before `streamCheck` is entered. A 170.6 ms run reported 112 ms — and a user who times it with
a stopwatch and sees 190 ms has been given a reason to distrust every other number in the report.

A caller that owns its process passes `startedAt: 0`. A long-lived host (the MCP server) must not,
because `performance.now()` there measures server uptime.

## Engine `version()` probes, resolved concurrently

`packages/core/src/run/check.ts`

Four of the engines implement `version()` as a `<tool> --version` subprocess spawn. Resolving one per
assignment inside the run loop put all six sequentially ahead of the first cache lookup.

- Serial sum of all six calls: **65.0 ms**.
- Concurrency removes only the serialisation, so the saving is **32.2 ms of a 227.9 ms warm run**.
- `toolVersionCache` removes the remainder: on a run whose binaries match a previous run's, no probe is
  spawned at all.

An earlier version of this record claimed "66–105 ms of a 240–250 ms run". That was wrong; the figures
above supersede it.

## `PROBE_CONCURRENCY` — why the cache-probe fan-out is bounded

`packages/core/src/run/check.ts`, `packages/core/src/concurrency.ts`

Hashing a file and reading its cache entry are both I/O, one of each per assigned file. An unbounded
`Promise.all` over `assignment.files` holds one half-finished probe and one parsed diagnostics array per
file live at a single instant, so peak RSS scales with the repository — for throughput the fan-out cannot
deliver, since `readFile` runs on libuv's four-wide threadpool and the surplus requests only queue.

| Corpus | Unbounded peak RSS | Bounded peak RSS | Wall clock vs serial |
|---|---|---|---|
| 2,003 files | 208.3 MB | 158.9 MB | 195 ms faster |
| 8,003 files | 449.2 MB | 305.3 MB | 41 ms faster |

## Cache statistics: files, not cache entries

`packages/core/src/run/check.ts`, `stats.filesFromCache` and `stats.cacheByEngine`

A project-granularity engine (§8.1: `tsc`, `knip`) holds one cache entry keyed on every input file's
hash, so any edit anywhere misses it for the whole repository. Because `filesFromCache` requires *every*
assignment for a file to hit, one such miss drags the aggregate to near zero while the per-file engines
were served almost everything: a one-file change on this repository reported `353 analysed · 3 cached`
with 351 of 353 files hitting for both oxlint and ast-grep. The number is not wrong — no file was
untouched by every engine — but read aloud it says the cache did nothing, when it did almost all of it.
That is why `cacheByEngine` exists alongside it rather than replacing it.

Counting cache *entries* instead of files is the other failure mode, and it was real: a warm
`sgate check` printed `337 analysed · 1246 cached`, and left `pretty.ts`'s "(all cached)" branch
unreachable on any repository where one file reaches two engines.

## Duplicate synthetic diagnostics after ast-grep was added

`packages/core/src/run/check.ts`

`config.unused-suppression` and `config.suppression-missing-reason` are synthesised inside
`normalizeDiagnostics`, which runs once per (engine, file). This was unreachable while oxlint was the
only file-granularity engine — `tsc` and knip are project-granularity. Adding ast-grep made it real and
doubled both counts on this repository: **41 → 55** and **4 → 8**.

## Why `deps-security` reads a snapshot instead of the network

`packages/cli/src/engine-registry.ts`, `packages/engine-deps-security/**` (§13.7)

The data a vulnerability check needs is inherently remote, and `sgate check` may not reach the network,
so the fetch moves to an explicit `sgate engines install advisories` and the check reads what is already
on disk. `npm audit` is what happens without that discipline: measured on a tree with **34 real
advisories, `npm audit --offline` exits 0, writes nothing to stderr, and reports none of them**.

Accuracy of the snapshot path against the thing it replaces: matching a lockfile against it reproduces
`npm audit` exactly — **682 advisories across six real lockfiles and 10,671 resolved packages, zero
divergence in either direction**.

Counting `peerDependencies` as a graph edge (`lockfile.ts`): across the same six corpora, four are
unchanged, because everything was already reachable through ordinary dependencies. The axios corpus is
the one that moves — 1,866 to 2,056 resolved packages, 190 additional findings.

## `PROBE_CONCURRENCY` — the sweep the bound was chosen from

`packages/core/src/concurrency.ts`

Warm 2,003-file corpus, 12 hyperfine runs each; peak RSS from `/usr/bin/time -l`, mean of 3.

| Limit | Wall clock | Peak RSS |
|---|---|---|
| unbounded | 415.7 ms ± 8.2 | 208.3 MB |
| 64 | 423.1 ms ± 8.9 | 158.9 MB |
| **32** | **417.6 ms ± 2.5** | **158.9 MB** |
| 16 | 424.1 ms ± 4.1 | 158.7 MB |
| 8 | 442.4 ms ± 14.0 | 159.3 MB |
| 1 | 612.8 ms ± 6.4 | 157.9 MB |

At 8,003 files: unbounded `1.374 s ± 0.032` / 449.2 MB against `1.333 s ± 0.010` / 305.3 MB at 32.

The sweep predates sharing the run's source map with the reporters, so the RSS column is a controlled
comparison of this one variable rather than a current reading — a warm 2,003-file run measures ~199 MB
today.

## What `--timing` instrumentation costs when it is off

`packages/core/src/run/timing.ts`

3,307 spans on a cold run of this repository, because `read-source`, `normalize` and `cache-write` are
measured per *file* rather than per assignment. `packages/core` was built twice from one tree — once with
all 22 wrapper call sites removed — swapping only its `dist` between hyperfine benchmarks in a single
invocation.

| | absent | present and off |
|---|---|---|
| warm (order A / B) | 156.8 ms ± 1.8 / 156.4 ms ± 1.7 | 155.3 ms ± 2.0 / 157.1 ms ± 3.5 |
| cold | 6.123 s ± 0.080 | 6.101 s ± 0.107 |

Per-engine version-probe costs, measured with a span around each: 36.5 ms (tsc), 25.4 ms (oxlint),
13.8 ms (actionlint), 3.0 ms (ast-grep). They are resolved concurrently, so they are deliberately *not*
what `--timing` shows — summing overlapping spans would over-count the wall clock, and the breakdown
reports the fan-out as one `versions` row instead.

## `MAX_CELLS` — why the alignment bound could be raised fourfold

`packages/core/src/fix/align.ts`

1,002,001 cells as the `number[][]` both files used to build took 29–32 ms; 4,004,001 cells as the flat
`Int32Array` takes 22 ms. The worst case the old 1,000,000 bound existed to cap therefore got faster
while the band it covers grew fourfold. Peak memory at the bound is `(n+1)·(m+1)·4` = 16 MB.

## `displayWidth` is the hottest self-time frame in a large run

`packages/reporters/src/display-width.ts`

`--cpu-prof` over a warm run on an 8,003-file / 1.0M-line corpus with 32,000 findings: `displayWidth` was
**534 ms of self time in a 2,021 ms profile — 26.4%, ahead of every I/O frame**. That is what justifies the
printable-ASCII fast path.

`pretty.ts`'s `lineAt`: hyperfine over a 2,003-file / 252k-line corpus with 8,000 findings put
`--format=pretty` at 619.6 ms ± 22.2 before and 608.7 ms ± 12.7 after. Sharing `CheckOptions.sources` with
the reporters is worth 73.7 ms — 417.6 ms ± 2.5 down to 343.9 ms ± 5.9.

## `GROUP_IMPACT.suspicious` — the group default was wrong for 35 of its 54 concepts

`packages/core/src/registry/impact.ts`

The group sat at **1 — "No path to failure. nothing breaks if they do not [fix it]"**, which is a claim about
every concept in it. Censused all 54, against the rule documentation rather than the rule name:

- **35 have a stated failure path.** `promise/always-return` breaks the chain so the caller's `await`
  resolves early; `promise/no-multiple-resolved` silently drops the second result;
  `unicorn/no-array-fill-with-reference-type` shares one array across every slot;
  `oxc/no-this-in-exported-function` is `undefined` after bundling; `react/no-namespace` is documented
  as *not supported by React*; `unicorn/require-post-message-target-origin` means no window receives the
  message at all; `react/react-in-jsx-scope` is a `ReferenceError` under the classic runtime.
- **10 are genuinely untidy** and are now the exceptions: `no-new`, `no-extra-bind`, `no-useless-concat`,
  `no-useless-constructor`, `no-unneeded-ternary`, `no-extraneous-class`, `no-empty-named-blocks`,
  `no-unnecessary-type-constraint`, `consistent-function-scoping`, and `import/no-named-as-default` —
  whose own documentation says the code "won't break at runtime… confusing rather than broken".
- **2 are security**, at 3: `react/jsx-no-script-url` is an XSS sink React 19 refuses to render, and
  `no-implied-eval` is `security.eval-usage` reached through a timer.

So the exception table is 12 rows the other way, against 35 it would need if the default stayed at 1.
oxlint's own definition of the category — "code that is most likely wrong or useless" — is this
vocabulary's 2, and reading it as 1 was a mechanical carry-over from the category name.

Catalogue-wide the census moves **621/294/8 to 580/333/10** across impact 1/2/3.

Two corrections the documentation made to a first pass taken from the rule names: `import/no-named-as-default`
was going to 2 and is explicitly not a runtime problem, and `unicorn/require-post-message-target-origin`
is not a security rule at all — it is correctness, and it carries a documented false-positive mode
(`WorkerGlobalScope#postMessage` has a different second parameter and the rule has no type information
to tell them apart).

`impact.test.ts`'s recorded mismatch list grows from two to three: an XSS sink now reports impact 3 at
`warn`, and so exits 0. That is the same deferred decision the other two entries record, and this is the
strongest case yet for taking it.

## Type-aware linting: what it costs, and what it found

<a id="type-aware-audit"></a>

`packages/engine-oxlint/src/index.ts`, `packages/core/src/registry/elect.ts`

Fifty-nine oxlint rules carry `requires: ['types']`, and until this audit no engine declared
`provides: ['types']`, so `elect.ts` reported every one as `missing-capability` and none could ever own a
concept. They read as `unlisted`, which understated it: they were unreachable, not merely off.

**Wired up, and deliberately not bundled.** `createOxlintEngine` resolves `oxlint-tsgolint`; if it is there
the engine declares the capability and passes `--type-aware`, and if it is not, the 27 promoted concepts
report as a coverage gap with the remedy in `sgate rules why`. Two numbers decide that it is opt-in:

| | without | with |
|---|---:|---:|
| `sgate check` on this repository | 3.1 s | **5.9 s** |
| the same 59 rules, oxlint alone | 0.087 s | **5.73 s** |
| install size | — | **21 MB** (`@oxlint-tsgolint/<platform>`) |

Six platform packages cover the whole CI matrix, unlike `actionlint`, so the only objection is cost. That
puts it on the same footing as the other optional engines (§13.7): present, reported when absent, and never
installed by CI.

**27 promoted of 59.** All 15 `correctness` rules and the `suspicious` and `pedantic` ones that hold a
defect — `no-floating-promises`, `await-thenable`, `no-misused-promises`, `switch-exhaustiveness-check`,
`only-throw-error`, `no-unsafe-enum-comparison`. Nineteen of them are silent on this tree, which is what a
defect finder looks like on a repository already at zero.

**They cost 63 fixes**, and the largest class was real: `no-unnecessary-type-assertion` reported 49
assertions that provably do nothing, and removing them left five type imports dead as well.

### Two things the fix pipeline got wrong, and both are recorded because they were nearly missed

**`sgate fix` derived type-aware fixes against the wrong compiler options.** `derive-fixes.ts` copies the
target files into a sandbox and runs `oxlint --fix` there — and the sandbox holds no `tsconfig.json`, so
tsgolint fell back to defaults. Without `noUncheckedIndexedAccess`, every `array[index]!` looks
unnecessary: the fixer removed six assertions from `position.ts` where the real run reports one, and the
result did not compile. Verified in isolation that the rule itself is correct — given a real tsconfig, and
given one reached through `extends`, it reports nothing on `xs[i]!`. `--type-aware` is therefore
deliberately *not* passed to fix derivation, and the reason is a comment at that call site.

**`no-unnecessary-template-expression` collapsed the splitting that keeps directives out of source.** Six
files write `` `sgate-disable${'-next-line'}` `` so that the file itself never contains a literal
directive — including `reporters/src/agent.ts`, which puts one in a report. The autofix joined them, and
the next run read them as real suppressions: 12 `config.unused-suppression` and 11
`config.suppression-missing-reason` findings appeared out of nowhere. The rule is right that the template
is unnecessary and cannot see what the split is for. Fixed by building the marker from a `const DISABLE`
variable, which is a genuine expression the rule leaves alone and the reader can follow.

### Four rejected, each on what it reported here

- **`unbound-method`** — 10, all method-shorthand properties on object literals returned by factories,
  closing over locals rather than reading `this`. Its only option is `ignoreStatic`.
- **`no-misused-spread`** — 4, all `[...someString]` in the two modules whose subject is counting code
  points. Its `allow` option would exempt the accidental case with the deliberate one.
- **`consistent-return`** — 4, all exhaustive `switch` statements over a discriminated union, where the
  missing fall-through is what makes TypeScript check exhaustiveness. Same argument as `default-case`.
- **`no-unnecessary-type-parameters`** — 2, both a parameter that constrains the implementation rather
  than the call. It counts appearances in the signature only.

**`prefer-readonly-parameter-types` reports 1,123 on its own** and is not promoted; `no-unsafe-type-assertion`
reports 225, which is every `as` that is not provably safe, and is a different rule from the one that finds
the assertions doing nothing.

## Moving the registry's prose out of TypeScript — measured and rejected

`packages/core/src/concepts/curated.ts`, `packages/core/src/registry/not-recommended.ts`

The registry now holds **164 kB of prose in an 878 kB bundle** — 120 kB of concept descriptions and 44 kB
of withheld reasons, 19% of what a user installs. That is enough to ask whether it belongs in `.ts` files
at all, so it was measured rather than argued.

**Cost: about 2.5 ms, and the ranges overlap.** `dist/index.js` was copied twice, once with every
`description:` and `reason:` string replaced by `"x"`, and the two imported interleaved, six runs each:

| | runs | mean |
|---|---|---:|
| full (878 kB) | 96.5 / 93.1 / 93.0 / 89.4 / 90.2 / 91.1 | **92.2 ms** |
| prose stripped (714 kB) | 91.5 / 92.0 / 89.3 / 88.0 / 89.8 / 87.8 | **89.7 ms** |

Uncached, and `bin/sgate.js` calls `module.enableCompileCache()`, which removes most of what that
difference is. Touching the data after import costs **0.07 ms** — the literals are built during module
evaluation and reading them is free. §"`module.enableCompileCache()`" above already measured the other
half of this: the same 922 entries as a `.json` file parse in 22.6 ms against 23.5 ms as a literal, inside
one σ. V8 parses a data literal about as fast as it parses JSON, so extraction buys nothing either way.

**And it costs the type.** `ConceptId` is `(typeof CONCEPTS)[number]['id']` — a union derived from the
literal array, which is what makes a mistyped concept in `presets.ts`, `overrides.ts` or `rule-options.ts`
a compile error rather than a preset that silently enables nothing. JSON or YAML collapses that to
`string` unless a `.d.ts` is generated back, which trades a free guarantee for a build step.

**The split the question is really about has already been made.** AGENTS.md puts the conclusion in the
source, capped at 900 characters by `not-recommended.test.ts`, and the corpus and the method in this file.
That move took 36 kB of prose out of the registry once. The remaining text is not documentation embedded
in logic — those two modules contain no logic — it is the product's content, typed.

What is worth revisiting is bundling rather than authoring: a `sgate check` never reads a withheld reason,
because a withheld rule does not run. Splitting the reasons into a chunk that only `rules why`, `rules
list` and the explorer load would remove 44 kB from the common path. On the numbers above that is worth
well under a millisecond, so it is recorded as available rather than as an improvement.

## The fifty-repository corpus, and what it said about rules that were already on

<a id="rule-corpus"></a>

`packages/rule-corpus`

Every figure this file cited before was taken against a corpus nobody can re-run. This one is a tool:
fifty repositories pinned by commit in `corpus.lock.json`, checked through `sgate check` itself with a
config naming every concept the registry knows, so all ten engines are exercised rather than oxlint alone.
Forty-eight cloned; two refs had moved.

**48 repositories, 66,741 files, 2,352,953 findings from 677 concepts**, with 249 concepts silent across
the whole corpus. Density below is findings per thousand files scanned, which is the only figure
comparable between a 34-file repository and a 6,607-file one.

**The corpus confirmed the audit's rejections and then found the audit's own mistake.** The top of the
table is almost entirely already-`withheld` — `no-magic-numbers` at 2,443/1k, `no-undef` at 2,238,
`sort-keys` at 1,188. What it also showed is that *silent on this repository* had been standing in for
*quiet*, and those are different claims:

| concept | findings | repos | why it is now off |
|---|---:|---:|---|
| `suspicious.react-in-jsx-scope` | 56,079 | 23/48 | the automatic runtime removed the requirement in React 17 |
| `style.jest-require-hook` | 21,629 | 47/48 | fires on `src/index.tsx` and `src/main.ts` — not test files |
| `correctness.shadows-outer-binding` | 10,605 | 46/48 | `children`, `variant`, `err`: how a callback is written |
| `style.jest-consistent-test-it` | 10,613 | 28/48 | what a suite is called, not what it checks |
| `style.arrow-body-style` | 9,546 | 44/48 | whether an arrow body has braces |
| `restriction.no-commonjs` | 7,059 | 36/48 | a module system is a project's decision, not a defect |
| `style.prefer-importing-vitest-globals` | 7,893 | 40/48 | the exact opposite of `no-importing-vitest-globals`, also excluded |

Forty concepts came out on that reading, and two of them are the interesting ones.

**`react-in-jsx-scope` is a default that expired rather than a check that is wrong.** Under the classic
runtime it is correct; the corpus is full of Next.js and Vite projects on the automatic one. What brings
it back is a framework profile reading the JSX transform from tsconfig, which §23 already resolves for
`resolveJsx`.

**`prefer-importing-vitest-globals` and `no-importing-vitest-globals` cannot both be right**, and both were
in the registry — one excluded, the other enabled by this audit. Whichever a project chose, one of the pair
reports every test file it has. That is the shape of collision the corpus is best at finding: on one
repository only the losing half fires.

**What the corpus cannot say.** `types.type-error` reports 42,054 findings across 22 repositories, and
that is an artefact: the corpus installs no dependencies, so every third-party import is unresolved. A
figure from this corpus is about rules that read source, not about rules that need a built project.

## Engine reach and noise floors

- **biome-css** is the quietest engine by design: seventeen rules, of which **thirteen produced no finding
  at all across 1,729 production stylesheets**.
- **Strict-by-default reach**: six of the seven engines are reached by `recommended` on an ordinary
  TypeScript repository — `tsc` via `types.type-error`, ast-grep via four of its six `slop.*` concepts,
  knip via five of its ten, alongside oxlint, `schema` and `biome-css`. actionlint is the exception, and
  structurally so: every one of its entries is `languages: ['github-workflow']`.
- **actionlint** leaves shellcheck's findings on the table deliberately: 149 of 264, 56%, in the session
  that measured it.
- **CLI startup** is roughly 73 ms of a 157 ms run here — about half the wall clock of a warm run.
- **MCP coverage reporting**: on a fixture with no workflows and no actionlint installed, thirteen concepts
  had nothing to check.

## `schema` engine measurement corpora

`packages/engine-schema/**`

826 YAML files from four unrelated repositories (docker/awesome-compose, kubernetes/examples,
actions/starter-workflows, prometheus/prometheus): **six findings, all `duplicate-mapping-key`, zero
`parse-error`**. Two of the six discard a *different* value (prometheus's own `section_key_dup.bad.yml`, a
deliberate invalid fixture, and a Kubernetes secret declaring `type` twice); the rest are redundant
re-declarations. The `yaml` warning "Keys with collection values will be stringified" fired on six files of
the same corpus.

`validate.ts`'s two checks between them collapsed all ten seeded defects in `validate.test.ts` to exactly
one finding each.

Biome's own reporters were surveyed for position data: all nine — `json`, `json-pretty`, `sarif`, `rdjson`,
`gitlab`, `checkstyle`, `github`, `junit`, `concise` — give `{line, column}` only, which is why
`packages/engine-biome-css/src/parse.ts` recomputes byte offsets itself. Unparseable-CSS shapes came from
zulip's PostCSS `$variables` and `%placeholder` selectors and pdf.js's Firefox-only `-moz-pref()`.

## `oxlint` multi-label anchoring

`packages/engine-oxlint/src/parse.ts`, `ANCHOR_LABELS`

`-D all` plus all eleven plugins over this repository's own sources and fixtures produced **27,966
diagnostics from 162 rules, of which 453 were multi-label across eight rules** —
`eslint/no-use-before-define`, `vitest/no-importing-vitest-globals`, `jsdoc/require-param`,
`eslint/no-duplicate-imports`, `unicorn/prefer-export-from`, `oxc/no-map-spread`, `eslint/no-useless-catch`,
`eslint/no-dupe-keys`. For all eight the first label is the offending node. The table is keyed on label
*text* rather than index because oxlint's label array is not offset-sorted.

`engine-astgrep`'s parse-size threshold is a parse-tree property, not a byte count: a 3.7 MB file of
statements parsed, a 4.1 MB one did not, and a 5.2 MB file that was one long comment did.

## Why `resolveJsx` follows `extends`

`packages/core/src/frameworks/tsconfig.ts`

Measured on a 28-package React monorepo: **only 4 of 19 config files set `jsx` at all**, and none of the
four belonged to one of the three Next.js apps that hold most of the `.tsx` — those reach it through
`"extends": "../../tsconfig.app.json"`.

## Generated-file detection survey

`packages/core/src/discovery/detect-generated.ts`

The 164 findings that motivated the `generated` policy were all `@hey-api/openapi-ts` output across five
API packages: 59 unused exports, 45 unused exported types, 30 `as any` casts. The 14 non-generated `.d.ts`
files in the same tree were hand-written module augmentations — `nextAuth.d.ts`, `notistack.d.ts`,
`mui.d.ts`, `global.d.ts`, `react.d.ts` — which is why a `.d.ts` extension is not itself a marker.

## `advisory.ts` must read `affected[].versions`, not only ranges

`packages/engine-deps-security/src/advisory.ts`

Reading ranges only produced **242 findings calling `chalk`, `debug` and `ansi-styles` malware**, and a
range-only reader also silently loses **148 versions-only GHSA entries**. Both directions of the bug are
unrecoverable from the code, so the conclusion stays in the comment.

## `suppressModuleTypelessPackageJsonWarning` verification method

`packages/core/src/config/load.ts`

Verified by running the restore path 30 times in a row against a real typeless `.ts` config with a
distinct, differently-coded warning emitted immediately after restore completed: the unrelated warning
printed every time, this one never did.

## `module.enableCompileCache()` is worth ~26 ms on every run

`packages/cli/bin/sgate.js`

Two hypotheses about the ~77 ms `startup` phase were measured and **refuted** before this one was tried.

*Refuted 1 — the rule registry is not the cost.* `GENERATED_RULE_ENTRIES` is 354,893 bytes, **40.8% of
the 870 kB core bundle**, so it looked like the obvious target. But importing `core/dist/index.js` costs
23.3 ms and touching `RULE_ENTRIES` afterwards costs **0.0 ms** — the array is built during module
evaluation, and evaluating a 334 kB data literal is only ~4.5 ms of that. Making it lazy would help
`--version` and nothing else, since `check` needs all 922 entries for arbitration.

*Refuted 2 — `JSON.parse` is not faster than the JS parser here.* The same 922 entries, extracted to a
`.json` file and to an `.mjs` exporting the literal, over 40 runs each: **22.6 ms vs 23.5 ms**, inside
one σ. V8 parses a pure data literal about as fast as it parses JSON, so moving the registry out of the
bundle buys nothing.

*Confirmed.* The cost is compiling the remaining ~515 kB of actual code, and V8's own bytecode cache
removes it. Interleaved A→B→A, 30 runs per arm, 5 warmups, `sgate check --max-warnings 0` on this repo:

| arm | mean | min |
|---|---|---|
| without compile cache | 150.0 ms ± 2.8 | 146.0 ms |
| **with compile cache** | **124.2 ms ± 3.9** | **120.4 ms** |
| without, repeated | 151.8 ms ± 2.8 | 148.7 ms |

Both control arms agree, so the 26 ms is the cache and not drift. `--timing`'s `startup` row confirms the
mechanism directly: 77.5 → 46.5 ms, against an 18 ms bare-`node` floor that no cache can touch.

## The 20-repository alpha corpus

Run before opening alpha testing: one real, working repository per framework slop-gate claims to
handle, analysed the way a first-time user would — no config file, `--no-cache`, default preset,
optional engines installed. Nine had dependencies installed so `tsc` and `knip` could run; the
before/after figures for those are taken against a run in the same `node_modules` state.

    vuestic-admin · excalidraw · vercel/commerce · immich · elk · tailwindcss.com
    html5-boilerplate · bootstrap · jquery · withastro/docs · svelte.dev · fastify
    hono · elysia · h3 · adonisjs/core · express · ngx-admin · solid-start · preact

|  | before | after |
|---|---:|---:|
| Total findings | 22,329 | **20,255** |
| Error-severity findings | 3,777 | **3,005** |
| Repositories where an engine crashed | 3 | **0** |
| Repositories exiting 3 | 3 | **0** |

The total moves *up* on three repositories, which is the point of two of the fixes:
`vercel/commerce` 36 → 48 and `tailwindcss.com` 192 → 262 are dependency advisories that had been
lost with the engine that crashed reading them.

Largest single movements, by concept:

    suspicious.block-scoped-var    1,041 ->    44   one generated file on fastify
    types.type-error               2,081 -> 1,488   node_modules on solid-start
    suspicious.react-in-jsx-scope  4,378 -> 3,889   preact's own JSX factory

**Not a performance measurement.** Wall clock and peak RSS were checked warm, same checkout, before
and after: solid-start 8,560 ms / 430 MB → 8,598 ms / 386 MB, hono 18,702 ms / 433 MB → 18,929 ms /
436 MB. A first pass had suggested an 11x speedup on solid-start; that was a cold page cache over a
`node_modules` written minutes earlier, and it did not survive a controlled re-run.

## `vitest/valid-title` cannot see a table-driven title

`packages/core/src/registry/overrides.ts`

163 of 174 findings across five repositories are `Title must be a string`, and all 163 are a title
passed as a variable or an expression — `it(should, …)` on immich (157), `describe(name, …)` on
hono, `test(JSON.stringify(t[1]), …)` on h3. None is wrong about the type; the rule only sees that
the argument is not a literal. The remaining 11 are leading or trailing whitespace, which is real.
`error` on a rule that is right 6% of the time fails builds, so the default is `warn`.

## Generated-file markers, second survey

`packages/core/src/discovery/detect-generated.ts`

The path-marker survey above missed the case that costs the most on one file. `fastify/fastify`'s
`lib/config-validator.js` is ajv standalone output named like any other source, and it produced 997
findings — 27% of that repository's total — every one of them `block-scoped-var` on a variable the
generator emits. Its first line is `// This file is autogenerated by build/build-validation.js, do
not edit`, which is the marker the path could not carry.

## Performance profile of the alpha corpus, and what moved

Profiled with `node --cpu-prof`, `strace -c -f`, and repeated cold runs on a 4-core arm64 machine.
All figures below are `--no-cache` medians of 3, taken through `bin/sgate.js` so the compile cache is
in play, and the before/after pair is the same checkout built at two commits.

|  | before | after | peak RSS |
|---|---:|---:|---|
| h5bp/html5-boilerplate (61 files) | 1,156 ms | **449 ms** | 334 → **105 MB** |
| vuestic-admin (239) | 590 ms | **459 ms** | 106 → **93 MB** |
| withastro/docs (2,941) | 2,139 ms | **970 ms** | 405 → **163 MB** |
| immich (3,378) | 7,179 ms | **3,680 ms** | 456 → **326 MB** |
| solid-start (517) | 8,570 ms | **6,237 ms** | 398 → **318 MB** |

CPU:wall over the same pairs went 1.40 → 1.53, 1.28 → 1.51, 1.57 → 1.86, 1.66 → 2.25 and 2.06 → 2.88.

**All 20 reports are identical finding for finding and in the same order**, before and after. That is
the constraint the concurrency change had to meet, not a hoped-for property.

### Where the time was

`readTable` was **40.1% of all CPU self time** on the 61-file repository, with another 13.2% of GC
behind it — one `JSON.parse` of a 42 MB malware table, on every run of every repository, to answer a
few thousand name lookups. Turning the single `security.malicious-dependency` rule off took that
repository from 1,106 ms / 335 MB to 137 ms / 87 MB, which is how the cost was isolated before any
code changed.

On immich the next two were YAML: `parseLockfile` 1,357 ms with the `yaml` package's quadratic
`mapIncludes` at 9.9% of the run on its own, and `inspectYaml` 1,433 ms of which 1,016 ms was the
schema engine parsing the same `pnpm-lock.yaml` a second time, for zero findings.

### Candidates that were measured and rejected

- **`createLineIndex` via `Buffer.indexOf(10)`** instead of `TextEncoder` plus a JS byte loop: 19 ms →
  17 ms over 3.9 MB of real sources. Not worth a change.
- **A Bloom filter for the malware table.** 256 KB and 3 ms at 1% false-positive rate, against 105 ms
  for a names-only `Set`. But a repository probes ~1,425 names, so at 1% the filter is near-certain to
  report at least one false hit and fall back to reading everything; immich matches 20 names for real.
  A sorted index with the records read positionally is exact and needs no such reasoning.
- **Rewriting hot paths in Rust.** The heavy lifting is already native — oxlint, biome, ast-grep,
  hadolint. What was left in JS was JSON and YAML parsing, and all three fixes above delete that work
  rather than making it faster. Re-profile before revisiting.

### Not fixed, and why

`startup` is a flat ~112 ms before any work — `node -e 0` is 25 ms on this machine, so ~87 ms is
slop-gate's own module graph *with* `enableCompileCache()` already applied. On a warm 256 ms run that
is a third of it. A V8 startup snapshot is the untried lever; lazy-loading the registry and
`JSON.parse`-ing it were both measured and refuted (above).

---

# Evidence for the registry's exclusions and options

`registry/not-recommended.ts` and `config/rule-options.ts` keep the conclusion — the two or three
sentences that stop someone making the decision again. This is the working: the corpus, the
per-repository split, the options that were swept and what they returned.

Each entry's `evidence` field names the anchor below. Following the same convention as the rest of
this file: the source states the conclusion, this states the method.


## knip/files — the composition is the argument, not the count

<a id="knip-files"></a>

Promoted into `recommended` once, on a re-measurement taken against the NestJS-shaped fixture after §23 framework awareness landed — which is to say, against the very cases the profiles had just been written to fix. A 145k-line React monorepo (28 workspace packages, 1,251 TypeScript sources) took it straight back out: **105 findings**, of which at least 98 are a file that is loaded but not imported.

**The composition is the argument, not the count.** Those 98 decompose into six unrelated conventions: 60 Cucumber step definitions and page objects globbed by a `cucumber` config, 17 configs for an in-house licence checker, 11 `.mdx` content files, 5 `@hey-api/openapi-ts` configs, 3 `lighthouserc.js`, and a `public/serviceworker.js` that is served rather than imported. No predicate covers that set. The nearest candidate — "a file referenced only by some tool's own config" — is not decidable without understanding each tool's config format, which is executing repository code by another name (spec §23.5 forbids it). So this is not a gap that four more framework profiles close; it is what the concept *is* on a repository that uses more tools than knip has plugins for, and knip ships around 100 of those.

The concept stays available and unchanged — `'dead-code.unused-file': 'warn'` in a config restores it, and a repository whose conventions knip does cover gets a genuinely useful check. What it must not be is the *default*, where its first impression is 105 findings nobody can act on. **This does cost real coverage**: a genuinely dead file now goes unreported by default, and 7 of the 105 above (five `src/v*/index.ts` package entry points among them) could not be explained away and may well have been true positives.


## actionlint/runner-label — 308 of 447, zero true positives

<a id="actionlint-runner-label"></a>

The largest single finding class in the whole corpus measurement and the least useful: **308 of 447 findings (69%), zero true positives**, across 7 of 17 repositories. Every one is a runner label that is legitimate and that actionlint has no way to know about — depot.dev (`depot-*`, 9 distinct labels), namespace.so (`namespace-profile-*`), grafana's and vercel's own larger and self-hosted runners, and 18 findings for `ubuntu-26.04`/`ubuntu-26.04-arm`, which are *real GitHub-hosted runners* that actionlint 1.7.12 predates. cpython's own committed `.github/actionlint.yaml` declares those two with a comment citing the upstream pull request that adds them, which is the affected project reaching the same conclusion independently.

actionlint's answer is `self-hosted-runner.labels` in `.github/actionlint.yaml`. That is not available to us: spec §13 is explicit that users never see or maintain engine-native config files, and reading theirs would only half-solve it anyway — honouring each repository's own config removes 191 of the 308 and leaves 117 in the five repositories that ship no config.

**The rule itself works** — an authored `runs-on: ubuntu-lastest` is caught, proved by fixture — so the problem is the allowlist, not the check. Revisit when slop-gate has a first-class way to declare a repository's own runner labels in `slop-gate.config.ts`, which this adapter would then translate into its ephemeral actionlint config. At that point the rule catches a real class of typo that nothing else does.


## actionlint/action — nondeterministic, and why no fingerprint rescues it

<a id="actionlint-action"></a>

Two independent reasons, and the second is the disqualifying one.

**It is nondeterministic.** Across ten identical runs over the same 403 files, this rule — and only this rule — produced a different set of findings each time (442–447 findings per run; 441 stable, 6 not, all of them `could not parse action metadata`). The mechanism is exact: `LocalActionsCache.FindMetadata` (`action_metadata.go:255-281`) reports a metadata parse failure only on the *uncached* lookup and writes `nil` on failure, so whichever reference reaches a broken local action first reports it and every later one silently gets a cache hit. actionlint lints files concurrently (`linter.go:347`, an `errgroup` sharing one cache) **and iterates a workflow's jobs over `Jobs map[string]*Job`, whose order Go randomises** — so this is unstable even for a single file in a single process: ten runs over one file put the same finding on line 99, 71, 316 and 359. Per-file invocation does not fix it.

**And no fingerprint scheme rescues it, which is worth stating precisely because the obvious summary — "fingerprints are position-based, so they thrash" — is not what §10.1 does.** A fingerprint hashes no line or column number at all; it hashes the *text* of the line the finding lands on. So a column moving within a line is free, and the emission order of a file's findings is free too (`FingerprintInput.occurrenceIndex`). What is not free is the same finding being attributed to a different line, because that line reads differently — and a finding that is simply absent from the next run has no fingerprint to stabilise in the first place. Both of those are what this rule does, so a baseline over it would churn no matter how the hash is computed. Keeping it out of `recommended` is the fix; there is no other one.

**And it is imprecise.** 10 findings, 1 true positive (a Docker action whose `runs.image` names a file not called `Dockerfile`). The other 9 are all `could not parse action metadata in "…": unexpected key "type" for definition of input "…"` — a `type:` key under a composite action's `inputs`, which is genuinely not in GitHub's action metadata schema and which GitHub genuinely ignores at run time: the actions concerned are bun's `setup-bun` and oxc's, used by nearly every workflow in those repositories. Correct-but-inert, and the message overstates it — the real consequence is that actionlint then stops checking that action's inputs at all.

Excluded as a whole rule rather than by message pattern: the nondeterminism argues against the rule, not against one of its messages, and the one true positive is not worth an unstable fingerprint.


## actionlint/syntax-check — a schema compiled into a pinned binary

<a id="actionlint-syntax-check"></a>

9 findings, 2 true positives, 7 false — and all 7 are the same failure mode, which is the reason to exclude rather than the count. actionlint validates workflows against a schema compiled into the binary, so **every GitHub Actions feature that ships after a release reads as an unexpected key until the next one**. The 7 are exactly that: 5 for parallel/background steps (`background: true` and `wait:`, [shipped 2026-06-25](https://github.blog/changelog/2026-06-25-actions-steps-can-now-be-run-in-parallel/)) and 2 for `concurrency.queue: max` ([shipped 2026-05-07](https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues/)). Both were confirmed against GitHub's own changelog rather than inferred.

This recurs by construction, and because we pin the binary the staleness is **our** choice on the user's behalf: someone whose `PATH` already holds a newer actionlint gets fewer false positives than someone we downloaded for. That is an argument for tracking upstream releases actively (recorded in the M0 follow-ups), and against putting a rule whose false-positive rate is a function of our own release cadence into `recommended`.

The 2 true positives — `secrets:` nested under `workflow_dispatch`, where only `workflow_call` takes it, and a YAML sequence passed to an action input that must be a string — are real but do not carry the rule. Separately: this entry claims only `config.workflow-syntax`. actionlint reports YAML parse errors and duplicate keys under the same `kind`, and the adapter drops both classes because the `schema` engine owns them for `github-workflow`.


## The four CSS house-style rules — 11,525 findings, zero defects

<a id="biome-css-house-style"></a>

**House style, not a defect — the largest single class in the whole measurement.** 5815 findings across 376 of 1729 production stylesheets, and not one of them a bug: the rule's entire content is a preference for `hsl()`/`oklch()` over `#rrggbb`. It fires in 9 of 10 corpus repositories at 0.7 to 103 findings per thousand lines, so there is no repository shape that escapes it.

Together with the three entries below this is 11,525 of the engine's 12,125 findings and zero of its ~27 real defects. A first `sgate check` on a CSS codebase emitting eleven thousand findings with no defect content does not teach a user that their stylesheets are untidy; it teaches them that this tool is noise, permanently, and takes the eighteen rules that *are* defects down with it.

**Not a verdict on the rule.** A project that has adopted a colour-model convention and wants it enforced enables `style.css-hex-color` and gets exactly this. That is what the full entry in entries.uncatalogued.ts is for. What is being rejected is only the claim that it belongs in a default quality gate.


### biome-css/noDescendingSpecificity

2206 findings in 435 files — **a quarter of every stylesheet measured** — in 8 of 10 repositories at 2 to 19 per thousand lines. Twelve were read across eight repositories and every one was ordinary, correct CSS: `li, dt` in django's admin, `.timelist a:active` in its widgets, `ul.messagelist li` in its responsive sheet.

The rule asks that selectors appear in non-descending specificity order so that source order decides the cascade. Real stylesheets are grouped by component, and that is not a defect — it is how they are maintainable. Same class as `noHexColors`: available by concept for a codebase that has genuinely committed to specificity ordering, out of `recommended` for everyone else.

**The sample was twelve, not 2206**, and the decision does not rest on the difference: at ten findings per thousand lines the rule is excluded whether its true-positive rate is 0% or 2%. Read the count as the reason, not the sample as precision.

### biome-css/useBaseline

2002 findings in 467 files. **What this rule reports is a property of the project's browser targets, which slop-gate does not know** — so on any given repository it is either entirely right or entirely irrelevant, and nothing in the run can tell which. The corpus makes the point: 307 findings against Visual Studio Code, an application that ships its own Chromium.

By volume: `light-dark()` 813, `::selection` 385, `user-select` 259, `mask-image` 132. Those are intentional modern CSS, and `::selection` and `user-select` are universally supported in practice whatever Baseline's 30-month window says.

Revisit if slop-gate ever grows a first-class way to declare a repository's browser support floor — a browserslist-shaped input the adapter could translate into this rule's own options. At that point it becomes a genuine correctness check rather than a policy nobody configured.

### biome-css/noImportantStyles

1502 findings in 323 files, 1071 of them Visual Studio Code alone. `!important` overused makes a cascade impossible to reason about; used deliberately it is how a theming layer wins against a component library it does not control, which is exactly what a 1071-finding editor is doing. Distinguishing the two needs to know the codebase's conventions, and a linter that does not is just counting a keyword.

The fourth of the four house-style rules, excluded on the same argument, available by concept as `complexity.css-important` for a team that has decided it wants no `!important` at all.

## The two CSS rules waiting on preprocessor detection

<a id="biome-css-preprocessor"></a>

**Revisit trigger, not a verdict.** 26 findings, 0 true positives — and the rule is right in every one of them about what plain CSS defines. 25 are `@extend` (zulip, compiled by PostCSS) and 1 is `@tailwind` (Tailwind v3). Both are valid input to their own build step and never reach a browser as written, so this measures a corpus containing two preprocessed projects, not a check that is wrong.

**The condition that puts it back in `recommended`: a framework profile that detects a CSS preprocessor and stands the rule down there.** The signals are concrete and already inventory-visible — a `postcss.config.*`, a `postcss`/`postcss-preset-*` dependency, a `tailwindcss` dependency, or `@extend`/`@tailwind`/`@apply` in the file itself. In a repository that genuinely ships plain CSS this rule catches a misspelled at-rule, which nothing else does, and CSS silently discards.

Note what would go wrong if this were recorded as "inaccurate rule" instead: a future reader comparing it against `noUnknownUnit` — which is genuinely, reproducibly wrong about `1x` — would have no way to tell the two apart, and would either fix neither or delete both.


### biome-css/noUnknownFunction

**Revisit trigger, on the identical condition as `noUnknownAtRules` above.** 3 findings, 0 true positives, all three the same function in one file: Mantine's `alpha()`, provided by `postcss-preset-mantine` and compiled away before a browser sees it. The rule is correct that CSS defines no `alpha()`.

Stands down under the same preprocessor detection, and returns to `recommended` with it. On a plain-CSS repository an unknown function means the whole declaration is dropped at parse time, which is a real and completely invisible failure.

## vitest/valid-expect — the option that is correct and still not promoted

<a id="vitest-valid-expect"></a>

A narrow oxlint defect, reproduced directly against 1.76.0 and stated in terms of the `code` field actually observed rather than the plugin scope it was found under. `vitest/valid-expect` reports "Expect takes at most 1 argument" whenever `expect`'s second argument is anything other than a *string literal*: `expect(x, 'msg')` is accepted, `expect(x, key(x))` is not. Both are legal — vitest declares `<T>(actual: T, message?: string): Assertion<T>` (`@vitest/expect` 3.2.7, `dist/index.d.ts:165-166`), and a computed string is still a string. Measured on this repository: 27 diagnostics, all `code: "vitest(valid-expect)"`, all the computed-argument form, 27/27 false positives. `jest/valid-expect` is deliberately NOT excluded — it reports the same message on the same code, and there it is correct, because jest's `expect` genuinely takes one argument. Verified by running each rule alone: over this repository jest reports 37 and vitest 27, and the 10 it does not report are exactly the string-literal calls the vitest rule correctly allows.

**The option sweep found a live candidate here and deliberately stopped short of promoting it, because the measurement splits.** The rule accepts `maxArgs`, and `maxArgs: 2` is not a workaround but the literally correct statement of vitest's signature — the one this reason already quotes, `<T>(actual: T, message?: string)`. It removes exactly the defect described above and nothing else: verified against a fixture carrying every other thing the rule checks, `expect` with no matcher, `expect()` with no argument and an un-awaited async matcher all still fire, and `expect(1, 2, 3)` is still caught as genuinely too many.

Then the numbers diverge. **On this repository: 48 findings on defaults, 0 with `maxArgs: 2`** (up from the 27 above; the repository grew, the ratio did not). **On the 32,035-file third-party corpus: 18 either way** — the option changes nothing, because nobody else passes a computed second argument to `expect`. So the false-positive class it removes is close to a slop-gate house idiom, and a promotion cannot rest on 'it fixes our repository'.

What the promotion needs, and what this sweep did not do: audit those 18 corpus findings (nest 10, hono 4, vue core 2, prettier 2) to establish the rule has defect content on code that is not ours. If they are real, this comes out of the table and goes into `config/rule-options.ts` with `['error', { maxArgs: 2 }]`. Note the extra care that needs: the rule is `correctness`-category, so removing the exclusion puts it into `GENERATED_RECOMMENDED_RULES` at its *default* configuration and the optioned table has to override it afterwards — which means a later deletion of that row silently restores the 48. `eqeqeq` has no such trap, because nothing else puts it in `recommended`.


## import/no-unassigned-import — the allowlist sweep

<a id="import-no-unassigned-import"></a>

Measured across both repositories this generator was validated against: 5 findings total (1 on slop-gate itself, 4 on the srvc-bat playground), every single one a deliberate, canonical side-effect-only import — `import 'reflect-metadata'` (a jest setup file), `import 'dotenv/config'`, `import './custom.css'` (a VitePress theme), and `import '@/tracing'` (app startup instrumentation), plus this repo's own CLI entry shim (`import '../dist/main.js'`). These are the textbook use case side-effect imports exist for, not an accidentally-unused import — 5/5 (100%) false positives across two independently-chosen, unrelated codebases.

Swept for a rescuing option. It has exactly one, `allow`, taking globs — and the sweep is why this entry now carries a third-party number it never had: **3,000 findings over the 32,035-file corpus**, against the 5 this reason was originally written from. A generous generic allowlist (`**/*.css`, `**/*.scss`, `**/*.less`, `**/*.sass`, `reflect-metadata`, `dotenv/config`, `**/polyfills*`) brings that to **1,662**, which is still two orders of magnitude past anything in `recommended`. The residue is what an allowlist cannot generalise over — application-local startup imports like `@/tracing` and this repository's own `packages/cli/bin/sgate.js` shim, which are legitimate and unguessable. Same shape as `biome-css/useBaseline`: the option exists, and the value it would need is a fact about the project that slop-gate does not know.


## unicorn/no-array-sort — allowAfterSpread, checked and rejected

<a id="unicorn-no-array-sort"></a>

Measured on this repository: every one of 21 occurrences — not a sample, all of them — is `[...x].sort(...)`, `x.map(...).sort(...)` or `Object.entries(x).sort(...)`: sorting an array just derived from a spread, map or filter, which nothing else holds a reference to. That is this codebase's standard idiom for deterministic ordering (`compareStrings`-based sorts appear this way throughout, including in this generator's own source), and the rule cannot tell that pattern apart from mutating a caller-owned array in place, which is the real bug it exists to catch. 21/21 (100%) false positives here specifically because of how this codebase happens to call `.sort()`, not because the rule is wrong in general — the same category of gap as typescript/no-extraneous-class below, applied to a different rule.

**Re-checked once per-rule options could reach an adapter, because this exclusion's own wording — "sorting an array just derived from a spread" — names an option oxlint offers: `allowAfterSpread`. It does not rescue the rule.** Measured on this repository at oxlint 1.76.0: 95 findings on defaults, **50 with `allowAfterSpread: true`** (and 50 with `allowExpressionStatement` added, which changes nothing here). The option covers the literal `[...x].sort()` form only, and the residue is the other half of the same idiom — `x.map(...).sort()`, `x.filter(...).sort()`, `Object.entries(x).sort()` — which the rule cannot tell from mutating a caller-owned array either. Recorded so the next reader does not repeat the measurement, and as the counter-example to `pedantic.eqeqeq`, where the same question got the opposite answer (see config/rule-options.ts).


## no-underscore-dangle — 135,767 findings, the largest ever measured here

<a id="no-underscore-dangle"></a>

Measured against the srvc-bat playground: 5 of its 6 total `recommended` findings are this rule, every one flagging the same identifier (`request_`) at its point of declaration, repeated across one file (test/test-runner.ts:133,151,163,175,187) — confirmed deliberate, not careless: that file imports `* as request` from `supertest` (line 15), so every method-local `request_` is systematically avoiding a collision with that already-imported name, the same convention applied consistently five times over. Not a defect. Same class as typescript/no-extraneous-class above: oxlint files it under `suspicious`, but the category is not the arbiter of whether it belongs in `recommended` — whether a finding represents something a competent developer would actually want to change is, and a trailing underscore adopted on purpose to dodge shadowing an outer binding does not. A quality gate that argues with a codebase's own naming convention on every run teaches its user to ignore it.

**Swept for a rescuing option and it is the strongest exclusion in this table, not the weakest.** It has ten (`allow`, `allowAfterThis`, `allowFunctionParams`, `allowInObjectDestructuring`, and so on), and turning on every one that could plausibly apply takes it from **135,767 findings to 5,255** over the 32,035-file third-party corpus — a 96% reduction that still leaves more findings than every rule in `recommended` produces combined. The default figure is the largest of any rule ever measured for this registry. None of the options addresses the case this exclusion is actually about either: `allow` is an exact-name list, so exempting a *trailing* underscore adopted to dodge a shadowed import means naming each identifier, which is a per-repository decision and not a preset's to make.


## no-implied-eval — a rule that loads and never fires

<a id="no-implied-eval"></a>

Verified directly against oxlint 1.76.0: `number_of_rules: 1` (the rule is genuinely active) but zero diagnostics against every canonical trigger pattern (setTimeout/setInterval/Function/execScript with a string-literal first argument). A rule that never fires is worse than no rule — recommending it would claim coverage of `security.implied-eval`-shaped bugs this registry does not actually provide. Dropped from the M0 hand-written registry for the same reason; recorded in docs/superpowers/specs/2026-07-31-m0-followups.md, "Test gaps worth closing". Scoped to the bare `eslint`-scope rule specifically — `typescript/no-implied-eval` is a separate, type-aware rule (excluded from `recommended` on that basis alone regardless of this entry).


## The `perf` and `nursery` audit — 27 rules read, 4 rejected, 13 promoted

<a id="perf-nursery-audit"></a>

Both categories in full, against each rule's documentation rather than its name. Counts are from every
oxlint rule enabled at once over `packages`, `apps` and `scripts` — 34,727 diagnostics from 186 rules on a
tree that reports none under the 349 in `recommended`.

**`no-await-in-loop` — 77, and the shape is the argument.** 74 distinct lines across 39 files: sequential
`readFile`s inside a bounded loop, ordered writes into a sandbox, and test assertions. One of the 77 is
`const sources = await Promise.all(…)`, reported because that already-parallel call sits inside an outer
loop. The rule takes no options, and §`PROBE_CONCURRENCY` above is this repository measuring the opposite
of its advice: unbounded fan-out cost 49 MB of peak RSS to save 41 ms.

**`oxc/no-map-spread` — 8, all the same shape.** Every one is `.map(([key, value]) => ({ key, ...value }))`
building a record from a `Map` entry: a fixed-size spread, not an accumulator. The rule's own documented
replacement is `Object.assign(element, …)`, which mutates the element in the array being mapped.
`oxc/no-accumulating-spread`, which catches the genuine quadratic case, is in `recommended` and reports 0.

**`no-undef` — 564, zero true positives.** 20 distinct names: `process` 383, `AbortSignal` 55,
`TextEncoder` 35, `AbortController` 27, `TextDecoder` 18, `Response` 8, `fetch` 7, `performance` 7, `URL` 6,
`Buffer` 3, `setImmediate` 3, and so down. The twentieth is `work`, in
`engine-astgrep/fixtures/swallowed-error.positive.js` — a deliberately-invalid fixture. It would need an
`env`/`globals` declaration, and §13 has the engine write rules, categories and plugins and nothing else.

**`no-unreachable-loop` — 2, both false.** `cache/atomic-write.ts:27` is `for (let attempt = 0; ; attempt += 1)`
whose `catch` rethrows past the retry budget and otherwise `await delay(…)`s and continues. The rule does not
follow the path that leaves a `catch` without throwing.

**`react/no-array-index-key` — 3, and all three false, which is not the same as the rule being wrong.**
Every one is `prose.tsx`, a component that re-derives its whole list from one string and never reorders or
filters it; there an index key is the *better* one, because a content key would remount every node whenever
the text changed. The rule cannot see which shape it has. Withheld as a revisit trigger rather than promoted,
because 3/3 is a fact about one file and this corpus has no React application to measure against.

**Promoted, 12:** `perf` — `prefer-array-find`, `prefer-array-flat-map`, `prefer-set-has`, `no-useless-call`,
`jsx-no-constructed-context-values`, `no-object-type-as-default-prop`. `nursery` — `import/export`,
`import/named`, `promise/no-return-in-finally`, `react/require-render-return`, `no-useless-assignment`,
`unicorn/no-useless-iterator-to-array`. Six carried a mechanical `nursery.*` concept id, which is a category
name and not a durable config key, so `overrides.ts` re-homes them first.

They cost this repository four fixes, all of them improvements: a dead `let stdout = ''`, and two
`filter(…).at(-1)` chains that are `findLast(…)` — the same value without materialising the matches.

**Left `unlisted`, and why they are not `withheld`:** the four `react-perf/jsx-no-new-*` rules and
`react/react-compiler` fire on inline props and hook shapes that are idiomatic React, and 0 findings on a
corpus with no React application in it says nothing about them. They need a measurement before they get a
verdict, not a reason written from the rule name. `no-restricted-exports` has no content at all without an
option naming what to restrict, which is a per-repository decision.

## The `pedantic` audit — 104 reachable rules, 57 promoted and 30 rejected

<a id="pedantic-audit"></a>

`pedantic` is oxlint's largest category outside `correctness` and `style`, and the generator promotes none of
it. Read in full: 21 of its 125 rules are type-aware and unreachable (see the record above), leaving 104.
Counts are from the same all-rules run — 34,727 diagnostics over `packages`, `apps` and `scripts`.

**30 fire here, and reading them is what decides the category.** They divide cleanly:

| class | rules | findings | what they are |
|---|---|---:|---|
| hardening with no defect | `require-unicode-regexp` | 305 | ASCII patterns where `u` changes nothing |
| the signature is the contract | `require-await` | 113 | `async version()`, `async dispose()` — interface implementations |
| cannot see the test's shape | `no-conditional-in-test` ×2 | 306 | mock factories and table-driven loops, no conditional assertion |
| threshold is not ours to pick | `max-*` ×5, `import/max-dependencies` | 113 | a number, not a property |
| restates the signature | `jsdoc/*` ×9 | 57 | what AGENTS.md forbids in so many words |
| style | `no-inline-comments`, `no-negated-condition` ×2, `prefer-single-call`, `escape-case`, `no-else-return`, `no-lonely-if` ×2, `sort-vars`, `explicit-length-check` | 66 | preference |
| no arity to check against | `no-array-callback-reference` | 24 | `.map(ruleRefKey)`; the real bug is `.map(parseInt)` |
| TypeScript names `undefined` | `no-useless-undefined` | 37 | `() => undefined` satisfying `X \| undefined` |

**`unicorn/prefer-math-trunc` is the one that would have introduced a bug.** Its 3 findings are the `>>> 0`
in a seeded PRNG, where the shift is coercion to uint32 and not truncation — `Math.trunc` does not wrap at
2³², and the generator would stop matching its reference implementation. Bitwise-as-truncation and
bitwise-as-uint32 read identically and the rule cannot separate them.

**57 promoted, and they cost this repository nothing** — every one is silent here, which is what a rule that
finds defects rather than habits looks like on a tree already at zero. `no-constructor-return`,
`no-prototype-builtins`, `no-case-declarations`, `no-fallthrough`, `radix`, `array-callback-return`,
`no-self-compare`, `no-throw-literal`, `no-new-wrappers`, `unicorn/no-object-as-default-parameter` (one
mutable default shared by every call), `unicorn/new-for-builtins`, `unicorn/prefer-import-meta-properties`,
and the rest of the `unicorn/prefer-*` modernisations AGENTS.md's syntax rule already asks for.

**Three are re-homed by `overrides.ts`, because `pedantic` is the wrong place to look for them:**

- `react/rules-of-hooks` → `correctness.rules-of-hooks`, at `error`. React identifies hooks by call order;
  one behind a condition shifts every later hook onto the wrong slot. That is not a strictness preference.
- `react/jsx-no-target-blank` → `security.target-blank`, and impact 2 rather than the group's 3: every
  current browser implies `noopener` on a `_blank` link, so it is a hole only where one does not.
`typescript/ban-ts-comment` keeps its `pedantic.ban-ts-comment` id and takes an impact exception to 2
instead. Verified empirically against 1.76.0, because the documentation does not state its defaults: it bans
`@ts-ignore` outright and requires a description of three characters or more on `@ts-expect-error`. That is
AGENTS.md's own rule — no `@ts-ignore` without a reason on the same line. Re-homing it to `slop.*` was tried
and reverted: `engine-astgrep/src/rules.test.ts` gates that namespace on a per-concept measurement, and
"AGENTS.md already says so" is not one.

`pedantic.*` ids are kept for the other 55.

**`prefer-code-point` cost a measurement and one suppression.** Four of its five findings are
`String.fromCharCode(27)` and became `fromCodePoint`. The fifth is `isPrintableAscii`'s loop in
`display-width.ts`, which §`displayWidth` above records as the hottest self-time frame in a large run:
`codePointAt` there is **3,278,883 hz to 2,928,794 — 10.7% slower at ±0.11% rme**, and the predicate is
unchanged either way, since a surrogate half fails `code > 0x7e` exactly as a code point does. It carries
an inline `sgate-disable-next-line` with that figure, which is what the directive is for. Unlike `nursery`, the label does not expire, and
`pedantic.prefer-ts-expect-error` was already in `recommended` under that name.

## The `restriction` audit — 95 reachable rules, 38 promoted and 37 rejected

<a id="restriction-audit"></a>

`restriction` is a menu upstream, not a standard — oxlint files a rule here when it forbids something on
preference. **All 37 that fire on this repository are preferences, and several are mutually exclusive with
rules in the same category.** The four largest are the shape of it: `vitest/require-test-timeout` reports
1,790 findings, one per test; `oxc/no-async-await` 1,190, banning `async`/`await` outright;
`oxc/no-optional-chaining` 712; `no-undefined` 542.

Two of the 37 are worth reading rather than counting.

**`react/no-unknown-property` — 187, zero true positives, one cause.** Every one is `class=` in a Preact
component, where the DOM attribute name is the correct one and `className` is the alias. The rule carries
React's property table and has no way to know which renderer it is looking at. It stands down under
framework detection (§23), which the inventory already has the signal for.

**`typescript/no-non-null-assertion` — 234, and this one is uncomfortable.** AGENTS.md does say null and
undefined go explicit rather than through `!`. Nearly all 234 are `array[index]!` under
`noUncheckedIndexedAccess`, immediately after a bound was checked, where the alternative is a branch that
cannot be taken and cannot be tested. The rule is right about the pattern AGENTS.md means and wrong about
the one that dominates the count. Recorded rather than resolved.

**38 promoted, all silent here, and they are the ones that restrict for a reason.** Four hold a defect a
reader would otherwise ship: `react/button-has-type` (a `<button>` with no type submits the form around
it), `promise/catch-or-return`, `oxc/bad-bitwise-operator`, `typescript/no-empty-object-type` (`{}` means
anything non-null, not an empty object). Eight enforce what AGENTS.md already states about ESM —
`no-commonjs`, `no-require-imports`, `no-var-requires`, `no-amd`, `no-dynamic-require`,
`no-webpack-loader-syntax`, `prefer-node-protocol`, `no-new-require`. And `react/no-danger` is re-homed to
`security.dangerous-html`: it is the one React API that writes unescaped markup into the document.

**`import/no-cycle` found a real cycle, and it is now `error`.** Its 2 findings were
`frameworks/profiles.ts` ⇄ `frameworks/detect.ts`, and the cycle was safe **only by hoisting**:
`profiles.ts` calls `defineProfile(…)` at module-evaluation time, and `detect.ts` reads
`FRAMEWORK_PROFILES` only inside a function body. Entering `detect.ts` first is therefore fine — but only
because `defineProfile` and its three siblings are `function` declarations. Rewriting any one of them as a
`const` arrow would have turned it into a `ReferenceError` at import time, on a path that depends on which
module the bundler happens to enter first.

Fixed by inverting the layering the cycle was a symptom of: `detectFrameworks` now takes `profiles` as a
required input instead of reaching back for a default, so `detect.ts` is a pure engine over the profiles it
is handed and no longer imports the module built out of its own helpers. One production call site passes
`FRAMEWORK_PROFILES`, which core now exports.

## The `style` audit — 270 reachable rules, 65 promoted and 96 rejected

<a id="style-audit"></a>

**All 96 that fire here are formatting or house style, and not one holds a defect.** `oxfmt` owns the
formatting half and does not want a second opinion; the rest is a decision a team makes once. The scale is
the argument: `sort-keys` 4,513 — the largest count ever recorded here — `no-magic-numbers` 2,517,
`prefer-expect-assertions` 1,828 (one per test), `require-top-level-describe` 1,799, `curly` 936.

Two pairs in there cannot both be right, which is the clearest statement of what the category is:
`import/no-named-export` (930) and `import/no-default-export` (15, in `restriction`) forbid each other, and
`no-negated-condition` and `unicorn/no-negated-condition` want the inverse of what `no-else-return` does.

**But 65 of the 174 silent ones hold a defect, and oxlint files them here anyway.** That is the finding:
`style` is not a category of harmless rules, it is a category of rules sorted by how often people argue
about them. `no-return-assign` catches `return a = b` where `===` was meant; `unicorn/error-message` catches
`new Error()` with nothing in it; `prefer-promise-reject-errors` catches a rejection that arrives with no
stack; `guard-for-in` catches a `for…in` that walks the prototype; `no-identical-title` catches two tests
with one name; `import/no-mutable-exports` catches a `let` export whose value changes under its consumers.

**A spot-check found the first pass had a hole, and the hole was in the method.** The 174 silent rules
were read one by one and the 96 firing ones were read from the top down — which left the tail dismissed as
a class. `unicorn/prefer-negative-index` fires once here, so it was never in the silent list, and it is the
third of a family whose other two (`prefer-at`, `no-length-as-slice-end`) were promoted. Re-reading all 73
that remained produced four more promotions and three more rejections:

- **`unicorn/prefer-negative-index`** and **`unicorn/custom-error-definition`** — the second is 2 findings
  and both real: `class KeyedTableFormatError extends Error {}` reports as `Error` in every log and
  serialised payload, because `name` comes from the prototype.
- **`vue/require-typed-ref`** — `ref()` with neither a type argument nor an initial value is `Ref<any>`,
  which its documentation says passes `noImplicitAny` without being checked.
- **`no-interpolation-in-snapshots`**, both twins — its documentation is explicit that interpolation stops
  the runner rewriting the snapshot, which is a broken update mechanism rather than a style.
- Rejected: **`no-template-curly-in-string`** (9, all `${{ }}` GitHub Actions expressions written as text),
  **`unicorn/prefer-structured-clone`** (2, at least one a deliberate JSON round-trip modelling transport)
  and **`jest/no-done-callback`** (2, both `test.for(TABLE)(…)` whose row parameter the jest rule reads as
  a `done` callback).

**Four of eight guesses made from the rule name were wrong, and the documentation is what caught them.**
`unicorn/require-module-attributes` flags an *empty* `with {}` rather than a missing one.
`jest/no-test-prefixes` is a spelling preference that accepts `it.only`, so it does not catch a committed
focused test. `vue/define-props-destructuring` is style, and its default asks for the opposite of what the
name suggests. `vue/require-default-prop` its own documentation calls a convention rather than a
correctness problem. None was promoted.

**Four are re-homed into `security`, and one of them exposed a modelling mistake worth recording.**
`no-new-func` and `no-script-url` were first mapped onto `security.eval-usage` and `security.script-url`
alongside the rules already there — and the dogfood reported `config.rule-overlap`: two rules on one concept
go to arbitration, and the loser is switched off. Mapping `no-new-func` onto `eval-usage` would have stopped
`new Function` being checked at all. One concept per rule, always; the sharing that arbitration exists for is
between *engines*, not between two rules of one engine that read different syntax.

The security line the audits settled on: a rule that reports **an API a caller may be using safely** is
impact 2 — `security.target-blank`, `security.dangerous-html`, `security.script-url`,
`security.jsx-script-url`. A rule that reports **a hole whatever the value** is impact 3 at `error` —
`security.eval-usage`, `security.function-constructor`. That also closes the third entry this audit
briefly added to `impact.test.ts`'s mismatch list: the XSS sink now reports where it belongs.

## knip's dependency rules, and oxfmt as a gate

<a id="engine-audit"></a>

The six non-oxlint rules no preset named, trialled against this repository rather than argued from
their descriptions.

**`knip/dependencies` and `knip/devDependencies` — 5 findings, 5 false, one cause.** Every one is a
dependency that is used and never imported: `oxlint` and `oxfmt` are resolved by path from their engine
packages so a binary can be spawned, `@commitlint/cli` is invoked by CI through `pnpm exec`,
`@misaon/slop-gate` is a `sgate` bin, and `@misaon/slop-gate-core` reaches `apps/telemetry-ingest` as a
type. An import graph sees none of those shapes and no option teaches it one. The direction is what
settles it: acting on the finding removes a package the build needs.

**`oxfmt/unformatted` — 446 findings, which is nearly the whole tree**, because it reports every file
oxfmt would rewrite and this project formats with something else. Its own help text offers the way out
("turn `format.unformatted` off to keep your own formatter"), which is a rule saying it is not a default.
It also costs a second time: oxfmt is file-granularity, so adding it took `analysed` from 445 to 490 and
multiplied the synthesised `config.unused-suppression` and `config.suppression-missing-reason` counts —
the same effect §"Duplicate synthetic diagnostics after ast-grep was added" records.

**Promoted: `knip/binaries`, `knip/duplicates`, `knip/enumMembers`** — 0 findings each, and each asks a
question an import graph can actually answer. `binaries` is the inverse of the two rejected above: a
binary a script invokes and no manifest declares, which is a build that works only where someone already
installed it.

## The React corpus — the five rules the audits could not judge here

<a id="react-corpus"></a>

Three real React applications, cloned at depth 1 and linted with the five rules the `perf`, `restriction`
and `nursery` audits left open, because 0 findings on a repository with no React application in it says
nothing about any of them: **excalidraw** (302 `.tsx`/`.jsx`), **reduxjs/redux-toolkit** (197) and
**vercel/commerce** (45).

| rule | excalidraw | redux-toolkit | commerce | total |
|---|---:|---:|---:|---:|
| `react-perf/jsx-no-new-function-as-prop` | 479 | 289 | 18 | **786** |
| `react-perf/jsx-no-new-object-as-prop` | 246 | 58 | 7 | **311** |
| `react/react-compiler` | 101 | 111 | 4 | **216** |
| `react-perf/jsx-no-new-array-as-prop` | 105 | 27 | 1 | **133** |
| `react-perf/jsx-no-jsx-as-prop` | 12 | 47 | 5 | **64** |
| `react/no-array-index-key` | 14 | 11 | 5 | **30** |
| `react/no-unknown-property` | 0 | 1 | 3 | **4** |

**The `react-perf` family is 1,294 findings over 544 components and no defect among them.** An inline
`onClick={() => …}` is how React is written; the identity it creates costs nothing unless the child is
memoised, and the rule cannot see whether it is. Withheld, available by concept for a codebase that has
memoised its tree.

**`react/no-array-index-key` — 30, and sixteen were read.** Every one is a static list: `<hr key={idx}>`
between menu sections, `<kbd key={index}>` over the parts of a split string, `<Feature key={idx}>` over a
constant array. None is inserted into, sorted or filtered. That is the same shape as the three findings in
this repository's own `prose.tsx`, so the exclusion written from one file survives contact with real code —
the rule finds the lists that do not move, and cannot see the ones that do.

**`react/no-unknown-property` — 4 on React against 187 here**, and that contrast is the entry. It is
accurate where it belongs; the 187 are `class=` in Preact, where the DOM attribute name is the correct one.
Measured against React specifically to establish the rule is not simply wrong before excluding it.

## hadolint/DL3066 — hadolint cannot catch a container running as root

<a id="hadolint-dl3066"></a>

**69 findings, zero true positives, and the rule fires on the correct fix.** "Non-numeric user-id may not be resolvable by host system" fired on `USER nobody`, `USER node`, `USER appuser`, `USER airflow`, `USER trino:trino` — running as a named non-root user is the practice every container hardening guide asks for, and this is the rule that complains about it. The underlying concern is real but narrow: Kubernetes `runAsNonRoot` needs a numeric UID to verify the user is not root before the image runs. It does not apply to `nobody`, which is present in every base image in the corpus.

**Recorded at length because this rule is re-derivable from its name and will be re-proposed.** The Dockerfile engine was prioritised on the expectation that hadolint would catch a container running as root. It cannot: **a Dockerfile with no `USER` instruction at all produces zero hadolint findings**, because `DL3002` only fires on an explicit `USER root`. So hadolint is silent when a container runs as root and complains when it does not. Anyone re-enabling this should read that sentence twice. The genuine gap — "this image never drops privileges" — is not covered by any rule hadolint has, and would need an ast-grep rule or a check of our own.


## hadolint/DL3064 — 7 of 25, and excluded because it is a security rule

<a id="hadolint-dl3064"></a>

**7 of 25 true, and excluded *because* it is a security rule rather than despite it.** 28% is the best precision among the excluded rules here, and it is still the wrong trade: a security finding that is wrong three times in four teaches people to dismiss the category, which is worse than a rule that never fires.

The mechanism is substring matching on the *variable name*. It is right about `ENV PGPASSWORD=password`, `ENV MINIO_ROOT_PASSWORD="clickhouse"` and `ENV AWS_SECRET_ACCESS_KEY=$…`, where `ENV` really does persist the value into the image layer. It is wrong about `ENV TIKTOKEN_CACHE_DIR=/code/.tiktoken_cache` (matched on "TOKEN"), `ENV MINIO_ACCESS_KEY_FILE=access_key` (a filename), `ARG USERNAME=github`, `ENV MYSQL_DATABASE="testdata"`, `ENV GOPRIVATE=…`, and about bare `ARG SENTRY_AUTH_TOKEN` declarations that carry no value and therefore bake nothing.

**The condition that brings it back**: matching on the assigned *value* rather than the name — firing on `ENV X=<literal that looks like a credential>` and staying silent on a value-less `ARG` and on any name-only match. That is a different rule from the one upstream ships, so it would arrive as an ast-grep pattern rather than as this exclusion being deleted.


## vitest/jest expect-expect — the assertFunctionNames sweep

<a id="expect-expect"></a>

**3206 findings on default settings, 584 with these `assertFunctionNames` — an 81.8% reduction, measured over nine third-party repositories plus one of the author's own applications.** Per repo: metabase 145 → 0, nest 779 → 19, srvc-loan 869 → 74, typeorm 954 → 221, trpc 144 → 54, hono 209 → 110, date-fns 100 → 100, prettier 6 → 6, fastify and got 0 → 0.

The rule reads "test has no assertions" from the *name of the function called*, so it cannot see the two ways a real test suite asserts most often. nest's 779 were almost entirely supertest — `request(server).post('/photo').expect(201, {...})` — and typeorm's were chai's `should` style, `migrations.should.be.equal(true)`. Neither is a call to anything named `expect`, and both assert.

Verified not to blunt the rule: a test whose body is `const x = 1` is still reported under every option value measured here. The 584 that survive are not all real either — date-fns's 100 are **type-level tests**, whose assertion is that the body compiles at all, and no value of this option can see that. That residue is why the vitest twin sits at `warn` rather than the `error` its category would give it: a type-level test is an ordinary TypeScript pattern and must not fail a build.


## jsdoc/check-tag-names — TSDoc against JSDoc’s tag list

<a id="jsdoc-check-tag-names"></a>

**2,643 findings across twelve repositories of a 20-repository corpus, of which 141 are block tags TSDoc standardises and 98 are `@return`.** oxlint validates against *JSDoc*’s tag list (verified against 1.76.0: `@privateRemarks`, `@defaultValue` and `@typeParam` are all reported as invalid), and a TypeScript codebase documents with TSDoc — so the rule tells projects following a published standard that the standard is a typo. `@return` is not TSDoc at all: JSDoc itself documents it as a synonym for `@returns`, so reporting it as *unrecognised* is wrong about JSDoc.

Per tag, measured by reading the source at each finding’s byte range: `@defaultValue` 43, `@privateRemarks` 34, `@typeParam` 32, `@experimental` 13, `@link` 6, `@remarks` 6, `@deprecated` 3, plus `@return` 98.

**This deliberately fixes 239 of the 2,643 and leaves 2,502 standing**, because the rest are tags a project invented for its own tooling — `@schema` 598 and `@oas` 502 on medusa, `@publicApi` 367 on nest, `@zh_CN` 216 on vue-vben-admin — and those really are unknown to any toolchain but that project’s own. The escape hatch is the same option written in the user’s config, which is the right place for a fact only that repository knows. Verified against oxlint 1.76.0 that `definedTags` is honoured for this rule: adding `schema` silences `@schema` and leaves the other two reported.


## pedantic.eqeqeq — smart, and what it exempts

<a id="pedantic-eqeqeq"></a>

**2637 findings on default settings, 84 with `smart` — a 96.8% reduction, and every one of the 2553 removed is a comparison that cannot behave differently.** Measured over 32,035 script files from the same twelve repositories the four individually-promoted rules were measured against (nest, hono, got, trpc, vue core, date-fns, typeorm, fastify, axios, prettier, metabase, vscode), counting `eslint(eqeqeq)` diagnostics only — oxlint also emits `TS(...)` parse diagnostics over a corpus containing deliberately-malformed fixtures, and counting those instead inflates every figure here by more than an order of magnitude.

`smart` exempts exactly three shapes, all of them provably equivalent under `===`: comparison against `null` (which is the whole story — metabase alone contributes 2237 findings on defaults and **zero** with `smart`), comparison of a `typeof` result against a string, and comparison of two literals. What is left is ordinary loose equality on values that can differ by coercion, which is what the rule is for.

Of the 84 that remain, 31 are prettier's `tests/format` corpus (which prettier's own eslint config ignores) and 22 are one autogenerated file in fastify (`lib/config-validator.js`, first line: *this file is autogenerated ... do not edit*). The other 31 are ordinary production code across six repositories — `offset != lastOffset`, `indexOf(x) != -1`, `currentQuotes == ""`, `t.id != task.id` — and the fix for each is a single character.

`smart` and not `["warn", "always", { "null": "ignore" }]`, which was measured alongside it at 134: the extra 50 are `typeof` and literal comparisons, so the stricter setting buys 50 findings that are equivalent by construction. It is also the option value that forced `RuleOptions` to be a positional list — oxlint 1.76.0 rejects the object form outright (*unknown variant `null`, expected `always` or `smart`*).


## The ES2025 language floor, and the four modernisations it did not justify

<a id="es2025-floor"></a>

**`target`/`lib` stay at `es2024`.** TypeScript 7.0.2 does accept `es2025` for both — verified, and the
`es2024` list in a TS6046 error is 5.9's, not 7's — but what the higher lib adds here is `Set`
prototype methods and `RegExp.escape`, and neither pays for the change.

`RegExp.escape` has no site: nothing in the tree escapes a string into a pattern.

`Set` methods have two, both in `registry/elect.ts`, where `[...new Set(entries.flatMap(e =>
e.languages))].filter(l => input.languages.has(l))` is genuine intersection. The other six
`filter(… .has(…))` sites are not: they filter *objects* by a derived key —
`entries.filter(e => before.has(e.fingerprint))`, `files.filter(f => supported.has(f.language))` —
where set algebra does not apply, and converting them would return a `Set` of the wrong element type
and lose order.

Raising the floor is not a one-line change, which is what settles it. `apps/telemetry-ingest` is
pinned to TypeScript 5.9.3 for the Vercel function builder (see `c3b8dbf`), and 5.9 rejects an
`es2025` value **in an inherited config even when the package overrides it** — the error points at
`tsconfig.base.json`, not the override. So the floor requires splitting the base into a rules layer
and a language layer and repointing thirteen `extends`, permanently, to reach two lines in one file.

Three further candidates were counted from grep and then refuted by reading the sites:

- **`Promise.withResolvers`** — four sites, all of which it makes *longer*. The pattern it replaces is
  already a one-liner here (`await new Promise<void>(resolve => waiting.push(resolve))`); the
  three-line form only wins when the resolver must escape a scope the executor cannot reach.
- **`Map.groupBy`** — zero sites. The `new Map<string, T[]>()` occurrences are not groupings:
  `run/check.ts` and `engine/normalize.ts` *pre-seed* every key with an empty array, which `groupBy`
  cannot express, and `run/fix.ts` filters and transforms each element on the way in.
- **`Array.fromAsync`** — two sites, and it needs `esnext.array` rather than any numbered lib, so it
  would put the tree on a moving surface. Both sites are inside the per-file streaming loop, where
  pushing into an existing array is not slower than building a new one.
- **`Error.isError`** — eighteen `instanceof Error` sites, and it needs `esnext.error` even under
  TypeScript 7. It buys cross-realm correctness, and nothing here crosses a realm: errors from a
  child process and from a dynamic `import()` are both constructed in this one.

What did apply: `import.meta.dirname` replaced `dirname(fileURLToPath(import.meta.url))` in 26 files,
and `setImmediate` from `node:timers/promises` replaced two hand-rolled promise wrappers around the
callback form.


## Framework profiles — what knip's own plugins do not reach

<a id="framework-profile-gaps"></a>

Each contribution below exists because a plugin gap was measured, not assumed. Figures are against
knip 6.31.0.

**Nuxt `#shared/*` and `#app`** — 14 `deps.unresolved-import` findings at `error` on `nuxt/nuxt.com`
with dependencies installed, every one of them one of these two specifiers. knip's Nuxt plugin ignores
`#build/`, `#components`, `#imports`, `#internal/` and `#spa-template`, and no others. `#shared` maps
to a real directory, so the profile teaches it as a path; `#app` resolves inside Nuxt's installed
package, so there is nothing repo-relative to map it to and it is ignored instead.

**Nuxt layers are detected and deliberately not acted on.** `extends: ['./layers/nuxi']` gives each
layer its own `composables/`, `pages/` and `server/`, and the plugin resolves those against the srcDir
only — 63 of `nuxt.com`'s 67 `dead-code.unused-export` findings were inside `layers/`. An `entry`
contribution naming those directories was tried and measured: **61 of the 63 remained**. It is not
shipped. A contribution that changes nothing while carrying a confident reason is worse than none.

**Firebase Functions** — the platform loads handlers from a path, so no import graph reaches them.
Measured on a real service as five `functions/src/handlers/*.ts` reported as an unused default export.
knip ships no firebase plugin, so this is a plain `entry` contribution, scoped to the workspace that
declares the dependency.


## Why the malware table is a keyed file and not JSON

<a id="keyed-table"></a>

**The malware table is 218,718 packages and 42 MB, and a run looks up a few thousand names in it.
Parsing all of it to answer those cost 585 ms and 200 MB of heap, on every run of every repository.**

`engine-deps-security/src/keyed-table.ts` is the same table sorted by name, with the records left on
disk until a name matches. The index is read whole and never decoded to a string; the records file is
read positionally. Its layout is documented at the top of that file, because a byte offset is the one
thing the code reading it cannot show.


## What a performance KPI can and cannot be measured against

<a id="perf-kpi-noise"></a>

Recorded because the numbers below decided the shape of `packages/perf`, and re-deriving them costs an
hour. All on linux/arm64, 4 cores, against the generated corpus in `packages/perf/src/corpus.ts`.

**A single run cannot gate anything; a median of ten can.** One warm `sgate check` varies 12–24% between
the fastest and slowest of ten. The *median* of ten varies **2.1–2.4%** across independent batches, and
peak RSS medians vary under 1%. The 5% KPI is set against the second number, which is why the harness
never compares a single sample.

**Load is the dominant error term, not the tool.** At load average 2.0 of 4 cores an unchanged tool read
as +8.1% on startup and +8.2% on warm — both past the KPI — with spread up from 12% to 34%. Hence the
load guard: a quarter of the core count, exit 2, neither pass nor fail.

**Peak RSS of the tree is nine times the peak of the largest child.** `getrusage(RUSAGE_CHILDREN).ru_maxrss`
reports 539–618 MB for a cold run of this repository; sampling `/proc/<pid>/status` across the process
group reports 874–923 MB. The engines are concurrent subprocesses, so only the second number answers
"will this fit". `bench.py` in the corpus directory reports the first.

**Rebuilding before measuring costs 26 ms of startup.** `bin/sgate.js` calls
`module.enableCompileCache()`, and a rewritten `dist/main.js` invalidates it. One warmup run left startup
reading +10.5% against an unchanged tool; two left it at +3.2%.

**A cold run is 5.8× a warm one** on the corpus (2049 ms against 353 ms), and 20× on this repository
(7,132–7,353 ms against 363–381 ms). That ratio is why the cache-hit counter is a hard gate at zero
tolerance while the durations are not.
