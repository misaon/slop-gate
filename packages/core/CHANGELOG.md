# @misaon/slop-gate-core

## 0.2.0

### Patch Changes

- [#75](https://github.com/misaon/slop-gate/pull/75) [`e5e8b65`](https://github.com/misaon/slop-gate/commit/e5e8b654af2e4dbbbac4fc0fccea636b514af335) Thanks [@misaon](https://github.com/misaon)! - `sgate rules list --engine` now offers only engines a run can use. `EngineId` also names engines the
  design has an arbitration position for but no package implements — `tsgolint`, `zizmor`, `eslint` —
  and the error listed all of them, sending a reader after a run that cannot happen.

  The analysers are pinned exactly, as `@biomejs/biome` and `oxfmt` already were: which version runs
  decides what the tool reports, so a caret bump changed findings without a pull request. The pins hold
  the versions already in use rather than the newest available, because `.github/dependabot.yml`'s
  cooldown exists for exactly this and a hand-written pin is not exempt from it.

## 0.1.1

## 0.1.0
