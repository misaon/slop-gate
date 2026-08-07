---
'@misaon/slop-gate': minor
---

**Every rule in the registry has been read against its documentation, and `recommended` goes from 349
rules to 886.** Expect substantially more findings on the first run after upgrading. That is the
intended direction, and the bar is deliberately narrow: a rule is on unless it is *wrong* (it does not
describe a defect, or its fixer changes what the code means), it *contradicts another rule* that no
option can separate it from, or it *cannot be obeyed* (the finding is real and no fix exists). Volume
is not a reason. `style.no-magic-numbers`, `style.sort-keys` and `style.id-length` are all on.

Coverage per engine, which the earlier passes had not stated: oxlint is complete at 847 of the 847
rules it ships. hadolint had 20 of its 72 read and now has all 72. biome's CSS rules and knip's issue
types were already complete. 20 type-aware rules came back after their exclusions were re-read against
the same bar, `typescript/return-await` among them with the `in-try-catch` option its own note had
described.

**Withheld rules went from 20 to 49.** A rule that is off now says why it is off, with the count and
the composition behind it, and `docs/measurements.md` holds the working. What is left `unlisted` is 25 rules that report
nothing at all until a project supplies a list — `no-restricted-syntax`, `id-match`, `forbid-elements`
and their kin — so naming them in a preset would be decoration.

**Type-aware linting is available and off by default.** Install `oxlint-tsgolint` and 27 further
concepts start running — `no-floating-promises`, `await-thenable`, `no-misused-promises`,
`switch-exhaustiveness-check` among them. It is not bundled: 21 MB of platform binary, and a run on
this repository goes from 3.1 s to 5.9 s. Without it those concepts report as a coverage gap and
`sgate rules why` names the remedy.

**Impact moved too.** `suspicious` was reported as "untidy" — a census of all 54 of its concepts found
35 with a stated failure path — so the group default is now 2. Catalogue-wide that is 621/294/8 to
569/344/10 across impact 1/2/3.

**Every one of the 886 rules `recommended` enables now carries a written description** of what breaks,
rather than the generator's placeholder.

**Every exclusion was measured against fifty repositories.** `packages/rule-corpus` clones twenty-five
that render and twenty-five that serve, pinned by commit, and runs `sgate check` over each with every
concept enabled — 66,741 files and 2,352,953 findings. That measurement took forty concepts back out of
`recommended` that a single repository had made look quiet, `react/react-in-jsx-scope` among them at
56,079 findings, and it is re-runnable.

**What to expect on a first run.** The same fifty repositories, re-measured under the preset as it now
stands, report a median of **27,618 findings per thousand files** — roughly twenty-eight per file. The
quartiles are 17,820 and 57,968; the quietest repository in the set reads 2,452 and the loudest 125,438.
Frontend codebases sit lower than backend ones (medians 18,224 and 36,906), because a larger share of a
frontend repository is markup and configuration that fewer rules reach.

Those are large numbers and they are meant to be. Two or three findings per file was the old bar's
answer to "how much will a developer tolerate?"; this is the answer to "how much is there?". Sorting
the report by impact, or raising the level threshold, is how you decide where to start — the tool's job
is to have looked.

To keep something closer to the previous behaviour, set the concepts you do not want to `off` in
`slop-gate.config.ts`; `sgate rules list` and the rules explorer show what each one is and why it is
on. This repository's own config is the worked example — it declines 100 concepts, grouped by reason,
and stays at zero findings without a baseline.
