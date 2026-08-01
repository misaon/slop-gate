# M0 follow-ups and known limitations

**Date:** 2026-07-31
**Status:** Backlog, carried out of the M0 branch review

Everything here was found during M0, judged real, and deliberately not fixed in M0. Each entry says
why it was deferred so a later milestone does not have to re-derive the reasoning.

---

## Blocks M2 — read before adding any type-aware rule

**oxlint reports `number_of_rules: 0` for its 59 type-aware rules unless `--type-aware` is passed**,
which `packages/engine-oxlint/src/index.ts` does not pass, and which additionally needs the separate
`oxlint-tsgolint` package that `engine-oxlint` does not depend on.

The moment a registry entry elects a type-aware rule, `parse.ts`'s rule-count assertion throws
`EngineError: the materialised config is not selecting exactly the elected ruleset` on every run.
That message is actively misleading — the real cause is a missing capability, not a config defect.

Dormant today: the only non-`eslint`-scope oxlint rule in the registry is `typescript/no-explicit-any`,
which is `type_aware: false`.

M2's type-aware work must land the flag, the dependency, and a capability probe in one change. The
socket for that probe already exists and is now wired: `check.ts` derives `capabilities` from each
engine's declared `provides`, so an engine announcing `provides: ['types']` will let arbitration
elect rules declaring `requires: ['types']`.

---

## Restructure before M2, not after

**`streamCheck` (`packages/core/src/run/check.ts`) owns too much for a multi-engine scheduler.** One
generator currently derives cache keys, looks up the cache, batches, invokes engines, normalizes,
writes the cache, orders and aggregates.

M2 needs project-granularity engines started first, per-engine batch sizes, worker-pool affinity and
streaming across engines — all scheduling decisions that must be made *from the plan*. The plan
cannot make them today because the cache check happens inside the run loop, and it genuinely cannot
move into `buildPlan` as written: the cache key needs `engineVersion` and `handle.rulesetHash`, which
only the engine can supply.

The shape M2 needs is a distinct **prepare** phase (resolve version and ruleset hash per engine),
then a cache-aware **plan**, then **scheduling**. Doing that split with one engine and 294 tests to
lean on is far cheaper than doing it with twelve.

Related: the planner is not cache-aware, so a fully-cached run still calls `version()` (a real
subprocess spawn) and `materializeConfig()` (a temp-file write and delete) for an engine with nothing
to do — and a missing engine binary fails the run with exit 3 even when every result is cached.
Spec §8.1 assigns the cache filter to the planner; M0 does not implement that.

## `tsc` landed (M2's second engine, and the first project-granularity one)

Full design writeup, captured `tsc` output for every case, and measured numbers:
`.superpowers/engine-tsc-report.md`. What's worth carrying forward here specifically:

**What was restructured in `streamCheck`, and what deliberately was not.** The paragraph above called
for a prepare/plan/schedule split "with one engine and 294 tests to lean on"; this is the second
engine, and the honest answer is that the full split *still* was not done. What actually changed:
`streamCheck`'s per-assignment loop now branches on `engine.capabilities.granularity`, and the
`'project'` branch is a new, separate function (`runProjectAssignment`) with its own cache primitives
(`deriveProjectResultKey`, `openProjectResultStore` — `packages/core/src/cache/keys.ts` and
`result-store.ts`) rather than a variant of the per-file path. `buildPlan` needed **zero** changes: an
`EngineAssignment` already carries a flat file list regardless of granularity, and that shape is
already enough — the interpretation (batched-per-file cache vs. one aggregate hash) is entirely
`streamCheck`'s decision, keyed off a capability the interface already declared but nobody read. This
is probably close to what M2's real split will keep, not throw away.

