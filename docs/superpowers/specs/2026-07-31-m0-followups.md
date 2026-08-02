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

**A test that asserts a filesystem path must compose the expectation with `node:path`, never with
literal slashes.** Three separate files have now shipped this bug — `core/exec/resolve-script-bin`,
and two cases in `engine-astgrep/resolve-binary` — and every time it cost a full red CI cycle on
Windows and nothing anywhere else. The mechanism is always the same: the code under test calls the
real `node:path`, so a Windows runner produces backslashes no matter which `process.platform` the
test stubs. A literal `'/repo/pkg/bin'` therefore asserts the *runner's* separator rather than the
behaviour, and fails for every stubbed platform at once, which reads like a platform bug and is not
one. Compose with `join(base, ...segments)`, compare filenames with `basename`, and build substring
needles with `sep` — the assertions stay exactly as strong, because the test still states the base
and the segments independently.

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
- **Nothing can document the directive syntax inside a file the tool scans.** An escape marker, a
  doc-comment heuristic, or accepting it — costed in "Found removing slop-gate's own suppression
  noise" at the end of this document, deliberately left unpicked there because the cleanup that
  surfaced it is not the evidence it should be decided on.
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

**The stat index's racy window is a margin, not a proof.** `RACY_WINDOW_MS` is 2s. That is not a
generous round number, it is exactly calibrated, and the distinction matters to anyone tempted to
lower it: FAT records last-write time to two-second accuracy (NTFS to 100ns, so FAT is the binding
case), timestamps are truncated to the granule rather than rounded, and therefore a file reporting
mtime `T` may have been written as late as `T + 2000`. Any read after `T + 2000` cannot miss a write
that shared that timestamp; a 1s window would leave exactly half the granule exposed. It closes the
failure this was written for: a
same-length edit landing in the same timestamp tick as the previous one, which returned the previous
content's hash and was caught by a Windows CI run rather than by design. What it does not do is make
the stat fast path sound in general. Windows can defer a last-write-time update well past two seconds
for a handle held open, and a network filesystem with a skewed clock can report an mtime that never
falls outside any fixed window. The Windows case is the sharper of the two and no constant addresses
it: the documented guarantee is only that a file time is correct once the handle that changed it is
closed, so a writer holding a handle open defers the update indefinitely rather than by some bounded
amount. Both are real, both are rare, and the honest description of the fast
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

**Update, self-inflicted-noise session — the "left as is" decision above was reversed.** It held that
the noise was harmless and that hiding it would hide the evidence that the documented trade-off is
real. The first half stopped being true once the count reached 45 of 66: warn-level or not, it made
every measurement taken against this repository mostly a measurement of our own fixtures, and no
reader could tell a new phantom from a regression. The second half was answered rather than
overruled — the evidence now lives in a named assertion in `suppressions/parse.test.ts` instead of in
ambient warnings, which is a stronger proof of the same fact. See "Found removing slop-gate's own
suppression noise" at the end of this document for the measurement and for the product gap it left
undecided.

---

## Found building framework awareness (spec §23)

The mechanism itself is spec §23 and needs no summary here. What follows is what building it turned
up that the design did not predict, plus the measurements a future reader should not have to redo.

**`recommended` moved.** Concepts that elect an owner under `extends: ['recommended']`, against the
commit before this change: **152 → 164** on this repository and on any vitest-only one, **152 → 165**
jest-only, 152 → 153 where both or neither are installed. Twelve gained, none lost. Do not cite that as
a finding-count improvement on its own; it is a
coverage figure. The finding-count delta is separate and also real: `sgate check` on this repository
goes from 53 diagnostics to 65, all twelve new ones from the two rules whose exclusions were retracted
(see below).

**One rule was measured out, and two exclusions were retracted after review caught the reasoning.**
The retraction is the more useful record, so it is first.

### A misattribution, and the method rule that would have caught it

The first version of this work excluded three rules and described `vitest/valid-expect` as an oxlint
bug that "applies jest's arity rule to vitest". **That claim was wrong**, and it was nearly filed
against oxc on that basis. It was caught by someone reproducing it from scratch on a minimal fixture,
getting zero findings, and continuing to dig.

What went wrong is worth naming because it is a repeatable mistake: **the measurement inferred the rule
from the plugin scope the concept id was in, instead of reading the `code` field on the diagnostic.**
The findings really were `code: "vitest(valid-expect)"` — but that could only be established by
checking, and the *explanation* attached to them ("it is jest's rule leaking") was invented to fit and
was false. On a minimal `expect(1, "msg")` the vitest rule reports nothing and the jest rule reports
one, which is the opposite of what the story predicted.

**Rule for this document: a claim that an engine misbehaves must quote the `code`/rule id actually
observed, name the engine version, and say which fixture reproduced it.** Nothing weaker is reportable
upstream, and an unreportable claim sitting in a backlog is worse than no claim — someone eventually
sends it.

Two exclusions were retracted on re-examination under the same suspicion, and both were mine:

- **`no-conditional-expect` (both scopes) — retracted.** Recorded as "8/8 false positives, all a total
  `if`/`else` where every branch asserts". Only four of the eight are that shape. The other four are
  `if (entry.concepts.length > 1) { expect(...) }` — a guarded conditional with no `else`, which can
  pass while asserting nothing, which is exactly the defect the rule exists for. 4/8 does not clear the
  bar.
- **`require-to-throw-message` (both scopes) — retracted.** Recorded as a style preference. All four
  sites are a bare `await expect(...).rejects.toThrow()`, and the rule's actual rationale is that such
  an assertion passes on *any* error, including an unrelated one — a real weakness in those tests. Four
  findings on one repository that the author found noisy is not a measurement.

Both are now in `recommended` and both fire: the twelve findings this change adds to `sgate check` on
this repository are those two rules.

### `oxlint` 1.76.0: `vitest/valid-expect` rejects a computed second argument

The one exclusion that survived, restated to the standard above. Reproduced directly, oxlint 1.76.0:

- `expect(1, "msg").toBe(1)` — `--vitest-plugin -D vitest/valid-expect` reports **0**;
  `--jest-plugin -D jest/valid-expect` reports **1**, `code: "jest(valid-expect)"`.
- `expect(2, key(2)).toBe(2)` — the vitest rule **does** report, `code: "vitest(valid-expect)"`.

So the vitest rule handles the documented two-argument form, and fails only when the second argument is
not a string *literal*. vitest declares `<T>(actual: T, message?: string): Assertion<T>`
(`@vitest/expect` 3.2.7, `dist/index.d.ts:165-166`); a computed string satisfies it. Over this
repository, running each rule alone: `jest(valid-expect)` 37, `vitest(valid-expect)` 27 — and the ten
jest-only ones are exactly the string-literal calls vitest correctly allows.

Reportable to oxc as written, and **still not reported** — the user's call, not this document's.
`jest/valid-expect` must not be included in any such report: it is correct.

**The dual-firing set is "rules both plugins implement", not "the whole scope", and the difference is
one concept.** The first implementation disabled every concept in the absent scope, which also turned
off `correctness.no-export` — from `jest/no-export`, which vitest has no counterpart for and which
therefore never double-reports. Caught only by diffing the elected set before and after; a
finding-count check would have missed it, because the rule fires zero times here. **Diff the elected
concept set, not the diagnostic count, when changing anything that touches `recommended`.**

**A cache test over a single-concept ruleset passes vacuously. This is general, not a detail of this
change.** If the only enabled concept is the one under test, disabling it empties the engine's
selection, the engine drops out of `buildPlan` entirely, and `run()` is never called — so the cache is
never consulted and the assertion holds whether or not the caching is correct. **Any** test of the
form "something changed, so the warm run must not be reused" needs at least two concepts: one that
stays enabled, so the engine still runs and the file is still a cache candidate, and one that moves.

That is how `configHash` came to fold in the detection result here (spec §23.4) — a dependency edit
changes the effective ruleset without touching any file the engine was assigned, so a blind key serves
the previous answer forever. The first version of the test passed with the fold reverted; the
two-concept version fails, which is the only reason it is known to work. **Verify a cache test by
reverting the fix and watching it fail** — for this class of test, a passing test is close to no
evidence at all.

**A workspace-level knip `entry` replaces knip's defaults rather than extending them**
(`ConfigurationChief.getConfigForWorkspace`, 6.31.0: `workspaceConfig.entry ? arrayify(...) :
baseConfig.entry`). The failure mode is the dangerous kind — un-registering `src/index.ts` makes knip
report *fewer* findings, which reads like the tool improving. `KNIP_DEFAULT_ENTRY` restates knip's two
defaults and every contribution is unioned onto them; the guard is pinned behaviourally rather than by
comparing pattern strings, since only a behavioural test catches knip changing its own defaults.

### Left for later, deliberately

