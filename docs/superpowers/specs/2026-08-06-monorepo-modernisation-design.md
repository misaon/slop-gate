# Monorepo modernisation

Date: 2026-08-06

A full audit of the repository against one goal — that the tool's own source is the reference
implementation of what it asks of others — and the work that follows from it.

## What the audit found

The baseline is green and was verified, not assumed: `pnpm build`, `pnpm typecheck`,
`pnpm test` (2017 tests across 148 files) and `pnpm dogfood` (zero findings) all pass. In roughly
23,000 lines of hand-written source there is one non-null assertion, no `any`, no `@ts-ignore`, and
two `as unknown as` casts, both suppressed with a stated reason. `execFile` is called with argument
arrays and no shell. No file outside the two generated ones exceeds 700 lines. Nothing that
`.gitignore` excludes is tracked.

So this is not a rescue. It is five defects, a toolchain gap, and a syntax floor set lower than the
runtime the package requires.

### Defects

**Turbo returns a green typecheck it did not run.** Inserting an unrecognised compiler option into
`tsconfig.base.json` — a file every package's `tsconfig.json` extends — leaves `pnpm typecheck`
reporting `27/27 cached, FULL TURBO` in 18 ms. `turbo.json` declares no `globalDependencies`, so no
root file enters the hash. A contributor can change the option every package compiles under and be
told the tree still passes. CI is unaffected today only because it has no remote cache and starts
cold.

**A dead export in a published API.** `packages/core/src/index.ts` exports
`CORE_VERSION = '0.0.0'` from a package at 0.1.1. Its only consumer is `index.test.ts`, asserting
`toBe('0.0.0')` — a test that can only fail if someone edits the constant it reads.

**Two engine identifiers that cannot run.** `ENGINE_PREFERENCE` in
`packages/core/src/registry/types.ts` lists `tsgolint` and `zizmor`. Neither appears anywhere else
in the repository and no package implements either. Both are offered to users as valid choices:
naming an engine produces `Expected one of oxfmt, oxlint, tsgolint, tsc, …, zizmor, …`.

**Analyser versions pinned three different ways.** The analysers are the product — which version
runs decides what the tool reports. `@biomejs/biome` and `oxfmt` are pinned exactly; `oxlint`,
`knip` and `@ast-grep/cli` float on a caret. A caret bump therefore changes findings without a pull
request, which is the outcome `.github/dependabot.yml` gives each analyser its own pull request to
prevent.

**Box drawing duplicated.** `packages/cli/src/main.ts` carries its own border characters, width
clamp and padding, while `packages/reporters/src/box.ts` exports `createFrameKit`, `UNICODE_BOX`,
`ASCII_BOX` and the width bounds — and `main.ts` already imports from that package. The `60` and
`100` bounds exist in three places.

**Finished reporters wired to nothing.** `reporters/src/github.ts`, `sarif.ts` and `gitlab.ts` are
implemented and tested. `ci.yml` runs `pnpm dogfood` and nothing else, so a pull request gets no
inline annotations, no Security tab entry, and no summary that avoids opening the log.

### Syntax floor

`lib: ["es2024"]` on a package requiring Node >= 24 forecloses ES2025. Present in the tree:
`dirname(fileURLToPath(import.meta.url))` in six places, the manual deferred-promise pattern in
four, hand-rolled grouping into a `Map` in about eight, manual collection of an async iterable in
two, and `filter(… .has(…))` where a set operation states the intent.

### Library drift

All forty dependencies were checked against the registry. Drift is small: four patch or minor
releases behind (`@biomejs/biome`, `knip`, `oxlint`, `oxc-transform`) and four stable majors
available (`pnpm`, `vite`, `@tanstack/table-core`, `@types/node`). Prereleases exist for `vitest`,
`preact`, `tsdown` and `yaml`.

## Decisions

**Stable majors and ES2025; no prereleases.** `pnpm 11`, `vite 8`, `@tanstack/table-core 9`, every
patch and minor, and `lib`/`target` at `es2025`. Prereleases are left for a separate experiment
after this work is green. `@types/node` stays at 24: `engines.node` is `>=24` and CI typechecks
once, so typing against 26's surface would let a Node 26-only API compile and throw on the oldest
supported runtime — the reason `dependabot.yml` already gives for the pin.

**citty stays.** It is 0.2.2 and still shipping (April 2026). The lazy subcommand map in `main.ts`
plus `enableCompileCache()` in `bin/sgate.js` already beat what a framework change would offer, and
`gunshi` and `@stricli/core` would mean rewriting eight commands and their tests for no measurable
gain. Argument typing is strengthened in place instead.

