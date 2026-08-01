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
