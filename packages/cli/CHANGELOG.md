# @misaon/slop-gate

## 0.2.0

### Minor Changes

- [#71](https://github.com/misaon/slop-gate/pull/71) [`02cae2c`](https://github.com/misaon/slop-gate/commit/02cae2cd55f4a823c88cea9b64f4dd41858c0869) Thanks [@misaon](https://github.com/misaon)! - Six defects found by running slop-gate over 20 real repositories — one per framework it claims to
  handle — with no config, the way a first-time user would.

  Across that corpus: **findings 22,329 → 20,255, error-severity findings 3,777 → 3,005, and the
  number of repositories where an engine crashed 3 → 0.**

  **A dependency advisory can no longer take the whole engine down.** OSV bounds are
  publisher-supplied and not all of them are semver; the snapshot shipping today holds twelve that
  are two-part, one of which is on `next`. Comparing against a raw bound threw, and the engine died
  with _every_ advisory for the repository unreported. `vercel/commerce` now reports 12 it had been
  silent about, including a _high_-severity Next.js request-deserialisation issue.

  **An unreadable lockfile is a coverage gap, not an engine failure.** A `lockfileVersion: 1` file —
  npm 6 era, still common — exited 3 saying `deps-security` failed. The engine already had the right
  answer for a lockfile it cannot read; this routes the npm case to it. `ngx-admin` exits 1 on its
  own findings now.

  **Preact is not React.** The `react-jsx-transform` profile knew the automatic runtime and
  `jsxImportSource`, but not the oldest way of not being React: `"jsx": "react"` with a `jsxFactory`
  of your own. A repository that exists in order not to be React was told to import React 4,220
  times.

  **A generated file that says so on line 1 is now recognised as one.** Detection was by filename
  only. `fastify/fastify`'s ajv-generated `lib/config-validator.js` is named like any other source
  and produced 997 findings — 27% of everything said about that repository.

  **`tsc` no longer reports inside `node_modules`.** Every other engine sees only the inventory,
  which skips it. `tsc` reports on the whole program, so a project without `skipLibCheck` surfaced
  type errors in its dependencies' bundled `.d.ts` files: 587 of solid-start's 1,802.

  **`vitest/valid-title` warns rather than errors.** "Title must be a string" fires on any title that
  is not a literal, and a table-driven test names its cases from a variable. 163 of 174 findings
  across five repositories are that pattern, and none is wrong about the type.

- [#75](https://github.com/misaon/slop-gate/pull/75) [`3521c0a`](https://github.com/misaon/slop-gate/commit/3521c0a25b311292503f20549a277fde2e4a1b68) Thanks [@misaon](https://github.com/misaon)! - `sgate check --report <name>[:<path>]` produces additional reports from the same run — for example
  `--report github,sarif:sgate.sarif` gives the readable log on stdout, annotations on the diff and
  SARIF on disk at once. Previously each format needed its own invocation, so a CI job wanting
  annotations and SARIF analysed the tree twice and sent two telemetry events.

  `--format` still owns stdout. A report given no path shares that stream, which only `github` may do
  and only alongside `--format=pretty`: it is workflow commands embedded in a log, where every other
  format is a whole document that would interleave into something parsing as neither.

- [#71](https://github.com/misaon/slop-gate/pull/71) [`5477263`](https://github.com/misaon/slop-gate/commit/5477263e64fd871baab90bd2729b9157554de53f) Thanks [@misaon](https://github.com/misaon)! - The cold run — the one CI takes, and the one an alpha tester sees first — is between 1.3x and 2.6x
  faster, on a third to a quarter of the memory. Warm runs were already fast and are unchanged.

  Measured `--no-cache`, medians of 3, same checkout built at two commits, 4-core arm64:

  |                              |   before |        after | peak RSS         |
  | ---------------------------- | -------: | -----------: | ---------------- |
  | html5-boilerplate (61 files) | 1,156 ms |   **449 ms** | 334 → **105 MB** |
  | withastro/docs (2,941)       | 2,139 ms |   **970 ms** | 405 → **163 MB** |
  | immich (3,378)               | 7,179 ms | **3,680 ms** | 456 → **326 MB** |
  | solid-start (517)            | 8,570 ms | **6,237 ms** | 398 → **318 MB** |

  All 20 repositories in the corpus report identically, finding for finding and in the same order.

  **The malware table is opened, not read.** 218,718 packages and 42 MB of JSON were parsed on every
  run of every repository to answer a few thousand name lookups — 40% of all CPU on a small project,
  plus the GC behind 200 MB of heap. It is now a sorted index with the records left on disk, and only
  the names your lockfile actually holds are resolved.

  **One lockfile is no longer parsed twice.** The `yaml` package's duplicate-key check is quadratic
  and was more than half of immich's 1 MB `pnpm-lock.yaml` parse; a lockfile is generated, so it is
  off. The schema engine was then parsing the same file again — 1,016 ms for zero findings, since a
  lockfile binds to no published schema — and now skips lockfiles outright.

  **Engines run concurrently.** They are independent, but ran one after another, leaving a four-core
  machine at 1.3–2.0x CPU:wall. Results are still emitted in plan order, so what a reporter sees is
  unchanged.

  **`--timing` had to become more honest to say this.** `unattributedMs` was the run minus the sum of
  the phases, which goes negative once phases overlap. The report now carries `busyMs` — the wall
  clock with at least one phase in flight — so `startupMs + busyMs + unattributedMs` is the run
  exactly, and `--timing` says out loud when phases overlapped rather than letting their shares sum
  past 100% unexplained.

  **`sgate engines install advisories` must be re-run.** The snapshot format is version 2. An older
  snapshot is simply not found, which is already a stated coverage gap naming the command.

- [#70](https://github.com/misaon/slop-gate/pull/70) [`9928cd0`](https://github.com/misaon/slop-gate/commit/9928cd038a05faf3d45be317f4e15971bd230b35) Thanks [@misaon](https://github.com/misaon)! - Fixes for six defects, five of them found by running slop-gate on real projects rather than on
  fixtures.

  **`tsc` now works on the standard NestJS layout.** A tsconfig with `rootDir: ./src` and tests in
  `test/` made tsc fail with `TS6059` per file — an engine failure, so the project got no type
  checking at all. `--noEmit` does not suppress it, because `rootDir` is enforced while the program
  is built. Widened to the analysed root, which changes no diagnostic.

  **Next.js rules no longer fire in repositories without Next.js.** A Remix app was being told to
  use `next/image`. All 21 rules in the scope resolve to "import from `next/…` instead"; a project
  without Next.js cannot follow that.

  **Nuxt is understood properly.** Its `#app` and `#shared` aliases were 14 unresolved-import
  findings at `error` on `nuxt/nuxt.com`, and each Nuxt layer now becomes its own knip workspace
  rather than being invisible to it. On that repository: unused exports 65 → 15, unresolved imports
  14 → 2, errors 19 → 7.

  **Firebase Functions handlers are entry points**, not dead code — the platform loads them by path.

  **A framework that generates its tsconfig is a coverage gap, not a crash.** Nuxt's tsconfig extends
  `.nuxt/tsconfig.json`, which exists only after `nuxt prepare`; a fresh clone used to exit 3.

  **`sgate check --format=json --max-findings <n>`** bounds the report. `medusajs/medusa` produced a
  23.9 MB document; at 500 findings it is 0.4 MB and carries `truncated: { dropped, of }` so a
  consumer can tell a bounded document from a complete one. Opt-in — the unbounded document is still
  the default. The report version goes to 5 for that reason.

- [#67](https://github.com/misaon/slop-gate/pull/67) [`4c714dc`](https://github.com/misaon/slop-gate/commit/4c714dc9de29f8c8ddf50a4262073df60c9e10f0) Thanks [@misaon](https://github.com/misaon)! - Nothing changes for you; this release only makes the version numbers agree again.

  The twelve engine packages were published at 0.2.0 during an attempt to rename the CLI to
  `sgate`. npm refused that name — it is too close to existing packages (`slate`, `xstate`,
  `sade`) — so the rename is reverted and the CLI stays `@misaon/slop-gate`. This brings it up
  to 0.2.0 alongside the engines it ships with.

  Install and invocation are unchanged:

  ```bash
  npm install -D @misaon/slop-gate
  npx sgate check
  ```

- [#73](https://github.com/misaon/slop-gate/pull/73) [`5e3fd73`](https://github.com/misaon/slop-gate/commit/5e3fd73a7a9f168207702321dcaefa1db37620e4) Thanks [@misaon](https://github.com/misaon)! - Telemetry now has an address, so it is opt-out rather than opt-in in practice as well as in
  principle. Until now nothing was ever sent: the sender looked for `SLOP_GATE_TELEMETRY_URL`, no build
  set one, and every run took the silent early return. Reports now go to
  `https://slop-gate-telemetry.ondrejmisak.cz/api/telemetry` unless you say otherwise.

  What was already true is unchanged — anonymous rule identifiers and counts, no code, no paths, no
  messages, no configuration, at most one report an hour per checkout, and a notice on the first run.
  `sgate telemetry` prints the exact document a run would send.

  Off is `SLOP_GATE_TELEMETRY=0` or `DO_NOT_TRACK=1`. `SLOP_GATE_TELEMETRY_URL` still points a run
  somewhere else, and setting it to an empty string now means nowhere at all — a third state, for a
  test or an air-gapped build that wants everything to run with the send removed.

### Patch Changes

- [#75](https://github.com/misaon/slop-gate/pull/75) [`e5e8b65`](https://github.com/misaon/slop-gate/commit/e5e8b654af2e4dbbbac4fc0fccea636b514af335) Thanks [@misaon](https://github.com/misaon)! - `sgate rules list --engine` now offers only engines a run can use. `EngineId` also names engines the
  design has an arbitration position for but no package implements — `tsgolint`, `zizmor`, `eslint` —
  and the error listed all of them, sending a reader after a run that cannot happen.

  The analysers are pinned exactly, as `@biomejs/biome` and `oxfmt` already were: which version runs
  decides what the tool reports, so a caret bump changed findings without a pull request. The pins hold
  the versions already in use rather than the newest available, because `.github/dependabot.yml`'s
  cooldown exists for exactly this and a hand-written pin is not exempt from it.

- [#75](https://github.com/misaon/slop-gate/pull/75) [`dee21ef`](https://github.com/misaon/slop-gate/commit/dee21ef976fbf4d1f616a936caf162a6da22a34e) Thanks [@misaon](https://github.com/misaon)! - Development on pnpm 11.20.0, downloaded from the `packageManager` field rather than taken from PATH.
  Nothing about the published packages changes; `engines.node` is unaffected.
- Updated dependencies [[`e5e8b65`](https://github.com/misaon/slop-gate/commit/e5e8b654af2e4dbbbac4fc0fccea636b514af335)]:
  - @misaon/slop-gate-core@0.2.0
  - @misaon/slop-gate-reporters@0.2.0
  - @misaon/slop-gate-engine-oxlint@0.2.0
  - @misaon/slop-gate-engine-knip@0.2.0
  - @misaon/slop-gate-engine-astgrep@0.2.0
  - @misaon/slop-gate-engine-biome-css@0.2.0
  - @misaon/slop-gate-engine-actionlint@0.2.0
  - @misaon/slop-gate-engine-deps-security@0.2.0
  - @misaon/slop-gate-engine-hadolint@0.2.0
  - @misaon/slop-gate-engine-oxfmt@0.2.0
  - @misaon/slop-gate-engine-schema@0.2.0
  - @misaon/slop-gate-engine-tsc@0.2.0

## 0.1.1

### Patch Changes

- [#63](https://github.com/misaon/slop-gate/pull/63) [`5efcce2`](https://github.com/misaon/slop-gate/commit/5efcce2687e1aeb8f71eea73799f49031bdae513) Thanks [@misaon](https://github.com/misaon)! - Fix `sgate init` writing a config that `sgate check` could not load.

  `init` generates a config importing `defineConfig` from `@misaon/slop-gate`. Reached through
  `npx`, the CLI runs from npx's cache and the package is not a dependency of the project, so the
  very next `check` failed while loading that config — and said so with advice meant for tsconfig
  path aliases, without naming the import that failed.

  `init` now tells you to install the package, and the loader names the missing specifier and
  gives the command that fixes it. A relative import that cannot be resolved still gets the path
  advice, which is what it is for.

- Updated dependencies []:
  - @misaon/slop-gate-core@0.1.1
  - @misaon/slop-gate-engine-actionlint@0.1.1
  - @misaon/slop-gate-engine-astgrep@0.1.1
  - @misaon/slop-gate-engine-biome-css@0.1.1
  - @misaon/slop-gate-engine-deps-security@0.1.1
  - @misaon/slop-gate-engine-hadolint@0.1.1
  - @misaon/slop-gate-engine-knip@0.1.1
  - @misaon/slop-gate-engine-oxfmt@0.1.1
  - @misaon/slop-gate-engine-oxlint@0.1.1
  - @misaon/slop-gate-engine-schema@0.1.1
  - @misaon/slop-gate-engine-tsc@0.1.1
  - @misaon/slop-gate-reporters@0.1.1

## 0.1.0

### Minor Changes

- [#51](https://github.com/misaon/slop-gate/pull/51) [`e9d1dd7`](https://github.com/misaon/slop-gate/commit/e9d1dd766e55d7e6f039379c41bf6d0366f42db0) Thanks [@misaon](https://github.com/misaon)! - First public release.

  slop-gate runs ten analysers behind one config file, one diagnostic model and one exit code:
  oxlint, tsc, knip, ast-grep, biome (CSS), oxfmt, actionlint, hadolint, JSON/YAML schema
  validation and a dependency-advisory check.

  What it does that a runner of linters does not: every rule declares the _concept_ it detects,
  exactly one rule owns a concept per language, and `sgate rules why` shows the arbitration.
  Framework profiles read your `tsconfig.json` and workspace manifests and turn rules off with
  a stated reason scoped to the directories the evidence covers — and stand down instead of
  guessing when the evidence is ambiguous.

  Reporters for humans (`pretty`), machines (`json`, `agent`, `sarif`), and pull requests
  (`github`, `gitlab`), plus an MCP server. Results cache per (engine, file); a warm run on
  this repository is around 120 ms.

### Patch Changes

- Updated dependencies []:
  - @misaon/slop-gate-core@0.1.0
  - @misaon/slop-gate-engine-actionlint@0.1.0
  - @misaon/slop-gate-engine-astgrep@0.1.0
  - @misaon/slop-gate-engine-biome-css@0.1.0
  - @misaon/slop-gate-engine-deps-security@0.1.0
  - @misaon/slop-gate-engine-hadolint@0.1.0
  - @misaon/slop-gate-engine-knip@0.1.0
  - @misaon/slop-gate-engine-oxfmt@0.1.0
  - @misaon/slop-gate-engine-oxlint@0.1.0
  - @misaon/slop-gate-engine-schema@0.1.0
  - @misaon/slop-gate-engine-tsc@0.1.0
  - @misaon/slop-gate-reporters@0.1.0