**Comments are cut to the standard.** Only a constraint the code cannot show itself survives, on one
line. Measurements move to `docs/measurements.md`. This overrides the current arrangement, in which
rationale lives beside the code that follows from it, so `AGENTS.md` is rewritten in the same change
— otherwise the repository's own instructions describe a convention it no longer follows. The length
limit enforced by `not-recommended.test.ts` is untouched: it governs product prose in the registry,
not comments.

**Three CI outputs, and the test log stays as it is.** Inline annotations, SARIF upload, and a job
summary. Silencing the test log was considered and declined.

## Phases

Each phase ends with `pnpm check` — typecheck, test, and the gate run on this repository — green.

**P0, defects.** `globalDependencies` covering `tsconfig.base.json`, `vitest.config.ts`,
`slop-gate.config.ts` and `pnpm-workspace.yaml`, plus a `test` task. `dogfood` stays outside turbo:
a cached "the gate passed" is not a verdict, as `AGENTS.md` argues. Acceptance is the experiment
repeated — a broken `tsconfig.base.json` must miss the cache. Then `CORE_VERSION` and its test go,
`tsgolint` and `zizmor` leave `EngineId`, `main.ts` calls `createFrameKit`, and the three floating
analysers are pinned exactly and bumped.

**P1, CI outputs.** The `github` reporter for annotations, the `sarif` reporter uploaded with
`security-events: write`, and a summary written to `$GITHUB_STEP_SUMMARY`. The reporters are added
to the `dogfood` script rather than inlined into the workflow, so one definition of the invocation
continues to serve CI and the contributor's terminal. Whether `sgate check` accepts more than one
reporter per run is verified first; if it does not, the CLI gains that, and the addition is stated.

**P2, ES2025.** `target` and `lib` to `es2025`, then `import.meta.dirname`,
`Promise.withResolvers`, `Map.groupBy`, `Array.fromAsync`, and set operations where
`filter(… .has(…))` reads worse. `Error.isError` is applied only where an error crosses a realm —
from a child process or a dynamic import. Inside one realm `instanceof Error` is correct and
faster, and replacing all eighteen sites mechanically would trade clarity for nothing.

**P3, libraries.** `pnpm` to 11.20.0 in `packageManager` and both workflows, `vite` to 8, and
`@tanstack/table-core` to 9 — a breaking API reaching `rules-table.tsx` and `use-table.ts`. Whether
the Vercel function builder still requires TypeScript 5 for `apps/telemetry-ingest` is re-checked;
commit `c3b8dbf` says it did in July.

**P4, comments.** About forty sites reduced to one line or removed, measurements moved to
`docs/measurements.md`, and `AGENTS.md` rewritten to describe the convention that then holds.

## What the implementation refuted

Four things this document asserted turned out to be wrong when checked against the code rather than
against a grep count. They are recorded here because the reasoning above reads as settled and is not.

**`tsgolint` and `zizmor` are not dead.** The audit called them phantom identifiers on the strength of
a search that excluded test files. `tsgolint` is a fixture in `registry/elect.test.ts` and
`run/check.test.ts`, exercising type-aware election today, and `concepts/catalogue.ts` names it as the
owner of the `types.*` concepts; the design's arbitration order includes both deliberately. They stay.
The real defect was narrower — `rules list --engine` offered them as a choice — and that is what was
fixed.

**The ES2025 floor does not pay.** TypeScript 7 accepts `es2025`, but what the higher lib adds here is
`Set` methods and `RegExp.escape`, and only two sites in `elect.ts` are genuine set algebra. Raising
the floor also requires splitting `tsconfig.base.json` into a rules layer and a language layer and
repointing thirteen `extends`, because `apps/telemetry-ingest` is pinned to TypeScript 5.9.3 for the
Vercel builder and 5.9 rejects an `es2025` value in an inherited config even when the package overrides
it. `docs/measurements.md#es2025-floor` has the figures, along with the four modernisations
(`Promise.withResolvers`, `Map.groupBy`, `Array.fromAsync`, `Error.isError`) that were counted from grep
and refuted by reading the sites.

**Newest is not the same as current.** This document said "every patch and minor", and following it put
knip 6.32.0 and vite 8.2.1 into the lockfile hours after publication — past the three-to-five day
cooldown `.github/dependabot.yml` argues for and binds only Dependabot to. pnpm 11 refused to install
and was right. The analysers pin the versions already in use; `minimumReleaseAge` stays at pnpm's
default, because raising it to Dependabot's five days would also reject motion, hono and verkit, which
this lockfile already carries.

**`@tanstack/table-core` 9 was deferred and then not.** Deferring was the recommendation — an internal
page, a major two days old, a 404 for its migration guide. The user chose to migrate, and the API came
from the `skills/` directory the package ships. Migrating paid for itself in a way neither option
predicted: v9 requires features to be declared, which exposed that the binding had registered filtered
and faceted row models nothing ever asked for. The client bundle fell 213.50 kB to 196.82 kB.