- **`suspicious.no-extraneous-class` is in `recommended` again, guarded by NestJS and Angular only.**
  Both profiles ship, but the `angular` one carries a deliberately narrower warrant than every other
  profile: mechanism identity with the measured NestJS case, not its own false-positive count (spec
  §23.5 states the distinction and the asymmetry that justifies it). **Nobody has run this against a
  real Angular repository** — the first person who can should, and should record the count here
  either way. Two open ends beyond that: Angular has been standalone-first since v15, so a modern app
  may contain no `@NgModule` and the profile is simply a no-op there; and the wider claim — that *any*
  decorator-driven DI framework produces this shape — is still untested. Ditto, Lit, and Stencil are
  the obvious next candidates, and none of them gets a profile until someone points at either a
  measurement or the same construct.
- **No profile is scoped to a workspace for the *ruleset* consumer.** `disable-concept` is repository
  wide, so one NestJS package in a monorepo disables the empty-class rule everywhere in it. Engine
  settings already carry a workspace; rules do not, because §6.2's per-workspace layer would be the
  right seam and it is not wired to detection yet.
- **`sgate rules why` is the only surface for detection.** There is no `sgate frameworks` listing, so
  the only way to see everything detected is to ask about a concept some profile touched. Cheap to
  add once there is a reason to.
- **The `literal` probe is one file, one property path, string literals only.** No `satisfies`
  unwrapping, no spread of a shared base config, no variable resolution. Each of those makes MikroORM
  detection stand down rather than answer wrongly, which is the right failure direction, but a
  repository that hits one gets no explanation beyond "not a plain string literal".
- **Detection is not in the lockfile.** §23.4 and §5.5 both say it should be — framework drift is
  ruleset drift and `--frozen-rules` must fail on it — but `slop-gate.lock` does not exist yet.

## Found building the ast-grep engine and the first real `slop.*` rules (spec §13.3, §14)

The mechanism is spec §13.3 and the measurements are in §14 and on each entry in
`registry/entries.manual.ts`. What follows is what building it turned up, and what a future reader
should not have to rediscover.

### Two concepts §14 lists were already owned, and one is not expressible

Worth recording as decisions rather than omissions, because all three look like gaps in the shipped
set:

- **`slop.as-any-cast` is oxlint's.** `typescript/no-explicit-any` is tier 0, like ast-grep, so
  engine preference would hand oxlint the concept anyway and an ast-grep entry would contribute
  nothing but a `config.rule-overlap`. Verified against oxlint 1.76.0 on a five-case fixture: it
  reports `x as any`, `const b: any`, `function d(p: any)` and `<any>x`, four findings all with
  `code: "typescript(no-explicit-any)"`, and reports **nothing** for `x as unknown as string` —
  there is no `any` in that source to find. That residue is `slop.double-cast`, a new concept, which
  is why §14's single row became two.
- **`slop.hallucinated-import` is knip's `deps.unresolved-import`.** The concept catalogue already
  said so in its own description before this work started; checking first is the cheapest thing in
  this whole change.
- **`slop.redundant-comment` cannot be written in ast-grep.** Its rule language relates nodes
  (`inside`, `has`, `precedes`, `follows`) and constrains a node's own text (`regex`, `constraints`).
  There is no construct that tests one node's text against another node's, which is exactly what "a
  comment restating the line beneath it" requires. It needs a JS plugin, and it should not be
  attempted with a heuristic that guesses.

### ast-grep 0.45.0: three behaviours that fail silently

Stated to the standard this document sets for an engine claim — the version, the observation, and
the fixture that produced it.

- **A file past roughly 4 MB is skipped, reported as zero findings, exit 0.** Reproduced on a
  generated 4.8 MB JavaScript file containing a matching `catch (e) {}` on line 1: `[]` on stdout,
  exit 0, and `skippedFileCount=1` in `--inspect summary`. Not a plain byte threshold — 3.7 MB of
  statements parsed, 4.1 MB did not, and 5.2 MB that was one long comment did — so it is a property
  of the parse tree. **This is the failure mode caching makes permanent**, which is why the adapter
  turns it into an `EngineError` naming the batch's largest files rather than trusting it.
- **`ast-grep scan` with no path arguments scans `.`.** An empty `FileBatch` reaching the binary
  would walk the entire repository and report on files the planner never assigned.
- **`--rule` pointed at an empty document is a hard error**, `Cannot parse rule`, not an empty
  result. So "no rules elected" has to be handled before the spawn, not by it.

None of the three is a defect worth reporting upstream — each is defensible behaviour for a
command-line tool — but all three are indistinguishable from "clean" to a caller that only reads
stdout and the exit code.

### `resolveScriptBin` does not generalise to a package whose bin target is rewritten by postinstall

The shared helper's contract is "resolve a `#!/usr/bin/env node` script and spawn it as
`node <script>`", which held for all three previous adapters. `@ast-grep/cli` breaks it in a way that
is invisible on a machine where the postinstall ran: the file at `@ast-grep/cli/ast-grep` is a JS
shim in the tarball and is **overwritten in place** with the native binary by `postinstall.js`. Under
pnpm 10 that script is blocked by default (`Ignored build scripts: @ast-grep/cli@0.45.0` on this
repository), so the same path is a script on one developer's machine and a Mach-O binary on the next.
Resolving the platform package directly is unambiguous in both cases.

**Two things to carry forward.** The next lazily-delivered binary engine (actionlint, zizmor,
hadolint per §13.1) will not be a Node script either, so `resolveScriptBin` is the wrong helper for
all of them — the seam that generalises is "resolve a native executable for this platform triple",
and it is worth extracting the second time it is needed rather than the first. And this repository
should decide deliberately whether to add `onlyBuiltDependencies: ['@ast-grep/cli']` to
`pnpm-workspace.yaml`: it is not needed (the adapter never touches the shim) and skipping it saves a
52 MB hardlink, but a contributor running `ast-grep` by hand from `node_modules/.bin` pays a Node
process and a stderr warning per invocation.

### The suppression parser is textual, and this change ran into it twice

`parseSuppressions` scans raw file text with no idea of comments or string literals, so **any file
that documents the directive syntax gains phantom directives of its own**. That is pre-existing —
`packages/core/src/suppressions/parse.ts` produces three against slop-gate's own `check`, and
`normalize.test.ts` ten — but it is now load-bearing for a different reason: every ast-grep rule's
`note` is help text that wants to show the user exactly what to write. Writing the token in full in
four `note` strings added four phantom `config.unused-suppression` findings to this repository before
the notes were reworded to name the `sgate-disable` family and leave the exact spelling to
`docs/rules/`. New tests *about* directives assemble the token from parts for the same reason, with a
comment saying so.

The real fix is for the parser to require the directive to be inside a comment, which needs a lexer
it does not have. Until then the branch's own rule holds: **this change adds zero findings to
`sgate check` on this repository** (65 before, 65 after), and that was verified against a clean
checkout rather than assumed.

**Update, self-inflicted-noise session:** the pre-existing phantoms this entry describes are gone —
all 41, plus 4 `config.suppression-missing-reason` riding on the same lines. The rule this entry set
("assemble the token from parts, with a comment saying so") is now the whole repository's, not just
new tests'. The lexer question is still open and is now written up as a decision with its options
costed; see the last section of this document.

### A directive naming another engine's concept was reported as unused — fixed, with one case left

The defect and the fix are in §14 and in `judgedBy` (`engine/normalize.ts`). What is left:

- **A bare directive** — `disable-next-line` with a reason and no targets — suppresses every concept,
  so no engine can be excluded on ownership grounds. Two file-granularity engines that disagree about
  whether it matched anything still produce one spurious `config.unused-suppression`. Not reachable
  from any escape this repository documents, all of which name their target, but it is real.
- **The architecture, not the symptom.** Both synthetic concepts are per-*file* facts computed inside
  a per-*(engine, file)* function, and both fixes work around that rather than removing it. The right
  shape is a single suppression pass per file after every engine has reported, which the "Restructure
  before M2" entry above is the natural home for. The obstacle is that folding it into
  `normalizeDiagnostics` is precisely what makes these diagnostics survive a cache hit, so moving it
  means giving the per-file cache entry somewhere to keep the directive outcome.

### Deferred deliberately

- **Rules are TypeScript template literals, not `.yml` files.** §14 wants them contributable without
  writing code, and today a contributor edits verbatim ast-grep YAML inside `rules.ts`. Shipping real
  `.yml` files means teaching `tsdown` to copy them and reading them relative to `dist`, which is
  worth doing when there is a third-party contribution to accept, not before.
- **`slop.swallowed-error` sees only `try`/`catch`.** A `.catch(() => {})` on a promise chain is the
  same defect and is not detected; it is a straightforward second alternative in the same rule, and it
  needs its own measurement before it is added.
- **`slop.stub-implementation` misses a function exported separately** (`function f() {…}` then
  `export { f }`), because there is no enclosing `export_statement`. Expressible with a second rule
  keyed on the export clause; unmeasured, so not written.
- **No rule declares a `fix:`**, and `capabilities.fixes` is `false` accordingly. Every one of these
  findings is a judgement about intent — deleting a comment, inventing an error handler — that a
  mechanical rewrite cannot make. `slop.double-cast` is the only plausible candidate and its fix
  (narrow the source type) is not a rewrite.
