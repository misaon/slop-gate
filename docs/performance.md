# Performance KPIs

A quality gate that got slow would be a worse tool than one that checked less, so cost is measured the
same way findings are: against a fixed corpus, with a number that has to be argued with rather than felt.

Three layers, split by whether the metric is deterministic. That split is the whole design: a count is
exact on any machine and can gate a pull request at zero tolerance, while a duration on a shared GitHub
runner varies by more than 30% and can gate nothing.

## The corpus

`packages/perf/src/corpus.ts` writes 439 files — 401 TypeScript modules with a real import graph, 24
stylesheets, 12 JSON documents — from a seeded PRNG. Two runs are byte-identical, so a change in the
numbers is a change in the tool.

Two constraints shaped where it lives:

- **Under `packages/perf/.corpus/`, not the system temp directory.** engine-tsc resolves `typescript` by
  walking up from the analysed root, and a temp directory shares no ancestor with this repository's
  `node_modules`. In a temp directory `tsc` reports itself unavailable and 401 files go unchecked.
- **With its own git repository.** Discovery lists files with `git ls-files -co --exclude-standard`, so
  anything the outer `.gitignore` excludes is scanned as *zero files*. An inner repository ignores
  nothing, which is what makes the corpus invisible to this repository and visible to the tool at once.

No workflow, Dockerfile or lockfile: `actionlint`, `hadolint` and `deps-security` are downloaded rather
than bundled, and a corpus that used them would count differently on a machine that happens to have them
than in CI, which installs none.

## Layer 1 — work counters, exact, gates every pull request

`packages/perf/src/counters.test.ts` runs in `pnpm test`, so it blocks on every runner and every OS.
Tolerance is zero: these are counts, not durations.

| KPI | Value | What a change means |
| --- | --- | --- |
| `filesScanned` | 439 | Discovery started or stopped seeing files — reading `node_modules`, or missing a language |
| `filesAnalysed` | 439 | Work was added or skipped for every file in the corpus |
| Findings | 50 | The ruleset changed what it reports on unchanged input |
| Files assigned | oxlint 401, astgrep 401, tsc 401, knip 415, biome-css 24 | An engine's file selection moved |
| Cache hits on a second run | 100% of every engine's assignment | **The most expensive regression available.** A cold run is 5.8× a warm one; a silently broken cache costs that on every run of every repository, and no output says so |
| Engine invocations | ≤ 8 for the whole run | A batch engine became a per-file engine — N subprocesses instead of one |

## Layer 2 — hot paths, instrumented, gates every pull request

`packages/perf/bench/hot-paths.bench.ts`, run by `pnpm bench` and in CI under CodSpeed, which replaces
the timing loop with CPU instrumentation and holds variance under 1% on a shared runner.

The functions are the ones a run calls per line or per diagnostic, where a small constant becomes the
whole profile: `displayWidth` (the hottest self-time frame in a large run), `padEndDisplay`,
`truncateEnd`, `createLineIndex`, `hashContent`.

Two ratios worth knowing, both measured here: `displayWidth` is **105× slower** on mixed-width text than
on ASCII, and `truncateEnd` is **132× the cost** of `padEndDisplay`.

## Layer 3 — the whole command, wall clock and memory, gates locally

`pnpm perf` measures the built CLI against the corpus and compares it to `packages/perf/baseline.json`.

Not in CI, and not because it was hard to wire: the metric is a wall clock, and instrumenting it would
mean instrumenting oxlint, tsc and biome — three binaries in three other languages. The baseline records
the machine it was taken on, and `judge()` refuses the percentage comparison when the hardware differs,
because a four-core arm64 board says nothing about a runner and a gate that reports a regression on every
run stops being believed.

| Scenario | Runs | Baseline (linux/arm64, 4 cores) | Ceiling |
| --- | --- | --- | --- |
| `--version` | 10 | 124 ms · 66 MB | 200 ms · 100 MB |
| `check`, warm | 10 | 353 ms · 88 MB | 500 ms · 130 MB |
| `check`, cold | 5 | 2049 ms · 231 MB | 2900 ms · 340 MB |

Both a percentage and a ceiling, because either alone fails. **±5% against the baseline** catches a single
change; the ceiling catches twenty changes that each passed.

**Why medians, and why 5%.** A single warm run varies 12–24% between the fastest and slowest of ten on
this hardware. The *median* of ten varies 2.4% across independent batches, and peak RSS medians vary under
1%. Five percent is roughly twice the noise floor of the number actually being compared — tight enough to
catch a real change, loose enough that a busy machine does not cry wolf. A gate that barks without cause
is a gate people learn to skip.

## The harness refuses a machine it cannot measure on

`pnpm perf` checks the one-minute load average first and exits 2 — neither pass nor regression — when it
exceeds a quarter of the core count. This is not caution for its own sake. At load 2.0 of 4 cores an
unchanged tool read as **+8.1% on startup and +8.2% on warm**, both past the KPI, with the sample spread up
from 12% to 34%. Reported as a regression, that is a gate teaching people to ignore it.

`--force` measures anyway, for when the reading is wanted as indicative rather than as a verdict.

The same class of artefact bit the harness itself: `pnpm perf` rebuilds before measuring, which rewrites
`dist/main.js` and invalidates the V8 compile cache `bin/sgate.js` enables. That cache is worth about
26 ms, which is 10% of the startup scenario, so the first measured run reported a regression against an
unchanged tool. Two discarded warmup runs, not one, and the number is stable.

## Re-recording the baseline

```bash
pnpm perf           # measure and judge
pnpm perf:record    # measure and overwrite baseline.json
```

Record only on an idle machine, and only in a commit that says which change moved the numbers and why the
new figure is acceptable. A baseline quietly re-recorded alongside the change that broke it is the same as
having no KPI.
