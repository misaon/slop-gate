# Contributing

Thanks for being here. This document is short on ceremony and specific about the two things
that actually get a change merged: **a claim you can check, and a green gate.**

## The one rule that matters

**Every change argues for itself with something measurable.**

slop-gate exists to remove noise from other people's builds, so a rule we ship wrongly costs
somebody a red CI on code that was fine. That means a pull request that changes what gets
reported needs a number, not an opinion:

> Measured on `typeorm/typeorm`: 1,700 of 1,700 findings were chai assertions. Zero residue.

not

> This rule seems too noisy.

A count against a named repository is a claim anyone can re-run. "Seems noisy" is not.
Read a sample of the actual source before you classify a finding — two rules with identical
counts routinely have opposite verdicts, and there is no way to tell them apart from the
number alone.

If you cannot measure it, say so plainly in the pull request. An honest "I could not measure
this, here is the mechanism instead" is welcome. A confident number that nobody can reproduce
is not.

## Getting set up

```bash
git clone https://github.com/misaon/slop-gate.git
cd slop-gate
pnpm install
pnpm check
```

`pnpm check` is typecheck, tests and the gate run on itself. It is the same command CI runs,
so if it is green locally it will be green there. Node 24 or newer, pnpm 10.

## Before you open a pull request

- **`pnpm check` passes.** Not "passes except for one thing I will fix later".
- **Tests came first.** Write the failing test, watch it fail for the reason you expect, then
  make it pass. A test written after the code passes immediately, which proves nothing.
- **Commits follow [Conventional Commits](https://www.conventionalcommits.org/).** CI lints
  every commit in the PR, not just the title, because this repository merges by **rebase only** —
  each commit lands on `main` verbatim.
- **The commit message explains _why_.** The diff already says what changed. If the reasoning
  lives only in the PR description, it is gone the moment the PR is archived.

## Working with the codebase

`docs/superpowers/specs/2026-07-30-slop-gate-design.md` is the authoritative design. It records
every architectural decision and the reason behind it. **Read the relevant section before
redesigning a subsystem** — most "why on earth is it like this" questions are answered there,
usually with the measurement that settled it.

`docs/measurements.md` holds the figures behind decisions the source states only as a
conclusion. Read it before re-tuning a constant or removing a bound.

A few conventions that are load-bearing rather than stylistic:

- ESM only, Node >= 24, no CommonJS.
- Byte offsets are the internal truth for positions; line and column are recomputed by `core`.
- Public data structures use repo-relative POSIX paths.
- `packages/core` must not depend on any engine package.
- No comment that restates the code beneath it.

## Adding or changing a rule

This is where most contributions land, so it has its own bar.

A rule reaching the `recommended` preset is a rule that will run on strangers' repositories by
default. To promote one, bring a false-positive count measured against real code — not
fixtures. To demote or disable one, bring the same. `packages/core/src/registry/not-recommended.ts`
records every rule deliberately kept out and why; if you are re-adding one, that file tells you
which condition has to have changed.

Framework-specific behaviour goes in `packages/core/src/frameworks/profiles.ts`. Each profile
states its evidence and what it does when the evidence is ambiguous — the standing convention is
that a profile **stands down** rather than guessing, because the cost of standing down is a
finding the user can already see, while the cost of guessing is a rule silently switched off over
code nobody looked at.

## Changesets

Any change users would notice needs a changeset:

```bash
pnpm changeset
```

Pick the packages, pick the bump, write one or two sentences aimed at someone reading a release
note rather than a diff. Internal refactors, test-only changes and CI edits do not need one.

## Review

Every pull request needs an approving review from a maintainer before it can merge. Expect
questions about the evidence rather than about formatting — the gate already checked the
formatting.

## Reporting bugs

Include the output of `sgate check --format=json`, or the relevant part of it, and say whether
your dependencies were installed. That last one matters more than it sounds: several analysers
answer differently without `node_modules`, and it is the first thing we would ask.

## Security

Do not open an issue for a vulnerability. [SECURITY.md](SECURITY.md) has the private route.
