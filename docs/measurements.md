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
