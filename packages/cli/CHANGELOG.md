# @misaon/slop-gate

## 0.2.0

### Minor Changes

- [#65](https://github.com/misaon/slop-gate/pull/65) [`f00b75a`](https://github.com/misaon/slop-gate/commit/f00b75a2233828c2cccb3c801a0f15dd77b71129) Thanks [@misaon](https://github.com/misaon)! - **The CLI is now published as `sgate`, not `@misaon/slop-gate`.**

  The package name and the command are the same word, which is what `npx` resolves on — so
  `npx sgate init` works with nothing installed. Under the old name it did not, because `npx`
  looks for a _package_ called `sgate` and there was none.

  ```bash
  npm install -D sgate
  npx sgate check
  ```

  The twelve engine packages keep their `@misaon/slop-gate-*` names. They are dependencies
  nobody types.

  If you installed `@misaon/slop-gate`, swap it for `sgate` — the API, the config and the
  `sgate`/`slop-gate` binaries are unchanged. The old package is deprecated and points here.

### Patch Changes

- Updated dependencies []:
  - @misaon/slop-gate-core@0.2.0
  - @misaon/slop-gate-engine-actionlint@0.2.0
  - @misaon/slop-gate-engine-astgrep@0.2.0
  - @misaon/slop-gate-engine-biome-css@0.2.0
  - @misaon/slop-gate-engine-deps-security@0.2.0
  - @misaon/slop-gate-engine-hadolint@0.2.0
  - @misaon/slop-gate-engine-knip@0.2.0
  - @misaon/slop-gate-engine-oxfmt@0.2.0
  - @misaon/slop-gate-engine-oxlint@0.2.0
  - @misaon/slop-gate-engine-schema@0.2.0
  - @misaon/slop-gate-engine-tsc@0.2.0
  - @misaon/slop-gate-reporters@0.2.0

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
