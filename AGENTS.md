# slop-gate

A code-quality gate for repositories written with AI assistance. Aggregates analysis engines behind
one interface, one config file and one diagnostic model.

## Read this first

The authoritative design is `docs/superpowers/specs/2026-07-30-slop-gate-design.md`. It records every
architectural decision and why it was made. Do not redesign a subsystem before reading its section.

`docs/measurements.md` holds the figures behind decisions the source states only as a conclusion — the
benchmark, the corpus and the method. Read it before re-tuning a constant or removing a bound.

That split is enforced, not merely intended: `not-recommended.test.ts` fails a reason over 900
characters and a dangling `evidence` anchor. The tables were 36 kB of prose before it.

`docs/impact-and-reliability.md` is the vocabulary the product uses for findings: an **impact** of 1–3
shown as a bar, and a **reliability** percentage that is absent rather than assumed. `error`/`warning`
stay in the plumbing for SARIF and the exit code, and are not what the tool says to a reader.

`docs/brand.md` is the palette, sampled from the logo rather than chosen, with the contrast figure for
every token and which ones are not allowed to carry text. Anything with a user interface reads it
first — the tokens are already defined in `packages/rules-explorer/src/styles.css`.

## Commands

- `pnpm check` — typecheck, test, and run the gate on ourselves. Run this before claiming anything works.
- `pnpm perf` — measure the cost of a run against `packages/perf/baseline.json`. Read `docs/performance.md`
  before changing a KPI or re-recording a baseline; it refuses a loaded machine rather than guess.
- `pnpm bench` — the per-call cost of the hot paths. Gated in CI by CodSpeed, which instruments rather
  than times, because a shared runner cannot measure a duration.
- `pnpm build` — build all packages.
- `pnpm test -- <pattern>` — run a subset of tests.
- `pnpm dogfood` — build, then `sgate check --max-warnings 0` on this repository. The CI step is this
  same script, so a red build reproduces with one command.

## The gate runs on itself

`pnpm dogfood` is the same invocation locally and in CI, and three things about it are deliberate.

**It builds first.** `pnpm test` resolves workspace packages to `src` through a vitest alias, so no
in-process test touches `dist` (see `vitest.config.ts`). The dogfood runs the linked `sgate` bin, which
loads `packages/cli/dist/main.js` — the artefact a user installs, and the one thing that alias gave up
covering. The build stays inside the `dogfood` script rather than becoming a `test` dependency, so
`pnpm test` is not slowed by it, and the check stays outside turbo rather than becoming a turbo task,
because a cached "the gate passed" verdict is not a verdict. `--output-logs=errors-only` is there
because turbo replays a cached task's log in full: 229 lines of tsdown output ahead of the findings,
which in CI is the whole step log a contributor opens. A build that fails still prints everything.

**`--max-warnings 0`, not bare `sgate check`.** Only 239 of the 638 concepts `recommended` enables here
are `error`; 398 are `warn`, including all four `slop.*` rules. Measured: a file with an `as any` cast
and a stub implementation exits `0` from a bare `sgate check` and `1` with the flag. Without it the
gate would pass on precisely the findings this tool exists to make. One concept is still not gated —
`config.rule-overlap` is `info`, and there is no threshold flag for `info`.

**No baseline, and CI installs no optional engines.** This repository is at zero findings; a baseline
would only let that rot silently. A finding gets fixed, or the rule gets argued with. `actionlint`,
`hadolint` and `deps-security` are absent on a fresh machine, which a run states out loud as a coverage
gap naming the command that closes it — installing them in CI and not locally would make CI the first
place a finding ever appears, and `actionlint`'s installer has no Windows path at all
(`packages/engine-actionlint/src/release.ts`), so it could not be uniform across our own matrix even
then. Exercising the download path and the advisory data against the live network belongs in a
scheduled job, where a failed fetch is triage rather than a blocked pull request.

## The ruleset requires one check, and it is `ci`

`ci` in `.github/workflows/ci.yml` exists only to aggregate `commitlint` and `check`, and it is the single
required status check. Do not require the matrix jobs directly: their names embed the operating system and
the Node version, so dropping a Node version removes a required check, and every pull request then waits
forever on a status nothing will ever report — with no error in any log. That is not hypothetical; it cost a
hand-edited ruleset on 6 August 2026.

Adding a job that should block a merge means adding it to `ci`’s `needs`, never to the ruleset.

## Conventions

- ESM only. Node >= 24. No CommonJS.
- **Dependency versions live in `pnpm-workspace.yaml`, never in a manifest.** A `package.json` says
  `catalog:` for anything external and `workspace:*` for anything internal. `typescript` is the one
  dependency with more than one version, and its two named catalogs say why.
- Byte offsets are the internal truth for positions; line and column are always recomputed by `core`.
- Public data structures use repo-relative POSIX paths.
- **A comment states a constraint the code cannot show, on one line.** Not what the next line does,
  not the signature in words, not why a change was made — that belongs in the commit message. An
  external spec, a library bug being worked around, an ordering something outside the file depends on,
  a bound that was measured: those earn a line. If the code needs prose to be followed, rename or split
  it instead. Anything longer than a line goes to `docs/measurements.md` (figures and method) or the
  relevant `docs/` page, and the code keeps a pointer.
- `packages/core` must not depend on any engine package.