What was **not** done, on purpose: the "planner is not cache-aware" gap immediately above applies to
`tsc` exactly as it already applied to oxlint — a fully-cached run still calls `tsc`'s `version()`
(mitigated for this one engine only: `engine-tsc`'s `version()` reads `typescript`'s own
`package.json` directly rather than spawning `tsc --version`, so at least it costs a file read, not a
process spawn) and `materializeConfig()` (cheap for `tsc` — no file write). The real fix (moving the
cache check into a genuinely cache-aware plan, per spec §8.1) is still deferred; two real engines is
still not "twelve," and this session did not need it to ship `tsc` correctly.

**A second, narrower interface gap, resolved without touching the `Engine` interface.**
`Engine.version()` takes no arguments, which is fine for a bundled dependency (oxlint resolves from
its own install location every time) but wrong for a peer dependency: `tsc`'s own version is a
property of *which project* is being checked, not a constant. Rather than threading a `rootDir`
through `version()`'s signature (which would ripple into the interface, oxlint's implementation, and
every test double implementing `Engine`), `createTscEngine({ rootDir, cacheDir, tsconfigPath? })`
binds `rootDir` once at construction — both real call sites (`packages/cli/src/engines.ts`'s
`defaultEngines`, called from `commands/check.ts` and `commands/rules/shared.ts`) already compute
`rootDir` before constructing the engine list, so `defaultEngines(rootDir)` (previously
`defaultEngines()`) was a mechanical, two-call-site change. `RunContext` (passed to
`materializeConfig`/`run`) still has no `cacheDir` field either — `createTscEngine`'s own `cacheDir`
option (defaulting to the same `join(rootDir, '.slop-gate', 'cache')` `streamCheck` computes
independently) is what tells it where to put `tsc --incremental`'s build info. **This is a real, sharp
edge**: the two defaults happen to agree only because neither is overridden in the shipped CLI. A
caller that overrides `runCheck`'s own `cacheDir` without *also* overriding `createTscEngine`'s
independently-defaulted one gets a silent split-brain — confirmed the hard way while measuring against
the linked NestJS playground below: an earlier version of the measurement script redirected
`runCheck`'s `cacheDir` away from the playground but forgot to also redirect `createTscEngine`'s,
and `tsc --incremental`'s build info landed inside the playground's own `.slop-gate/cache/tsc/` before
the mistake was caught and removed. No production code path can hit this today (the CLI always derives
both from the same `rootDir` with no override), but a future `--cache-dir` flag or a second
`RunContext`-driven engine would want `cacheDir` threaded through `RunContext` properly rather than
inheriting this two-defaults-that-happen-to-match shape.

**The probe found real, specific defects in what was assumed going in**, beyond the two the task
description already flagged (multi-line continuations, TS 5.9.3 not 7.x — both confirmed true):