- **The 4 MB skip is an `EngineError`, which fails that engine for the whole run** (§18 isolates it,
  exit 3). Naming the offending file instead of the batch's largest would need `--inspect entity`,
  one stderr line per scanned file; worth it if anyone actually hits this.
- **`vue`, `svelte` and `astro` are not covered.** ast-grep has no grammar for them, so unlike oxlint
  this engine cannot reach `<script>` blocks. The `slop.*` concepts apply there too.

## Found building `sgate fix` (spec §11)

The mechanism is spec §11, rewritten there to match what shipped. What follows is what building it
turned up, and what is deliberately still missing.

### The premise that `oxlint` reports fix data in its JSON is false

Recorded to this document's own standard for an engine claim — version, observation, reproducer —
because the work was commissioned on the opposite belief and a future session will be too.

**oxlint 1.76.0 exposes fix data in none of its output formats.** On a five-finding fixture
(`no-unused-vars`, `eqeqeq`, `typescript/no-explicit-any`, `prefer-const`): `--format json` emits
`message`, `code`, `severity`, `causes`, `url`, `help`, `filename`, `labels`, `related` and nothing
resembling a fix; `--format sarif` emits `results[]` with `ruleId`/`level`/`message`/`locations` and
no `fixes` array, which SARIF has a standard place for; `--format agent` is one line of text per
finding. There is no `--fix-dry-run`. `--rules --format json` carries a per-rule `fix` *classification*
(`fixable_fix`, `conditional_dangerous_fix`, …) — which is what the registry generator already reads
for `RuleEntry.fixKind` — but no edit content.

The consequence is architectural, not cosmetic: the only way to learn what an oxlint fix contains is
to let it perform one. Hence `Engine.deriveFixes` and the copy-run-diff approach in
`engine-oxlint/src/derive-fixes.ts`. Worth re-checking on an oxlint upgrade — the day `--format json`
grows a `fix` key, that whole module collapses into three lines in `parse.ts`.

Two further flag findings, same standard, both in spec §11.1: the three `--fix*` flags are **mutually
exclusive** (combining any two is an argument error that leaves the file untouched, i.e. silently
indistinguishable from "no fix"), and they are **not cumulative tiers** (`--fix` applies a
`fixable_dangerous_fix`; `--fix-suggestions` does not apply a `conditional_fix`). Anyone reaching for
`--fix` as a "safe only" gate is wrong.

### Measured: what is actually fixable on this repository

At the commit this landed on, `sgate check` reports **65** findings, and:

| tier | fixable | rules |
|---|---|---|
| `safe` (default) | **0** | — |
| `--suggest` | **0** | — |
| `--unsafe` | **3** | `oxlint/unicorn/no-useless-spread` |

Run for real on a throwaway branch: three files changed, three edits, converged to a fixed point,
`pnpm typecheck` clean, 940 tests green, `sgate check` 65 → 62. The branch was discarded rather than
committed — the change under review is the pipeline.

**Do not read "0 safe" as a defect in the pipeline.** It is a property of this repository's ruleset:
62 of the 65 findings come from rules whose registry `fixKind` is `none` (41 are
`config.unused-suppression`, itself the documented cost of textual directive scanning), and the
remaining three are `unsafe`. A repository that enables `style.*` concepts would see a very different
table — `fixable_fix` covers 155 rules in oxlint's catalogue and `conditional_fix` another 41.

### What `--dry-run` cannot do, and why

It reports **one pass**. A second pass requires the engines to re-read changed files off disk, and
the engines are subprocesses; a dry run writes nothing, so there is nothing for them to re-read. The
output says so explicitly rather than presenting a first-pass diff as the finished result.

Making it multi-pass needs either an in-process engine (the worker pool §8.2 describes, which would
let a NAPI oxlint lint a buffer) or a whole-repository shadow copy, which breaks module resolution
for anything project-granularity. Neither is worth doing for a preview; the honest label is.

### Deliberately not done

- **`knip`'s `--fix` is still not wired up**, exactly as its own entry above says. `capabilities.fixes`
  stays `false` and every entry's `fixKind` stays `'none'`. It can delete files (behind
  `--allow-remove-files`), which is a different risk class from rewriting a range and wants its own
  measurement and probably its own confirmation prompt. `tsc` has no fixes at all.
- **No `oxfmt` adapter**, so spec §11 step 6 does not exist. Spec §11.2 states the consequence.
- **No ast-grep rule declares a `fix:`.** The adapter now carries `replacement`/`replacementOffsets`
  through and is tested against captured real output, but the shipped `slop.*` ruleset produces no
  edits — see §14 for why each rule is a judgement about intent rather than a rewrite. Whoever adds
  the first one flips `capabilities.fixes` to `true` in the same change.

### Sharp edges a future session should know about

