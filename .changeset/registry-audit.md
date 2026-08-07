---
'@misaon/slop-gate': minor
---

**Every rule in the registry has been read against its documentation, and `recommended` goes from 349
rules to 633.** Expect substantially more findings on the first run after upgrading. That is the
intended direction: a rule was promoted when it holds a defect, and refused when it holds a
preference.

The shape of the change, by oxlint category:

| | read | promoted | refused with a reason |
|---|---:|---:|---:|
| `pedantic` | 104 | 57 | 30 |
| `style` | 270 | 86 | 141 |
| `restriction` | 95 | 38 | 37 |
| type-aware | 59 | 27 | 28 |
| `perf` + `nursery` | 27 | 12 | 5 |
| non-oxlint engines | 6 | 3 | 3 |

**Withheld rules went from 20 to 215.** A rule that is off now says why it is off, with the count and
the composition behind it, and `docs/measurements.md` holds the working. What is left `unlisted` is
75 rules whose argument is made at the category level rather than one line
at a time.

**Type-aware linting is available and off by default.** Install `oxlint-tsgolint` and 27 further
concepts start running — `no-floating-promises`, `await-thenable`, `no-misused-promises`,
`switch-exhaustiveness-check` among them. It is not bundled: 21 MB of platform binary, and a run on
this repository goes from 3.1 s to 5.9 s. Without it those concepts report as a coverage gap and
`sgate rules why` names the remedy.

**Impact moved too.** `suspicious` was reported as "untidy" — a census of all 54 of its concepts found
35 with a stated failure path — so the group default is now 2. Catalogue-wide that is 621/294/8 to
569/344/10 across impact 1/2/3.

**Every one of the 633 rules `recommended` enables now carries a written description** of what breaks,
rather than the generator's placeholder. 259 of them were placeholders before.

**Every exclusion was measured against fifty repositories.** `packages/rule-corpus` clones twenty-five
that render and twenty-five that serve, pinned by commit, and runs `sgate check` over each with every
concept enabled — 66,741 files and 2,352,953 findings. That measurement took forty concepts back out of
`recommended` that a single repository had made look quiet, `react/react-in-jsx-scope` among them at
56,079 findings, and it is re-runnable.

**What to expect on a first run.** The same fifty repositories under `recommended` report a median of
**2,354 findings per thousand files** — between two and three per file — once the corpus's own missing
`node_modules` is discounted. A repository that already lints hard reads under 700 per thousand; one
that does not reads ten times that.

To keep something closer to the previous behaviour, set the concepts you do not want to `off` in
`slop-gate.config.ts`; `sgate rules list` and the rules explorer show what each one is and why it is
on.