- **A cold run and a warm `--incremental` rerun of the exact same unfixed error exit with *different*
  codes** — `2` cold, `1` warm — confirmed directly. Copying oxlint's own
  `MAX_FINDINGS_EXIT_CODE = 1` verbatim would have misclassified every cold run with real errors as an
  engine crash; `engine-tsc` uses `2` as its ceiling, with both meanings ("ran fine, diagnostics are in
  stdout") documented at the constant.
- **Plain (non-`--pretty`) output has no trailing summary line at all** — no `Found N errors`, unlike
  `--pretty` mode. A parser that expected one to count errors would silently under-count in the common
  case (plain mode is the default the moment stdout is not a TTY, confirmed empirically, and is what
  this adapter deliberately uses).
- **This repository's own root has no `tsconfig.json`** — only per-package ones
  (`packages/*/tsconfig.json`) plus a shared `tsconfig.base.json` nothing `extends` at the root. A
  `createTscEngine({ rootDir: <this repo> })` with the documented default `tsconfigPath` fails outright
  (`TS5058`, correctly surfaced as an `EngineError`, not swallowed) — this repository cannot dogfood
  `tsc` from the monorepo root without either an explicit `tsconfigPath` per package or the same
  per-workspace config discovery the "Decide rather than defer again" section below already flags as
  unimplemented. Measured per package instead (`.superpowers/engine-tsc-report.md`): zero type errors
  in all five.
- The task's own captured multi-line example (`Cannot find module '@misaon/slop-gate'..., There are
  types at ... but this result could not be resolved under your current 'moduleResolution' setting`)
  did **not** reproduce against the current build, under either the playground's real `module:
  commonjs` tsconfig or a forced `moduleResolution: node10` override: `packages/cli/package.json`
  already declares a top-level `"types"` field *and* an explicit `"types"` condition inside `exports`,
  which resolves cleanly under every mode tried. A different, reliably-reproducible multi-line
  diagnostic (`TS2769`, function overload mismatch) was used instead for the fixture and the parser
  tests; the module-resolution example may have described an earlier state of `packages/cli/package.json`
  before `"types"` was added, or a resolution path this session did not hit.

**Measured**, `types.type-error` opted in standalone (not part of `recommended` yet): **zero** findings
in this repository (all five packages, `tsc` pointed at each own `tsconfig.json`) and **zero** in the
linked NestJS playground (122 of its 179 files are `.ts`/`.tsx`). Not wired into `recommended`: not
because of the finding count (zero either way is not evidence against turning it on) but because there
is no measured *cost* signal yet either — a repository with real type errors, and a timing budget
against spec §16, would both be needed before defaulting it on for every user. Left as an explicit
opt-in (`rules: { 'types.type-error': 'error' }`) pending that.

## `knip` landed (M2's third engine, and the second project-granularity one)

Full design writeup, the measured false-positive rates and every claim's evidence: spec §13.2. What is
worth carrying forward as *work*, rather than as documentation of what shipped:

**The prepare/plan/schedule split still was not done, and the second project engine now says something
specific about what it should keep.** The `tsc` entry above predicted that `streamCheck`'s
branch-on-granularity shape "is probably close to what M2's real split will keep, not throw away."
Adding a second project engine did not contradict that: `runProjectAssignment` needed **zero** changes,
`buildPlan` needed zero changes, and the only core change knip required was none at all — the whole
adapter fits behind the existing `Engine` interface. The branch-on-granularity code is not awkward for
two engines. **What is awkward is one level down**, and it is a genuinely new finding:

- **`materializeConfig` cannot see the inventory, and for knip that is load-bearing rather than
  cosmetic.** `Engine.materializeConfig(selection, context)` receives the elected ruleset and a
  `RunContext` (`rootDir`, `tmpDir`). knip's config needs a *second* input the interface never
  supplies: the workspace map, which is derived from the assigned file list. `run(batch, …)` has that
  list, so the adapter materialises the ruleset half in `materializeConfig` and merges the workspace
  half in `run` by reading its own temp file back and rewriting it
  (`mergeWorkspacesIntoConfig`). That works and is fully tested, but it splits ownership of one file
  across two calls and means `handle.path` names a file that is deliberately incomplete until `run`
  touches it. `tsc` never hit this because a tsconfig already declares its own program. **The M2 split
  should give `materializeConfig` the plan** (or at least the assignment) rather than only the
  selection — that is one parameter, and it collapses the whole two-phase dance.
- **Two project engines now independently default their own `cacheDir`/`rootDir`.** The `tsc` entry
  above records the split-brain risk from `createTscEngine`'s independently-defaulted `cacheDir`.
  `createKnipEngine` sidesteps it by needing neither (knip is bundled and writes no cache of its own —
  verified it leaves nothing under `node_modules/.cache/knip` without an explicit `--cache`), but that
  is luck of the engine, not a fix. `RunContext` still has no `cacheDir`.
- **`runProjectAssignment` reads every assigned file to scan for stale suppressions, and knip's
  assignment now includes every `.json` and `.jsonc` file.** knip has to claim those languages (a
  `package.json` must reach `run()` for the workspace map to exist at all, and §9 requires a manifest
  edit to invalidate its cache), but the consequence is that a repository with a committed
  `package-lock.json` or large JSON fixtures pays a full read plus a `createLineIndex` over them on
  every uncached run. Not measured as a problem on this repository (181 files, 385ms end to end), but
  it scales with total JSON bytes rather than with anything knip cares about.
- **Spec §13.1's table said knip "runs in a worker"; it does not.** It is shelled out to, like the
  other two adapters, because the worker pool §8.2 describes does not exist yet. The table has been
  corrected rather than left aspirational. When the pool lands, knip is the obvious first candidate:
  it is pure JS with a programmatic `main()` export, so it is the one engine that could skip the
  subprocess entirely — at the cost of losing `AbortSignal`-based cancellation, which `execFile` gives
  for free and knip's API does not offer.

**Framework awareness is now blocking a second, independent thing.** The "NestJS empty-class lesson"
below records that a *rule's* value can depend on the framework present. knip adds the mirror case: an
*engine's* accuracy can too, and for knip it is the dominant term. Synthesising the workspace map fixes
what knip could not see; it does not fix knip's VitePress plugin looking for `.vitepress/` at the
workspace root when the site lives in `docs/.vitepress/`, and measured on a fixture reproducing that
shape the synthesis therefore made the count *worse* (18 findings → 20, both new ones false). A
`knip.workspaces['tech-docs'].vitepress.entry` override would fix it and is trivially expressible in
the config this adapter already synthesises — the missing piece is not plumbing, it is a place to
record "this repository uses VitePress, and its site root is `docs/`". Same for MikroORM migrations
(`entry` should include the ORM config's own `migrations.path`) and for a NestJS project's
`@nestjs/platform-express` re-export of `express`. **Whatever answers the framework-awareness question
for the registry should be asked to answer it for engine config synthesis at the same time**; they are
the same detection problem with two consumers.

**Not done, deliberately:** knip has a real `--fix` (including file deletion, behind
`--allow-remove-files`). `capabilities.fixes` is `false` and every entry's `fixKind` is `'none'`.
Wiring it into the fix pipeline (§11) is its own piece of work, and claiming the capability early would
let `sgate fix` promise edits the adapter cannot produce.

**A measurement worth keeping for whoever revisits `recommended`:** the reason nothing knip owns is in
`recommended` is accuracy (13/13 false positives for `files` across two repositories), *not* cost —
unlike `tsc`, which was held back for want of a cost signal. knip runs this repository in ~0.31s
standalone and ~0.39s through the full pipeline. If framework awareness ever lands, the accuracy
objection is the one that would move, and `exports` (1 true / 0 false, structurally the most
trustworthy of the ten because it is computed within files knip already reached) is the first
candidate — it just needs a sample larger than one.

---

## Found by first real-world use

Linking M0 into a real NestJS project (120 TS files, existing ESLint, clean tree) surfaced two
things no fixture caught.

- **`sgate check` inventories its own cache.** The walker skips `.slop-gate` via `ALWAYS_SKIPPED`,
  but the **git** source does not: `git ls-files -co --exclude-standard` lists untracked
  non-ignored files, and in a repository that has not run `sgate init`, `.slop-gate/cache/**` is
  exactly that. Measured: 178 files on the first run, **305 on the second**, with 127 of them cache
  entries. It compounds every run. `sgate init` masks it by writing `.slop-gate/.gitignore`
  containing `*`, but `check` must not depend on `init` having been run. Fix: skip `.slop-gate`
  in the git source too, or filter it in `buildInventory` where both sources converge.
- **A config diagnostic is reported against a file that does not exist.** With no config present,
  `streamCheck` falls back to the literal default `configFile: 'slop-gate.config.ts'`, so the
  `config.rule-overlap` note is attributed to a path the user does not have. The pretty reporter
  then silently omits its code frame. Either attribute orchestrator diagnostics to no file, or say
  `<default config>` — but do not name a file that is not there.

## Deliberately excluded rules

Some rules pass every static invariant in `entries.test.ts` and are still wrong to ship, because
their value depends on what is actually in the repository they run against — something this registry
has no way to know yet. Recorded here so nobody re-adds one of these thinking it was an oversight.

- **`typescript/no-extraneous-class`** ("Unexpected empty class"), considered alongside `no-shadow`
  in the same five-fixes follow-up session. Measured against a real NestJS project (95 TS files under
  `src`), with both rules enabled together: 12 total findings, 11 of them this rule, and **every one
  of the 11 a false positive** — an empty `@Module({...}) export class XModule {}`, one per
  `*.module.ts` file. NestJS (and Angular, and any other decorator-driven dependency-injection
  framework) *requires* that class body to be empty; the decorator carries the actual behaviour, the
  class is just a hook to hang it on. In isolation the rule is 11/11 (100%) false positives on this
  codebase. The "~92%" figure floated at the start of this investigation is a different, also-correct
  number: it is this rule's share of the *combined* 12-finding sample once the one genuine `no-shadow`
  bug is counted alongside it (11/12 ≈ 91.7%, rounds to 92%). Both are measured directly against
  oxlint 1.76.0, not estimated — they just answer different questions ("how often is this rule wrong
  on its own?" vs. "how much of what these two candidate rules surfaced together was noise?"), so it
  is worth being precise about which one a future reader is citing. See the comment above the
  `no-shadow` entry in `packages/core/src/registry/entries.ts` for the same note in context.

- **`no-underscore-dangle`**, found auditing what the *generated* `recommended` preset actually
  fires on a real project (srvc-bat, post-M1a registry generation): 5 of its 6 total findings there
  were this rule, every one the same identifier (`request_`) at its point of declaration, repeated
  five times in one file (`test/test-runner.ts`). Confirmed deliberate, not careless: that file
  imports `* as request` from `supertest`, so every method-local `request_` is systematically
  avoiding a collision with the already-imported name — the same convention applied consistently
  five times over, not a defect. Same class as `no-extraneous-class` above, just a naming convention
  rather than a framework requirement: oxlint's `suspicious` category is not the arbiter of whether a
  finding belongs in `recommended`, whether it is a defect a competent developer would actually want
  to change is. See the reason recorded directly on the entry in
  `packages/core/src/registry/exclusions.ts`.

**The general lesson, which will recur as the registry grows past this one rule:** a rule's value
depends on the framework present in the repository, and the registry
(`packages/core/src/registry/entries.ts`) has no notion of framework awareness — no way to know a
codebase uses decorator-driven DI (NestJS, Angular, ...) and route around the class of false positive
that produces for an otherwise-reasonable rule. Today, with a hand-curated registry, a human catches
this one measurement at a time, exactly as happened here. Once the registry is generated rather than
curated (M1's stated direction — see the comment atop the M0 batch in `entries.ts`), that manual
judgment call disappears with it unless framework detection becomes one of the generator's own inputs.
**A later milestone needs to decide how a generated registry gets back what a curated one currently
gets for free from a human reading the code.**

## Should fix soon

- **No per-engine timeout.** `execFile` sets `maxBuffer` but not `timeout`, so a hung engine hangs
  `sgate` indefinitely. Spec §18 requires one.
- **A missing engine binary yields `spawn … ENOENT`** with no install command, against §18's
  "actionable message containing the exact install command".
- **`fingerprint()` rebuilds the line index per diagnostic.** `packages/core/src/diagnostics/fingerprint.ts`
  calls `createLineIndex` on the whole file while its caller in `normalize.ts` already has one cached
  per file. The Task 2 deferral said "revisit when normalization batches per file"; it now does.
- **`readJson` swallows every error** in `packages/core/src/discovery/workspaces.ts`, so a malformed
  root `package.json` silently yields no workspaces. This is the last instance of the class that was
  deliberately fixed for `pnpm-workspace.yaml` fifteen lines below it.
- **`git ls-files --deduplicate` needs git ≥ 2.31** (2021) with no fallback. `selectFileSource`
  catches only `rev-parse` failure, so if `ls-files` rejects the flag the whole run dies with a raw
  git error. Ubuntu 20.04 ships git 2.25.
- **Downstream package tests exercise each dependency's built `dist/`, not its live source.**
  `packages/cli`'s tests import `@misaon/slop-gate-core`, `-reporters` and `-engine-oxlint` by
  package name, which resolve through each package's `exports` field to `dist/index.js` — there is
  no vitest alias back to `src`. Editing `packages/core/src` and running `pnpm test` from the repo
  root can show every CLI-level test passing while it silently still exercises the previous build.
  `pnpm build` has to run first for a dependency change to reach a dependent package's tests;
  `pnpm typecheck` happens to rebuild everything as a side effect of turbo's own dependency graph,
  but plain `pnpm test` does not. Found the hard way during the five-fixes session (see the report):
  three CLI-level tests kept passing against a stale build for several edits before a rebuild
  surfaced that they actually needed updating.

## Test gaps worth closing

- **No non-ASCII or CRLF end-to-end fixture.** Spec §10 says multi-byte content "is covered by
  explicit fixtures" and §17 requires them from M0. Unit coverage in `position.test.ts` is good; the
  engine→reporter chain has none. Verified by hand during review: oxlint byte offset 56 maps to
  UTF-16 column 50 on a line containing 2-, 3- and 4-byte characters.
- **No test exercises a successful pass through `importTransformed`** (the config loader's
  `oxc-transform` fallback). Proven correct by hand with a TS `enum` config; no regression guard.
- **No test for the `engine-failed` stream event**, only the aggregated `engineFailures`.
- **CI never runs `sgate check` on this repository**, so a regression in the shipped registry or
  presets would not be caught. Cheap dogfooding now that the answer is a clean zero — re-confirmed
  by hand after the M0 registry expansion (39 new rules, 47 total): still zero.
- **A rule appearing in `oxlint --rules --format json` is not proof it detects anything.** Curating
  the M0 registry expansion, `no-implied-eval` reported `number_of_rules: 1` and zero diagnostics
  against every canonical trigger (`setTimeout`/`setInterval`/`Function`/`execScript` with a string
  literal) — verified directly against oxlint 1.76.0, independent of slop-gate. It was dropped
  rather than shipped. `packages/engine-oxlint/src/index.test.ts` now exercises 6 of the 39 new
  rules against the real binary, which is exactly the check that would have caught this
  automatically, but the other 33 are unverified beyond the registry's own static invariants.
  Whatever generates the registry in M1 needs a functional check per rule — a fixture with a known
  violation, not just a `--rules` listing — or it will silently ship dead rules the same way this
  one almost did.

## Decide rather than defer again

- **`Diagnostic.engine` is a bare `string`, so `'slop-gate'` type-checks but is not an `EngineId`.**
  A user cannot silence a config diagnostic as `'slop-gate/config.dead-override': 'off'` — that
  spelling emits a *new* dead-override about itself. The documented canonical form,
  `'config.dead-override': 'off'`, works. Widening `EngineId` touches `ENGINE_PREFERENCE`,
  `RuleEntry.engine` and the arbitration ranking, so it wants to be a deliberate change.
- **`RawDiagnostic.severity` is required and no consumer reads it.** Either read it as a fallback
  when no config level applies, or delete it — before eleven more adapters dutifully populate it.
- **A complete `workspace-config` provenance layer exists with no producer.** Nothing discovers a
  per-workspace `slop-gate.config.ts`, so spec §6.1/§6.2's per-workspace config is silently ignored
  when running from the root, and `InventoryFile.workspace` is computed for every file and read only
  by a test. Same for `SlopGateConfig.workspaces` and `engines`, both of which type-check and do
  nothing — and `engines: { eslint: { enabled: 'auto' } }` appears in the spec's own example config.
  Either an M1 line item or a documented limitation; right now it is neither.
- **oxlint's `--rules` output spells two scopes with underscores** (`jsx_a11y`, `react_perf`) while
  the diagnostic `code` field hyphenates them. A future registry entry for those scopes must use the
  hyphenated form, which is what the parser accepts.
- ~~**`config.unused-suppression` is in the catalogue and every preset but has no producer.**~~
  **Resolved** by the inline-suppressions work (see "Found implementing inline suppressions" below
  and `.superpowers/inline-suppressions-report.md`): `packages/core/src/suppressions/` now parses
  `sgate-disable-*` directives and `engine/normalize.ts` emits `config.unused-suppression` for one
  that matches nothing. The original note, for context: `check.ts`'s `configDiagnostics` only ever
  emitted `config.dead-override` and `config.rule-overlap` — nothing implemented "a suppression
  comment matches no diagnostic", the behaviour the concept's own description promised. Noticed
  while auditing every `config.*` diagnostic's trigger condition for the arbitration fix (see the
  five-fixes report); not touched there.

## Found implementing inline suppressions

Full detail, directive grammar and cache verification in `.superpowers/inline-suppressions-report.md`.
Three things worth carrying forward from that session specifically.

- **Found and fixed: a zero-finding file never got a chance to be scanned for suppressions.**
  `run/check.ts` had a `fileRaws.length === 0` fast path that wrote `[]` to the cache and moved on
  without ever reading the file's source — a deliberate optimisation ("normalization only touches the
  source when there is a finding to position") that predates this feature and was correct until now.
  It is exactly wrong for inline suppressions: a file with a *stale* `sgate-disable-*` comment (the
  code that used to need it was fixed, the comment was not removed) is, by definition, a file with
  zero raw findings — the modal case `config.unused-suppression` exists to catch. Fixed by always
  reading the file and calling `normalizeDiagnostics` with the new `suppressionScanFiles` option, even
  when `raws` is empty. Covered by
  `packages/core/src/run/check.test.ts`'s `'a zero-finding file is still scanned for a stale
  suppression on a cold run'` and the equivalent `engine/normalize.test.ts` case — both would fail
  without the fix (verified by reverting it locally before writing this up).

- **Deliberately not solved: unused-suppression is judged per `(engine, file)` normalize call, not
  per file across every engine that touches it.** `normalizeDiagnostics` is called once per engine
  per file (see `run/check.ts`), and a bare directive (no target — "suppress everything here") or a
  directive targeting a concept a *different* engine owns can only be judged correctly by whichever
  call actually sees the matching diagnostic. Today this is a non-issue: the CLI registers exactly one
  file-granularity engine (`createOxlintEngine()`), so every file is normalized exactly once, and the
  question never arises. It becomes a real bug the moment a second file-granularity engine is wired up
  for a language oxlint already covers — two separate `normalizeDiagnostics` calls over the same file
  would independently, and potentially inconsistently, decide whether a bare or cross-engine directive
  is unused. Documented in `engine/normalize.ts` at the suppression-handling block. A correct
  multi-engine fix needs unused-suppression detection to move to a point that sees every engine's
  contribution to a file before judging, which does not exist today (see "Restructure before M2, not
  after" above — this is the same class of problem, one level down).

- **Pre-existing, not introduced here, but newly load-bearing: a *preset's own content* changing does
  not invalidate the cache.** `check.ts`'s `configHash = hashJson({ config: options.config, entries
  })` hashes the user's raw, unexpanded config object (`{ extends: ['recommended'] }`) and the
  registry — never `PRESETS` itself. Verified directly: with a scratch repo on `extends:
  ['recommended']` and a stale cache, temporarily changing `presets.ts`'s
  `'config.unused-suppression'` from `'warn'` to `'error'` and rebuilding still served the cached
  `'warn'` severity, 100% of files from cache, with no config or source change on the user's side —
  i.e. upgrading slop-gate itself does not bust old caches for anything whose level comes from a
  preset, not just the two new suppression concepts. A *user's own* `config.rules` edit invalidates
  correctly today (`options.config` literally differs, verified in `run/check.test.ts`) — this gap is
  specifically about the preset lookup table changing out from under an unchanged config file. Out of
  scope for this feature (it is not specific to suppressions and touches every preset-derived
  concept), but real, and worth an M1/M2 line item: either hash the *resolved* base ruleset instead of
  the raw config, or document that a version upgrade requires `--no-cache` once.

## Accepted as is

**The stat index's racy window is a margin, not a proof.** `RACY_WINDOW_MS` is 2s, chosen to cover
FAT's timestamp granularity with room to spare, and it closes the failure this was written for: a
same-length edit landing in the same timestamp tick as the previous one, which returned the previous
content's hash and was caught by a Windows CI run rather than by design. What it does not do is make
the stat fast path sound in general. Windows can defer a last-write-time update well past two seconds
for a handle held open, and a network filesystem with a skewed clock can report an mtime that never
falls outside any fixed window. Both are real, both are rare, and the honest description of the fast
path remains "trusts `(size, mtimeMs)` once the file has been quiet for a moment" — not "detects every
change". Widening the window trades cache hits for a guarantee it still would not deliver; the actual
fix, if a report ever justifies one, is a `--no-cache` escape hatch and content hashing on demand
rather than a larger constant.

`uncovered` does not report slop-gate's own synthetic concepts (`config.rule-overlap`,
`config.dead-override`, `config.unused-suppression`) — a concept the orchestrator services itself
will never have a matching `RuleEntry`, and counting that against the repository's engine coverage
would warn about the tool's own diagnostics on every run.

`uncovered` also does not report a concept whose only mismatch is language — every candidate is
otherwise capable (right engine, right capabilities, not deprecated) and would run if the repository
contained that language. Found running the real CLI after registry generation landed: `recommended`'s
271 concepts include many React/Vue/Jest-scoped ones this repository's and srvc-bat's files never
exercise, and both repositories printed an identical, permanent "115 enabled concepts have no capable
engine" line as a result — noise about the repository's shape, not a coverage shortfall.
`registry/elect.ts`'s `electOwners` now splits `isApplicable` into `isCapable` (engine participation,
capabilities, deprecation) plus the language check, and only pushes a concept onto `uncovered` when no
candidate is capable even ignoring language. Verified clean against every existing `elect.test.ts`
case plus new ones, against both repositories (the line disappears from both, finding counts
unchanged), and against a synthetic fixture pinning a concept to a non-participating engine (still
reports, confirming the fix does not just silence the line unconditionally).

`positionAt` yields U+FFFD for an offset inside a multi-byte character; oxlint's offsets are always on
character boundaries, verified. `findConfigFile` walks past the repository boundary, matching
prettier and tsconfig convention. The tautological invariant tests in `entries.test.ts` and
`presets.test.ts` are kept: the types already enforce them, and deleting them removes documentation
of intent for no gain.

---

## One thing M0 does not demonstrate

`sgate check` on this repository reports **zero** error- or warning-level findings against its own
code. That is a good result, but it means M0's "reports real findings" acceptance bullet is
demonstrated only by the committed e2e fixture, never by self-checking. Worth knowing when judging
whether the gate has teeth.

**Update, inline-suppressions session:** this is no longer literally true, and the reason why is
itself informative. Self-checking after that work landed surfaced ~40 `config.unused-suppression` /
`config.suppression-missing-reason` warnings — all of them from `packages/core/src/suppressions/*`
and `engine/normalize.test.ts` fixture strings that contain the literal directive text as *test data*,
not as real suppression comments. That is precisely the documented, accepted cost of whole-line token
scanning (§6.3): the tool cannot tell a real comment from a string literal or another test's fixture
containing the same characters, and a parser test suite for exactly this feature is the single most
adversarial input that trade-off could ever be asked to survive. Left as is rather than obscured
(e.g. by string-concatenating the token apart in fixtures) — the noise is real, expected, harmless
(warn-level, does not fail `test`/`typecheck`/`build`, and `sgate check` is still not part of CI), and
hiding it would just be hiding the evidence that the documented trade-off is real. Two *unrelated*
genuine findings the same self-check surfaced (a shadowed `source` binding across nine new test
cases in `normalize.test.ts`, and a needlessly-renewed-per-run `isVisible` closure in `check.ts` —
both instances of concepts already in the registry) were real defects in the new code and were fixed,
not suppressed.
