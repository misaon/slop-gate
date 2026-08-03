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
