---
'@misaon/slop-gate': patch
'@misaon/slop-gate-core': patch
'@misaon/slop-gate-reporters': patch
'@misaon/slop-gate-engine-oxlint': patch
'@misaon/slop-gate-engine-knip': patch
'@misaon/slop-gate-engine-astgrep': patch
'@misaon/slop-gate-engine-biome-css': patch
---

`sgate rules list --engine` now offers only engines a run can use. `EngineId` also names engines the
design has an arbitration position for but no package implements — `tsgolint`, `zizmor`, `eslint` —
and the error listed all of them, sending a reader after a run that cannot happen.

The analysers are pinned exactly, as `@biomejs/biome` and `oxfmt` already were: which version runs
decides what the tool reports, so a caret bump changed findings without a pull request.

Two generated concept ids were renamed by oxlint 1.77 moving `eslint/prefer-promise-reject-errors`
from `style` to `pedantic`, which made both plugin variants collide and take a plugin prefix:
`style.prefer-promise-reject-errors` is now `pedantic.eslint-prefer-promise-reject-errors`, and
`pedantic.prefer-promise-reject-errors` is now `pedantic.typescript-prefer-promise-reject-errors`.
Neither appears in a preset; a config naming one directly needs updating.