- **A derived fix skips any file containing an inline suppression directive, wholesale.** A derived
  fix comes from re-running the engine over a whole file, so it rewrites every occurrence the rule
  finds there — including one the user silenced, which the engine cannot know about. Attributing
  hunks back to individual findings by proximity would be a guess that is wrong exactly when it
  matters, so the file is skipped instead. Cost: a few unfixed findings in the rare file carrying a
  directive. On *this* repository that is not rare — `packages/core/src/suppressions/*` and
  `engine/normalize.test.ts` are full of phantom directives from fixture strings (see "One thing M0
  does not demonstrate"), so those files can never receive a derived fix until the parser learns what
  a comment is. Engine-*reported* fixes are unaffected: they ride on a diagnostic and vanish with it.
- **Every `RuleEntry.priority` in the shipped registry is `50`**, because the generator emits a fixed
  value. So spec §11 step 2's first tiebreak never fires in practice and severity plus rule id decide
  every real conflict. `compareEditPrecedence` appends the range and replacement so the order stays
  total anyway, but the registry's own "fix-conflict tiebreaker" is still, in effect, unused data —
  the same note `generate-registry.ts` already carries, now with a consumer that would read it.
- **`fixTouches` still has no consumer.** The fix arbiter is written and does not need it: overlap is
  decided by byte ranges, which is strictly more precise than a domain tag. The generator's comment
  says to "revisit this once M3's fix arbiter defines what it actually needs from the field" — the
  answer is *nothing*, and the field should probably be deleted rather than populated more carefully.
- **A crash mid-run leaves a partially-fixed tree.** Files are written between passes, because
  re-running subprocess engines requires it. The dirty-worktree rail is the mitigation and the reason
  it refuses a non-git directory outright. There is no journal and no rollback; adding one would mean
  holding every original buffer for the whole run and restoring on failure, which is cheap enough to
  reconsider if anyone reports it.
- **`runFix` runs discovery twice on its first pass** — once itself, to build the write allowlist,
  and once inside `runCheck`. Harmless (a file walk with no engine attached is cheap, per §7) but it
  is the second consumer that would benefit from `resolveRun`'s result being passable *into*
  `streamCheck` rather than recomputed, which is the same prepare/plan/schedule seam the M2
  restructure entry above keeps circling.

---

## Found building the `agent` reporter (spec §12.3)

### `fixTouches` finally has a consumer, and it is a label

The `agent` reporter prints `touches statements` on an automated group. That is the first read of
`RuleEntry.fixTouches` anywhere, and it does not change the "delete it" recommendation above: the
reporter uses it as a human-legible hint about what a fix will move, not as a decision input. If the
field is deleted, one facet disappears from a group header and nothing else changes.

### `sgate init` advertised a format that did not exist

`AGENTS_BODY` in `packages/cli/src/commands/init.ts` has told every initialised repository to run
`sgate check --format agent` since M0. Until this branch, `--format agent` exited 2 with
`unknown format: agent`. The `does not advertise commands that do not exist` test next to it was a
blocklist of literal strings (`'sgate fix'`, `'rules why'`) and so could not catch it — worse, it was
still *forbidding* `sgate fix` weeks after that command shipped. It now extracts every `sgate <word>`
from the body and checks it against the registered subcommand set. **A test that enumerates what must
not appear cannot notice what is missing**; state the invariant over the content instead.

### The textual suppression parser reached production source, not just fixtures

The judgement section tells an agent how to record a false positive, which means printing
`sgate-disable-next-line` verbatim. Written as one string literal, `packages/reporters/src/agent.ts`
then *contains* a directive as far as `suppressions/parse.ts` is concerned, and every run of this
repository reports `config.unused-suppression` against the reporter — inside the very output whose
job is to be trusted. The literal is spliced (`` `sgate-disable${'-next-line'}` ``) with a comment
saying why.

Until now this cost was confined to test fixtures (see "One thing M0 does not demonstrate"). It has
now reached a source file whose *purpose* is to name the directive, and any documentation generator,
help text or error message that does the same will hit it. That raises the price of the parser
knowing nothing about comments and strings from "noisy fixtures" to "cannot mention its own syntax".

**Update, self-inflicted-noise session:** this framing turned out to be the durable one, and it is
now carried forward as an open decision with its options costed — see the last section of this
document. The splice this entry introduced became the repository-wide answer in the meantime.

### The budget floor is group headers, and that is deliberate

"A group header is never dropped" means the fixed cost of the report grows with the number of
*concepts* in the run, not the number of findings. Roughly 600 estimated tokens for two concepts,
1,600 for this repository's six. A repository triggering 60 concepts would have a floor near 12,000
and `--max-tokens 4000` would be unmeetable — the report would print in full and say so.

That is the right trade at this scale and it will stop being right at some scale. The escape, if it is
ever needed, is a third tier between "full group" and "dropped": a one-line-per-concept index
(`concept — N findings, docs`) that replaces the four-line header once the count of groups passes some
threshold. Not built, because nothing has produced a run big enough to need it, and building it now
would mean guessing the threshold.

### Measured: what the reporter says about this repository

At the commit this landed on, `sgate check --format agent` is 18.6 kB, an estimated 6,194 tokens, over
66 findings in 6 concepts — 3 automated (all `oxlint/unicorn/no-useless-spread`, tier `unsafe`) and 63
judgement. Byte-identical across a cold and a warm run, verified with `cmp` against the real CLI, not
only in the test suite.

The split agrees exactly with `sgate fix --dry-run --unsafe`, which applies three edits from that same
rule and reports `0 safe, 0 suggested, 3 unsafe`. That agreement is a *shared-source* property, not two
independent measurements confirming each other: both read `RuleEntry.fixKind`. What the reporter cannot
know is whether an edit will actually materialise for a given finding — a derived fix can be skipped
because the file carries an inline suppression directive (see the sharp edge above), and on this
repository that is not a rare case. The section header therefore promises what `sgate fix` is *willing*
to rewrite, not what it will succeed at.

### Deliberately not done

- **No `--format agent` for `sgate fix`.** The reporter consumes a `CheckResult`; `FixResult` is a
  different shape with its own summary renderer (`renderFixSummary`). Worth revisiting once a second
  consumer wants it.
- **No fingerprints in the output.** They are the stable identity across reformats and the thing a
  baseline is keyed on, but an agent acts on a location, and 32 hex characters per finding is real
  budget spent on something nothing in the loop reads yet. Add them when `sgate baseline` lands and an
  agent has a reason to name one.
- **No `--with-fixes` on `sgate check`.** It would make the diff path live by running the derivation
  step `runFix` does, at the cost of re-running oxlint once per rule per file on a command whose whole
  point is to be fast. `sgate fix --dry-run` already answers the question and the report says so.

## Found building the `schema` engine (spec §13.1, config files)

### Concept election was repository-wide — fixed, and the fix is worth knowing about

**Resolved.** Ownership is now keyed on `(concept, language)`; see spec §5.3. Recorded here because
the failure mode is subtle and the next person to add an engine should recognise it.

`correctness.parse-error`'s catalogue entry has promised since M0 that "any engine capable of parsing
the language may report it". That promise could not be kept: `electOwners` elected one owner per
concept for the whole repository, and its `languages` input is the set of languages *present in the
repo*, not the language of the file. With oxlint's tier-0 `parse-error` (`ts`, `tsx`, `js`, `jsx`) and
a `schema` entry claiming the same concept for `yaml`, in a repository containing both, oxlint won and
the YAML entry was recorded `suppressed` with reason `lower-tier` — so YAML parse errors were never
reported, and the run emitted a `config.rule-overlap` for an overlap that cannot happen. A false
positive in our own governance output.

The schema engine shipped with `config.*` concepts to route around it, and migrated to the shared
`correctness.*` ones once the mechanism was corrected.

Three things learned doing it:

- **The language must only be consulted where a concept has more than one owner.** Enforcing it
  everywhere drops legitimate findings: a project engine reports against files it was never handed,
  and `tsc` naming `tsconfig.json` (language `jsonc`) is in this repository's own test suite. Caught
  by that test, not by review.
- **Suppression records carry a language *list*, not a language.** One record per losing rule, as
  before. Emitting one per language would have quietly multiplied `rules conflicts` and
  `config.rule-overlap` output by four for the ordinary JS/TS case.
- **Before and after on this repository, nothing gained an owner**: 167 ownership entries both ways,
  164 oxlint and 3 schema, 0 suppressions, 0 uncovered, 116 ineligible, selection sizes unchanged. The
  concept *count* fell 167 → 165, which is exactly the two `config.*` duplicates being retired.

**The first genuine dogfooding result.** Running `sgate check` on this repository caught two defects
in this very change: a dead `RuleRef` import left behind when `ConceptWhy.owner` became `ownership`,
and — indirectly, by making the split-ownership case real — a `rules why` verdict that ran to 96
characters and was being truncated mid-word inside its frame. The gate policing a change to its own
arbitration is worth more than either fix.

### Measured: the `schema` engine over 826 real YAML files

Corpus: docker/awesome-compose, kubernetes/examples, actions/starter-workflows and
prometheus/prometheus — four unrelated repositories, 826 YAML files, plus this repository's own.

- **6 findings, all `duplicate-mapping-key`, 0 false positives.** Each was read in context. Two
  discard a *different* value (prometheus's `config/testdata/section_key_dup.bad.yml`, a deliberately
  invalid fixture, and a Kubernetes secret declaring `type` twice); four are redundant
  re-declarations, which are still defects.
- **0 `malformed-document`.** No false positives and no true positives: published repositories do not
  contain YAML that fails to parse, because nothing they run would work if they did.
- **0 `compose-spec` violations.** The binding pattern matched exactly 39 of the 826 files, every one
  a genuine Compose file, and all 39 validated clean. Against ten deliberately seeded defects, nine
  are caught and each collapses to one finding on the offending token.

All three rules are `error` and in `recommended` on that basis — the first engine-owned entries in
`entries.manual.ts` to reach it, and the only ones whose measurement contained no judgement call.
Two of them get there for free: they claim `correctness.parse-error` and
`correctness.no-duplicate-object-key`, which `recommended` already carries at `error`.

### The Compose specification does not constrain `restart`

The tenth seeded defect, `restart: sometimes`, is **not** caught: the schema types `restart` as a
bare string with no enum, so an invalid restart policy is not a schema violation. A clean run is
therefore not evidence that the value was checked. Fixing it means diverging from the upstream schema,
which is a different commitment from vendoring it — recorded rather than done.

### Three traps in the `yaml` package, all of which fail silently

1. **`parseDocument` reports `MULTIPLE_DOCS` as a parse error.** Multi-document YAML is legal and
   ubiquitous; building on it would have flagged every Kubernetes manifest in the corpus.
   `parseAllDocuments` is the only correct entry point.
2. **The `Value` visitor alias excludes `Alias` nodes.** An unresolved-alias detector written with
   `visit(doc, { Value })` sees anchors and never sees a single alias — it returns clean on every
   input. Caught only because a test asserted the positive case; the corpus measurement had already
   been taken with the broken detector and reported a confident zero. `Node` is the correct alias.
3. **`toJS()` emits `process.emitWarning`.** Six files of the corpus trigger "Keys with collection
   values will be stringified" mid-run. `logLevel: 'error'` suppresses it without touching
   `doc.errors`.

### Deliberately not done

- **No JSON support**, so `tsconfig.json` and `package.json` — both named in §13.1's row for this
  engine — are not validated. Every finding needs a source range, and those come from the `yaml`
  package's node ranges; JSON needs a position-preserving parser of its own. Recorded in
  `SCHEMA_EXCLUSIONS` so the gap is visible rather than looking like the schema passed.
- **No Kubernetes schema.** Validation is per apiVersion/kind against the cluster's own OpenAPI and
  the published bundles are hundreds of megabytes. Also in `SCHEMA_EXCLUSIONS`.
- **No workflow schema**, deliberately, because actionlint should own that domain outright rather than
  contest it with a weaker opinion. The engine still applies its structural checks to workflows.

## Distribution findings for the CI-file engines (actionlint, hadolint, zizmor)

Established before writing any adapter, from evidence rather than upstream claims. Recorded here
because the next person to look will otherwise reach for the same packages.

**No official npm distribution exists for any of the three.** None of them mentions npm in its own
install documentation.

- **`hadolint` on npm (0.4.2) is broken — do not use it.** Two independent faults, both reproduced
  directly. (1) It builds `hadolint-${process.platform}-${arch}` and only maps `win32`→`windows`, so
  on macOS it requests `hadolint-darwin-arm64` while upstream publishes `hadolint-macos-arm64` —
  confirmed 404 against 200. (2) `install.js` writes the downloaded binary with `writeFile` and never
  chmods it, so on any Unix the file lands `0644` and `spawn` fails `EACCES` — reproduced with the
  wrapper's exact call sequence. It can therefore only work on Windows, which is the inverse of the
  usual expectation. It also resolves `latest` at run time, so the binary version is unpinned.
- **`github-actionlint` (1.7.12) works but is not a dependency worth taking.** It downloads the real
  binary on *first run* (no `postinstall`), chmods it and caches it, and it tracks upstream versions
  exactly. But it is a two-version, single-maintainer package that **verifies no checksum** — it
  downloads over HTTPS, chmods and executes. That does not belong in the execution path of every CI
  run. Implement D3 directly instead; upstream publishes `actionlint_<version>_checksums.txt`.
- **zizmor is healthy — the concern that it was abandoned was a repository rename.** It moved from
  `woodruffw/zizmor` to **`zizmorcore/zizmor`**: v1.28.0 (21 Jul 2026), MIT, ~6k stars, 38 audit
  rules, Trail of Bits collaborated on its YAML anchor support in May 2026. It has no npm package at
  all, and — unlike the other two — **publishes neither a checksums file nor build attestations**, so
  a lazy-download implementation must carry digests we compute and commit ourselves.
- **Platform gaps in the upstream releases**: hadolint and zizmor ship no Windows arm64 build, and
  zizmor ships no musl Linux build at all, so Alpine cannot run it. actionlint's Go binaries cover
  everything including Windows arm64.
- **Licences**: actionlint MIT, zizmor MIT, **hadolint GPL-3.0** — bundling hadolint binaries into our
  own platform packages would make slop-gate a GPL-3 redistributor with a corresponding-source
  obligation. Lazy download avoids that; bundling does not.
- **The escape hatch, if lazy download ever proves untenable** (the case that would force it is
  air-gapped CI): publish our own `optionalDependencies` platform packages, the esbuild/ast-grep
  pattern. Viable — npm installs only the matching platform, roughly 6–9 MB per engine — but it means
  becoming a redistributor of three upstream projects across ~15 packages with release automation to
  match, plus the GPL-3 obligation above.

## Found building optional engines (`Engine.availability`)

### The specialist engine is usually better, and here is the case where it is worse

Availability-gated ownership rests on a claim that is nearly always true: when actionlint is
installed it should own workflow syntax checking, because a dedicated GitHub Actions linter knows
more about workflows than a generic YAML/JSON-Schema engine does. Ownership is elected on that
basis, so the always-available `schema` engine steps aside the moment actionlint is present.

There is at least one input where that trade goes the wrong way. A maintainer weighing whether some
future optional engine should take ownership from an always-available one needs the counterexample,
not just the principle — the principle is about the median input and ownership is decided for all of
them.

**An unresolved YAML alias.** Measured directly, actionlint 1.7.12 (Homebrew, darwin/arm64) against
this repository's own `schema` engine, same file:

```yaml
      - name: build
        run: *missing-anchor
```

    $ actionlint -format '{{json .}}' ci.yml
    [{"message":"could not parse as YAML: yaml: unknown anchor 'missing-anchor' referenced",
      "filepath":"ci.yml","line":0,"column":0,"kind":"syntax-check","end_column":0}]

    schema engine, same file:
    {"engineRuleId":"parse-error",
     "message":"Unresolved alias `*missing-anchor`: no anchor `&missing-anchor` is defined before it.",
     "range":{"start":138,"end":153}}          # exactly the `*missing-anchor` token

`line: 0, column: 0` is not an approximate position, it is the absence of one: the failure happens
inside actionlint's YAML reader before any node has a location, and go-yaml's message is forwarded
unchanged. slop-gate normalizes that to the top of the file. The `schema` engine gives the offending
token's exact byte range and names both the alias and the anchor it wanted.

So on this input, electing actionlint as owner *loses* a precise diagnostic and substitutes an
imprecise one. The regression is ours, not actionlint's: the tool is behaving reasonably and we
chose to suppress the better reporter. Three ways out, none taken:

- **Leave it.** One input, and a workflow with a broken alias fails loudly either way.
- **Do not let actionlint own `parse-error`.** Cheapest, and defensible on the general ground that a
  *parse* failure is not the specialist's speciality. But it splits one concept between two engines
  by rule rather than by language, which arbitration does not currently express — ownership is keyed
  by (concept, language), see `electOwners`.
- **Let both report and merge on position.** No mechanism exists for this, and building one for a
  single input would be the wrong trade today.

> **Amended when the adapter landed, in two ways.**
>
> **The scope of the `line: 0, column: 0` claim was too wide.** Only the *unresolved-anchor* case
> loses its position. Measured directly against 1.7.12 with four other malformed YAML inputs — bad
> indentation, an unterminated quote, a malformed flow sequence, a stray tab — every one reports a
> real line and column (`5:10`, `4:13`, `4:13`, `6:13`). The paragraph above reads as though
> actionlint has no position for parse errors generally; it does, except where the failure happens
> before any node has a location, which is anchor resolution.
>
> **The second option was taken, and for a different reason than the one given here.** actionlint
> claims neither `correctness.parse-error` nor `correctness.no-duplicate-object-key`, and the
> deciding evidence was not the general principle about specialists — it was that over **403 real
> workflow files from 17 repositories, actionlint reported zero of either**. There was no contested
> ground to win, so the precision loss above was the only thing the transfer had on offer. It also
> did not require the arbitration change this bullet worried about: actionlint simply does not claim
> the concepts, and the adapter drops both message classes from `syntax-check` (`MESSAGE_EXCLUSIONS`)
> rather than mapping them onto anything. See spec §13.5.

### `shellcheck` is a candidate engine in its own right, not an actionlint implementation detail

actionlint shells out to two other programs, and neither is opt-in: `-shellcheck` and `-pyflakes`
default to the bare command names (`actionlint -h`, 1.7.12), so both integrations run unless
explicitly emptied. When the command is missing, actionlint says nothing — the checks simply do not
happen. Confirmed on this machine, which has `shellcheck` at `/opt/homebrew/bin/shellcheck` and no
`pyflakes` at all, and reports the difference nowhere.

That is exactly the failure `Engine.availability` exists to make impossible, arriving through a back
door. A rule that fires on a laptop and not in CI because of what Homebrew happened to install is
worse than no rule, and the discrepancy would be attributed to actionlint rather than to the
shellcheck behind it. **The actionlint adapter will therefore pass `-shellcheck= -pyflakes=`
explicitly**, so what it reports depends only on actionlint's own version.

That leaves shellcheck's findings on the table, and they are not a rounding error: **149 of 264
findings, 56%**, measured in the session that established the distribution findings above. Not
reproduced here — this repository's single workflow is clean with and without the integration, so
the local sample is zero and the number is that session's, not a second confirmation of it.

Revisit shellcheck as its own engine, with its own registry entries and its own `availability()`,
decided on its own evidence:

- Another Haskell binary, so it inherits **hadolint's distribution profile** wholesale: no usable
  npm distribution, platform-specific release binaries, and the same lazy-download-versus-bundle
  question recorded above.
- **GPL-3.0**, the same obligation that rules out bundling hadolint's binaries into platform
  packages of our own.
- Its domain overlaps nothing we ship: shell inside workflow `run:` blocks, and `.sh` files, which
  no current engine claims.

The thing not to do is smuggle it in by leaving actionlint's integration on. That takes shellcheck's
findings without its registry entries, without a concept mapping, without `sgate rules why` being
able to explain any of them, and without anything noticing when it is absent — which is the whole
class of problem this milestone's work exists to close.

---

## Found removing slop-gate's own suppression noise

### Measured: two thirds of what the tool said about this repository was about its own fixtures

`sgate check` reported **66 findings, 45 of them self-inflicted** — 41 `config.unused-suppression`
and 4 `config.suppression-missing-reason`, every one from a file containing directive text as test
data or as a doc comment showing a reader the syntax. Distribution: `suppressions/parse.test.ts` 21,
`engine/normalize.test.ts` 9, `run/check.test.ts` 6, and one doc comment each in
`suppressions/parse.ts` (3 example lines), `run/check.ts` and `engine-knip/src/parse.ts`.

The 37 fixture sites now splice the token — `` `sgate-disable${'-next-line'}` ``, the idiom
`reporters/src/agent.ts` established — and the 4 doc comments name the `sgate-disable-*` family and
leave the exact spelling to the spec and `docs/rules/`. **After: 21 findings, zero `config.*`.**

Two things worth keeping from the verification rather than the result:

- The 4 `config.suppression-missing-reason` findings sat on the *same lines* as 4 of the 41, so they
  went too. Predicting "66 − 41 = 25" would have been wrong by four, and wrong in the direction that
  looks like success. The number above is the tool's, not arithmetic.
- The remaining 21 were checked to be the same 21 the baseline had, by `concept|file:line:column`,
  not by count. A refactor of two dozen fixtures could equally have *silenced* a real finding, and a
  matching total would not have shown it.

### The gap underneath: nothing can document the directive syntax in a scanned file

Splicing is a workaround at each site, not a fix, and the gap it works around is not only ours. **A
user documenting slop-gate in a `.ts` file — a linting guide's code sample, a help string, an error
message, a comment explaining a team convention — hits exactly what we hit.** The answer today is
"write it in Markdown, or break the token apart with a template literal", and neither is something
anyone would guess. Every one of our own sites needed a comment explaining the trick; that is the
tell.

Three options, deliberately not chosen here — this wants deciding on its own evidence, not as a side
effect of a cleanup:

- **An escape marker.** A spelling that means "the token after this is quoted, not live": a leading
  backslash (`\sgate-disable-…`), or a file-level opt-out header. Cheap and language-agnostic, which
  is the whole appeal, and it keeps the parser knowing nothing about comments. Costs: one more thing
  to document and to spell right, and a marker that can be forgotten fails in the one direction that
  matters — the file goes on carrying a live directive nobody can see. A file-level header is worse
  than a per-line escape for exactly that reason: it silently covers directives added later.
- **A doc-comment heuristic.** Ignore the token inside a fenced code block, or on a line inside a
  `/** … */`. This costs the design more than it costs code: §6.3's defence of whole-line scanning is
  that *not* knowing comment syntax is what keeps the parser working unchanged into M2's
  `#`-commented languages. Partial comment-awareness that handles `/** */` but not a shell heredoc is
  the worst of both, and it sits on the path deciding what gets hidden from a user, where being
  subtly wrong is expensive and silent.
- **Accept it**, as ESLint and oxlint do. Defensible, but the honest accounting is that it was
  accepted once already (see "One thing M0 does not demonstrate") and the cost then arrived as 45
  findings, a production source file (`agent.ts`), four ast-grep `note` strings reworded, and this
  cleanup. Accepting it again means accepting that anyone who writes about the syntax pays a tax they
  have to be warned about first.

Settled either way: the *evidence* for the trade-off belongs in an assertion, not in ambient noise.
`suppressions/parse.test.ts` pins "a token inside a string literal is a directive" as a named test.
Forty-five warnings nobody can tell apart from a regression are a worse proof of the same fact — and
that they were the proof was the argument for leaving them.

## Found building the `actionlint` engine (spec §13.5, the first optional engine)

### We have no policy for an engine that is not deterministic

Everything in this project assumes that the same inputs produce the same findings — fingerprints
(§10.1) are position-based, the cache is keyed on content, and the baseline compares finding sets.
actionlint breaks that assumption, and it is the first engine here to do so.

Measured: **ten identical runs over the same 403 workflow files produced 442–447 findings**; 441 were
present in all ten and 6 were not. Every unstable one is `kind: "action"` with the message
`could not parse action metadata`. The mechanism, read off 1.7.12's source rather than inferred:

- `LocalActionsCache.FindMetadata` (`action_metadata.go:255-281`) writes `nil` into the cache on a
  parse failure **and returns the error**; a later lookup gets a cache hit and returns *no* error.
  So whichever reference reaches a broken local action first reports it, and the rest are silent.
- `Linter.LintFiles` (`linter.go:347`) lints files concurrently through an `errgroup`, all sharing
  that one cache — so *which file* wins the race varies.
- `pass.go:67` iterates a workflow's jobs with `for _, j := range n.Jobs`, and `Jobs` is
  `map[string]*Job`. Go randomises map iteration, so **which job wins varies inside a single file in
  a single process too.** Ten runs of `actionlint <one file>` put the same finding on lines 99, 71,
  316 and 359.

That last point is the one that matters for design: per-file invocation, which would have fixed the
cross-file race, does not fix this. Excluding `actionlint/action` handles this instance. It does not
handle the next one, and a rule with an unstable *position* would silently churn the baseline on
every run — the failure mode nobody reports because it looks like normal drift.

Worth deciding before the next binary engine lands (zizmor, hadolint, shellcheck are all queued):
whether adapters should be required to declare determinism, whether the run should detect instability
(a second pass over a sample, compared), and whether a fingerprint should fall back to something
position-independent for an engine that cannot promise stability.

### D3's "lazily on first use" and `Engine.availability` cannot both hold

D3 says an exotic engine is "downloaded lazily into a checksum-verified local cache" and §13.1
glosses that as "downloaded on first use". `Engine.availability` says the probe must touch the
filesystem and nothing else, because `sgate rules why` calls it and an explain-only command must not
change the machine. These are in direct conflict: **availability is what decides whether a first use
ever happens.** An engine reported unavailable is never elected, so its `run` is never called, so a
download placed there never fires.

Resolved in favour of the contract, and the spec text is what should change: "lazy" now means *on
explicit request, cached forever after*. `sgate engines install actionlint` is the only thing that
downloads; `availability()` reports the cache as populated or not; the coverage gap a run prints names
that command. The rejected alternative was to report `available: true` whenever a download *could*
succeed and fetch inside `run` — which would make `sgate check` hit the network mid-run, turn an
air-gapped CI image into an engine error rather than a clean gap, and let `--require-engines` pass on
a machine with no actionlint installed at all.

`sgate engines install` is currently the whole command surface — one engine, one verb. When zizmor and
hadolint arrive it should probably grow `list` and gain a way for `sgate init` to offer the install.

### Pinning a binary makes its staleness our choice, not the user's

Every false positive `actionlint/syntax-check` produced on the corpus — 7 of 9 — is actionlint 1.7.12
not yet knowing about a GitHub Actions feature that shipped after it: `concurrency.queue: max`
(2026-05-07) and background/`wait:` steps (2026-06-25), both confirmed against GitHub's changelog.
18 of the `runner-label` findings are `ubuntu-26.04`, a real GitHub-hosted runner; cpython's own
committed `actionlint.yaml` works around it with a comment citing the upstream PR that adds it.

This recurs by construction and it is asymmetric in an uncomfortable way: because discovery prefers
`PATH`, a user who already has a newer actionlint gets **fewer** false positives than a user we
downloaded for. Tracking upstream releases needs to be a real maintenance task with a real trigger,
not something noticed when someone files an issue. Renovate can watch the GitHub release feed;
what it cannot do is re-transcribe `actionlint_<version>_checksums.txt`, which is deliberate.

### `ClassifyRule.messagePattern` still has no user

It was expected to get one here: actionlint reports YAML parse errors, duplicate keys and schema
violations under a single `kind: "syntax-check"`, which is exactly the "one rule, two concepts,
disambiguated per finding" shape `classify` exists for. Two things removed the need. The concept
split turned out to be **three** classes rather than two, and the first two are owned by the `schema`
engine and dropped by the adapter — so what reaches the registry is one rule with one concept.

Every other actionlint rule maps one-to-one as well. `classify` remains untested against a real
engine, and the next candidate is probably zizmor, whose audits span security concepts that are
genuinely distinct.

### Message-level exclusions needed a home, and rule-level ones needed enforcing

Two of the three false-positive classes inside shipped rules are not whole rules — they are message
patterns inside `expression`. They live in the adapter (`MESSAGE_EXCLUSIONS` in
`packages/engine-actionlint/src/rules.ts`) with the measurement and the reason written out, because
the adapter is what filters, and each has a fixture asserting both that actionlint still produces the
class and that nothing survives.

Rule-level exclusions for a hand-written engine had no home at all. `RULE_EXCLUSIONS` is keyed by bare
oxlint rule id and consumed only by the oxlint generator, so an `actionlint` row there would be
ignored — or, for a name like `id` or `matrix`, would silently exclude an oxlint rule that happens to
share it. `MANUAL_RULE_EXCLUSIONS` is the new table, keyed by `ruleRefKey`, and `entries.test.ts`
asserts every key names a real entry and that none of its concepts reaches `recommended`.

**Two existing exclusions should be backfilled into it**: `slop.swallowed-error` and
`slop.emoji-in-code`, whose reasons are currently prose in a comment in `config/presets.ts` with
nothing checking that the prose and the preset agree. knip's are in the same position.

### The first optional engine made one existing test assert the state of a laptop

`--require-engines on a fully equipped machine still exits clean` (`cli/src/commands/check.test.ts`)
was written when nothing in `defaultEngines` declared `availability`, so "fully equipped" was true by
construction and the test said so in a comment. Registering actionlint quietly turned that comment
into an assumption about the machine: it passed on a developer laptop with actionlint installed and
failed on **all six CI runners**, which are clean machines. The premise is now *constructed* —
`SLOP_GATE_ACTIONLINT_PATH` pointed at an empty file, which the adapter's own resolver honours, with
nothing downloaded and nothing executed (the engine is scoped to `github-workflow`, and the fixture
directory has no workflow, so arbitration never elects it).

The failure was worth having, and installing actionlint in CI would have been the wrong fix twice
over: a test needing a 6 MB download is a test nobody runs locally either, and **CI without
actionlint is the only place the real absent-binary path is exercised at all**. So the companion
assertion was added rather than the workaround — a genuinely unequipped machine exits 3 and names
both the engine and `sgate engines install actionlint` on stderr.

The general shape to watch for, now that engines can be absent: **an environment-dependent test that
still passes both ways.** This one only surfaced because it asserts an exit code. A test that counted
findings would have gone green on both machines and meant different things on each. The audit found
no other case in this package — `pnpm test` with actionlint hidden (`PATH` and cache emptied)
reproduces CI exactly: same 47 skips, nothing else changes — but two pre-existing
`expect(...).toBeGreaterThan(0)` assertions in `cli/src/commands/rules/list.test.ts` are satisfied by
different *content* depending on availability (`engine-unavailable` versus `language-mismatch` as the
ineligibility reason). Neither claim is false; both are insensitive, which is the class to look at
first when the next optional engine lands.

### Smaller things, all measured

- **`column` and `end_column` are in different units.** `column` is a 1-based byte offset into the
  line (`getIndicator` slices with `line[Column-1:]`, Go string indexing); `end_column` is
  `len(indicator)`, built from `runewidth.StringWidth` — display columns — **and inclusive**. They
  agree on ASCII and diverge on any line with a wide character. The adapter derives the end from the
  source using actionlint's own token rule instead.
- **Messages embed absolute paths** (`could not parse action metadata in "/Users/…"`, `the action is
  defined at "…"`), which would make fingerprints, cache keys and baselines machine-specific. Stripped
  by prefix rather than by known message, so a future one is covered.
- **actionlint says nothing about a local action it cannot find** (`action_metadata.go:259-262`,
  deliberate, for submodule-style repositories). Useful to know when measuring: a sparse checkout
  cannot manufacture false "action not found" findings, it can only suppress real input checks.
- **No zip reader, so nothing downloads on Windows.** Upstream publishes `.zip` there and `.tar.gz`
  everywhere else; `node:zlib` covers gunzip and a small ustar reader covers the rest, but a zip needs
  a central-directory parse. The digests for all three Windows assets are recorded already, so adding
  the reader is the only missing piece. Until then Windows is `PATH`-or-`SLOP_GATE_ACTIONLINT_PATH`.
- **`fromJSON` with a trailing comma is unverified at run time.** Three corpus findings are trailing
  commas inside a `fromJSON('[…,]')` literal — invalid by the JSON specification, and shipped in
  `recommended` on that basis. Whether GitHub's own `fromJSON` rejects them was not established; in
  two of the three a `||` short-circuits before the call, so the affected repository's green CI is not
  evidence either way. Recorded on the registry entry too.
- **`recursive alias …` is left in `config.workflow-syntax`.** It is a YAML-level defect like the two
  classes the adapter drops, but it was not confirmed that the `schema` engine reports it, and
  dropping a finding on the assumption that someone else covers it is the mistake this whole section
  exists to avoid. Cheap to check and then decide.

## Found building the `biome-css` engine (spec §13.6)

### Stylesheets are only half covered, and SCSS has no answer in Biome

**`biome-css` covers `css`. It cannot cover `scss` or `less`, and nothing else in the toolchain does
either.** This is a hole in the file set the tool was commissioned for ("TypeScript, YAML, JavaScript,
CSS, SCSS, HTML, Vue, React, Tailwind, Dockerfile, docker-compose, GitHub CI/CD"), so it is recorded
here rather than left to be discovered by a user.

Biome 2.5.6 does not lint SCSS *at all*. It does not lint it badly — it does not open the file:
`biome lint x.scss` prints `Checked 0 files` and lists the path under "these paths were provided but
ignored". Same for `.sass` and `.less`. Upstream's own
[language support table](https://biomejs.dev/internals/language-support/) marks SCSS ⌛ parsing,
⌛ formatting, **🚫 linting** — linting is not listed as in progress, only parsing and formatting are.
SCSS is on the [2026 roadmap](https://biomejs.dev/blog/roadmap-2026/) as the most-requested feature
with work started, and that work is on the parser.

The size of the gap, from the same ten repositories the CSS measurement used: **119 `.scss` files and
176 `.less` files** that this engine cannot see. One repository considered for the corpus and dropped,
`jellyfin/jellyfin-web`, has **111 `.scss` files and zero `.css`** — a real production web application
for which `biome-css` provides no coverage whatsoever. `scss` and `less` are already `LanguageId`s and
the discovery layer already classifies both, so the inventory sees these files; no engine claims them.

**The candidate is `stylelint`**, which does cover SCSS and Less, is npm-native (the same distribution
shape as oxlint and Biome, so no download or platform matrix), and is the tool most projects with SCSS
already run. **It has not been evaluated** — no corpus, no per-rule counts, no view on how much of its
rule set overlaps what `biome-css` already owns for plain CSS, and no measurement of what it costs: it
is JavaScript, where every other file-granularity engine here is a native binary. Nothing above should
be read as a recommendation, only as the obvious place to start.

Until then the honest statement is that stylesheet coverage is CSS-only, and the engine is built so
that this cannot be mistaken for coverage: it declares `languages: ['css']` and nothing else, so
arbitration never assigns it an SCSS file and never produces a clean result for one it did not read.

### Deferred deliberately

- **A CSS-preprocessor framework profile (§23) would return two rules to `recommended`.**
  `noUnknownAtRules` and `noUnknownFunction` are excluded as revisit triggers rather than verdicts —
  both are correct about plain CSS and are defeated by PostCSS, Tailwind v3 or Mantine compiling the
  construct away. The detection signals are concrete and already inventory-visible: a
  `postcss.config.*`, a `postcss`/`postcss-preset-*`/`tailwindcss` dependency, or
  `@extend`/`@tailwind`/`@apply` in the file itself. On a repository that genuinely ships plain CSS
  both rules catch something nothing else does and CSS discards silently.
- **`useBaseline` needs a browser-support floor slop-gate does not have.** It produced 2002 findings
  on the corpus, including 307 against Visual Studio Code, which ships its own Chromium. It is either
  entirely right or entirely irrelevant per repository and nothing in the run can tell which. A
  browserslist-shaped input in `slop-gate.config.ts`, translated by the adapter into the rule's own
  options, would turn a policy nobody configured into a genuine correctness check.
- **`noInvalidGridAreas` is excluded on an upstream defect, not on accuracy.** Fed Biome's own
  documented invalid example it reports nothing whenever the declaration sits on its own indented
  line — four formattings tried, the two conventional ones silent, with `--profile-rules` confirming
  the rule executed each time. Worth re-testing on each Biome upgrade; the fixture to do it with is
  already written.
- **`noUnknownUnit` should be reported upstream.** `x` is a standard CSS resolution unit (the `dppx`
  alias, CSS Values and Units 4) and Biome 2.5.6 rejects it. Two findings on the corpus, both valid.
- **Biome reports only the first duplicated property per block.** Verified with two independent
  duplicate pairs in one block producing one finding. `noDuplicateProperties` counts are therefore a
  floor, and a user who fixes the reported pair may get a new finding in the same block on the next
  run. Not worth working around; worth knowing.
- **`--reporter=json` prints an instability warning to stderr on every run** ("the output might
  change between patches/minor releases"). The adapter pins `@biomejs/biome` exactly for this reason,
  but a minor upgrade needs the parser re-checked, not just the tests re-run.

### A near-miss worth keeping, and the method that caught it

Two claims made from the corpus measurement were wrong, in opposite directions, and both were caught
by authored fixtures rather than by more measurement:

- Six `noDuplicateProperties` findings were classified as Biome reporting across a nested
  `@container` boundary, and written up as an upstream nesting defect. The fixture refused to
  reproduce it: Biome handles CSS nesting correctly. All six were in zulip stylesheets that fail to
  parse, where recovery had flattened the nesting — a class the adapter now discards wholesale.
- `noInvalidGridAreas` was in the shipped set on a scratch measurement that showed it firing. Its
  fixture showed it cannot fire on conventionally formatted CSS. Zero findings on 1729 files is
  consistent with "rare defect" and with "cannot fire", and **only a fixture separates those two**.

The rule this suggests: a corpus measures how often a rule is *wrong*; it cannot establish that a
rule *works*, and a zero on a corpus is not evidence of anything until an authored case has fired.
Both halves are needed and they answer different questions, which is why they are never summed.

---

## Found building `sgate mcp` (spec §12.1)

### `baseline_status` names a feature that does not exist

§12.1 listed `baseline_status` among the tools. There is nothing to report the status of: no `sgate
baseline` command, no `.slop-gate/baseline.json` reader or writer, no fingerprint store. The only
trace of §12.2 in the codebase is the `'baseline'` member of `Diagnostic.suppressed.by`, reserving
room in a union.

The tool is trivial once the baseline lands — fingerprints are already computed on every diagnostic
(§10.1) and the `agent` report already groups by concept — so this is a note for whoever builds
§12.2, not a backlog item of its own: **add the MCP tool in the same change, or §12.1 keeps
promising it.**

### HTTP, and the threat model it needs before it ships

Deferred deliberately, not for want of time. What it would have to carry, none of which stdio needs:

- **Bind loopback by default**, and make a non-loopback bind an explicit, argued flag. A quality gate
  that will analyse a directory and return its source in code frames is a file-read primitive.
- **`Origin` and `Host` validation.** A browser on the same machine can reach a loopback port; DNS
  rebinding turns "local only" into "any web page the user visits". The SDK ships
  `validateOriginHeader`, `validateHostHeader`, `localhostAllowedHostnames` and
  `localhostAllowedOrigins` for exactly this, so the work is wiring and testing, not invention.
- **Authorization.** The 2026-07-28 revision hardened it and the SDK exposes `requireBearerAuth` and
  the protected-resource metadata helpers. An unauthenticated local port is a decision, and it should
  be written down as one.
- **`rootDir` confinement stops being enough.** Over stdio the client launched the process and chose
  its cwd; over HTTP the caller did neither, so the boundary has to come from configuration.

Until that is written and tested, `sgate mcp` is stdio and §15's `--http` is a promise. `packages/cli`
would need `@modelcontextprotocol/node` (hono) or `@modelcontextprotocol/express` for the transport.

### `ruleset.uncovered` counts concepts an absent engine owns, whether or not they applied

Not introduced here, but this is where it bites. `electOwners` pushes a concept to `uncovered` when no
candidate is *capable*, and `isCapable` filters out engines whose `availability()` failed — before the
language question is ever asked. The language-mismatch exemption (`elect.ts`, "if some candidate is
otherwise fully capable and only fails on language, the repository simply doesn't contain that
language — not a coverage gap") therefore only protects concepts whose engine is *installed*.

Measured: a fixture with no workflow files and no actionlint reports thirteen `config.workflow-*`
concepts as uncovered, while `unavailableEngines` correctly reports actionlint as having cost the run
nothing. Two fields describing the same absence, disagreeing.

The `agent` reporter already sidesteps it — `coverage:` counts engine gaps only, and prints
`uncovered:` as a separate notice — and `sgate mcp` follows suit rather than inventing a second rule
(§12.1). But the reporter does print, on the same run, `uncovered: 13 enabled concept(s) … so nothing
checked them` and `coverage: no findings. Nothing was omitted.` Both are defensible readings of
different fields; together they are confusing.

The fix belongs in `elect.ts`: apply the language-mismatch exemption before capability, or record on
each uncovered concept *why* it is uncovered so a reporter can tell "no engine exists for this" from
"the engine exists and is not installed, and there was nothing here for it anyway".

### The client SDK's default is the 2025 handshake, which our tests nearly hid

`@modelcontextprotocol/client` 2.0's `versionNegotiation.mode` defaults to `'legacy'`. A v2 client
constructed with no options opens with `initialize`, and `serveStdio` serves it — correct backward
compatibility, and a way for a whole e2e suite to pass without the stateless path being exercised
once. `packages/cli/src/commands/mcp/e2e.test.ts` pins `{ pin: '2026-07-28' }`, which has no fallback,
so the connect is itself the assertion.

Two smaller facts from the same source, both surprises worth writing down:

- **`StdioClientTransport` scrubs the child's environment.** With no `env`, it passes
  `getDefaultEnvironment()` — a safe-list, not `process.env` — so an override like
  `SLOP_GATE_ACTIONLINT_PATH` never reaches the server. Any future e2e test that needs to force an
  engine absent must pass `env` explicitly. This is why the coverage-gap tests drive the handlers
  directly instead.
- **`'auto'` on stdio spawns a second process** to probe with `server/discover`, then starts the
  caller's transport once the era is known. Harmless here, but it means a probing host pays two
  process starts, and `sgate mcp` is on the path twice.

### Shutdown on stdin EOF is a drain, not a proof

The stdio binding makes closing stdin the shutdown signal, and the SDK's `StdioServerTransport` does
not act on it — it listens for `data` and `error` only — so `commands/mcp/index.ts` owns the exit.
Closing the transport when stdin ends throws away in-flight work, which `in-flight.ts` fixes by
waiting for the handlers. But the SDK serialises and writes the response *after* the handler resolves,
so waiting for handlers alone still loses it: measured, `printf '…' | sgate mcp` exited 0 having
written nothing.

The current fix is one `setImmediate` between the last handler and the close, which drains the
microtask queue the response is written from. It is correct for every case tested and it is a drain
rather than a guarantee: a handler whose response path crossed a macrotask boundary would still be
cut off. The exact version counts responses on the way out — wrap the transport's `send`, or hand
`StdioServerTransport` a counting `Writable` — and closes when requests-in equals responses-out.
Worth doing if anything ever writes to the wire outside a tool result (progress notifications,
`subscriptions/listen`), which would break the one-response-per-request assumption that makes counting
easy in the first place.

### `renderFixSummary` never prints `skipped.aboveTier`

`FixResult.skipped` has four members and `packages/cli/src/commands/fix.ts` prints three: `overlap`,
`outOfRange` and `outsideInventory`. `aboveTier` — edits that existed but were above the tier the run
was willing to apply — is dropped. It is the one a user is most likely to want, because it is the
answer to "why did `sgate fix` change nothing when `check` said these were fixable". The MCP
`propose_fixes` tool returns all four. Trivial to fix in the CLI; noted rather than done, because it
changes output every `fix` test asserts on.

---

## Found making per-rule options reach engine adapters (spec §6.2)

### `EngineRuleSelection` should carry the options, and does not

The shape options belong in is `Map<engineRuleId, { level, options }>`. They are on
`RunContext.ruleOptions` instead, a second map keyed the same way, and the reason is not that the
better shape was not obvious.

Widening `EngineRuleSelection`'s value would break every adapter outside this repository — it is part
of the published `Engine` contract — and, worse, it breaks four adapters *inside* it silently.
`engine-biome-css` (`config.ts:54`), `engine-tsc` (`config.ts:22`), `engine-knip` and `engine-astgrep`
all decide enablement by comparing that value against the literal `'off'`. A union that admits a
tuple keeps those comparisons compiling and makes them wrong the day a rule they own gets options: an
`['off', …]` value is not `'off'`, so a disabled rule reads as enabled. The type error that would have
caught it does not fire, because the comparison is against a string literal, not an exhaustive switch.

Doing it properly means one atomic change: widen the value, update the six adapters to
`splitRuleSetting`-style destructuring, and add a test per adapter that an `off`-with-options value
still disables. Worth doing before the adapter count grows again. Two parallel maps that must stay in
sync is exactly the shape that rots.

### Options on an engine rule id key do nothing, and nothing says so

`RuleMap` accepts `'oxlint/eqeqeq'` as a key (spec §6.1). `buildPlan` never reads engine-rule keys —
it resolves levels and now options from *concept* ids only (`resolver.maxLevelOf`,
`resolver.optionsOf`) — so a user who writes `'oxlint/eqeqeq': ['warn', 'smart']`, which is the more
precise thing to write since options are engine vocabulary, gets nothing. It is not reported either:
the key is in `SHIPPED_RULE_KEYS`, so `config.dead-override` does not fire for it.

This predates options — an engine rule id key has been inert for levels too — but options make it
worse, because the engine-rule form is the one that reads as correct. Either wire engine-rule keys
into the plan, or report them as dead. The second is a smaller change and arguably the honest one:
the spec already says the concept id is the canonical form.

### A rule owning two option-carrying concepts resolves silently

`optionsFor` (`planner/plan.ts`) walks a rule's concepts in sorted order and takes the first that
specifies options. Deterministic, tested, and arbitrary — `no-unused-vars` owns both
`dead-code.unused-variable` and `dead-code.unused-import`, and if a config gave those different
options one of them would be discarded with no diagnostic. It belongs with the other `config.*`
governance output. Not built now because no shipped rule has two option-carrying concepts, which is
also why it would have gone unnoticed.

### Path-scoped options are refused, and oxlint could actually do them

Options in an `overrides` block are ignored and reported as `config.dead-override`, because an engine
is configured once per run (spec §6.2). That is true of the *orchestrator*, not of every engine:
oxlint's own config format has an `overrides: [{ files, rules }]` key, so the adapter could be handed
the override structure and translate it. Doing so means `materializeConfig` taking path-scoped rules
rather than a flat selection, and it means every engine without that capability needs a way to say
so. Real, and much larger than this change.

### The corpus figures in `presets.ts` are not all from one corpus

This change measured over 32,035 script files from the twelve repositories named there; the four
rules promoted before it cite 21,777 from the same twelve. The repositories moved on between the two
runs, and nothing pins them. Every count in the preset is therefore comparable within a promotion and
only roughly comparable across promotions. Pinning the corpus to explicit commits — a lockfile of
`owner/repo@sha`, checked out on demand — would cost little and make a re-measurement mean something.
Worth doing before the next promotion argues from a delta.

A second, sharper trap from the same work, recorded because it silently multiplies every figure:
**oxlint's JSON output mixes rule diagnostics with `TS(…)` parse diagnostics.** Counting `"message"`
occurrences rather than `"code": "<rule>"` reported 1249 `eqeqeq` findings where there were 84 — the
difference being prettier's deliberately-malformed `tests/format` corpus, which oxlint fails to parse
and reports on regardless of which rules are enabled.
