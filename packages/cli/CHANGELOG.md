# @misaon/slop-gate

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
