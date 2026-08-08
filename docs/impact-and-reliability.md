# Impact and reliability

slop-gate reports **issues**, and every issue is something to fix. It does not present a finding as
a "warning" — a category whose only content is that the tool is hedging.

What differs between issues is two things, and they are separate axes because they answer different
questions and have different answers:

- **Impact 1–3** — what it costs if the finding is real. Shown everywhere, as a bar.
- **Reliability** — how often the rule is right, measured. Shown as a percentage, or nothing.

`error` / `warning` / `info` still exist in the plumbing, because SARIF, GitHub annotations and
GitLab code quality all take that enum and the exit code is derived from it. They are not the
vocabulary of the product.

## Impact

`packages/core/src/registry/impact.ts`

Each level has a test a reader can apply without asking anyone.

| | Label | The test |
|---|---|---|
| **▮▮▮ 3** | broken or unsafe | It does not work, or it is a security or data-loss risk, **now**. Does not compile, does not resolve, hands someone your credentials. |
| **▮▮ 2** | will bite | A real defect with a plausible path to failing — wrong behaviour under some input, a test that cannot fail, a dependency with a published advisory. |
| **▮ 1** | untidy | No path to failure. A reader or an agent should still fix it, and nothing breaks if they do not. |

Three levels, not five: more buckets means more arguing and less agreement.

Impact starts from the concept's **group**, which is right for most of the 923 rules. Concepts whose
group is a poor predictor are listed individually with a one-line reason, and an exception without a
reason does not belong in that list. Current distribution: **569 at 1, 344 at 2, 10 at 3**.

`suspicious` was the group the default was most wrong about. It sat at 1 — the claim that nothing
breaks — and a census of all 54 of its concepts found 35 with a stated failure path, 10 genuinely
untidy and 2 that are security. It is 2 now, and the exception table is 12 rows the other way instead
of the 35 it would have needed. See `docs/measurements.md`.

### The gap this exposed, and how it closed

Two concepts used to be impact 3 and reported at `warn`, so a bare `sgate check` exited 0 on a
published advisory and on a credential in a CI workflow. That was recorded rather than fixed, because
aligning what gates a build to impact is a breaking change; it has since had its release, and both are
`error`.

The test that pinned the list now asserts it is **empty**, so a concept cannot arrive at impact 3 and
`warn` unless someone decides to put it there.

The line the registry audit settled on, for the security rules it added: a rule that reports **an API
a caller may be using safely** is impact 2 — `security.target-blank`, `security.dangerous-html`,
`security.script-url`. A rule that reports **a hole whatever the value** is impact 3 and therefore
`error` — `security.eval-usage`, `security.function-constructor`.

228 of the 239 `error` concepts are still the `correctness` group, which is oxlint's category rather
than a decision, so the split remains something to revisit rule by rule rather than a design.

## Reliability

`packages/core/src/registry/reliability.ts`

How often the rule is right, from **reading its findings**, never from counting them.

This table is deliberately sparse — 3 rules of 923. **A rule with no entry is unknown, not 100%.**
Claiming a precision nobody measured is exactly the kind of number this tool exists to distrust, so
the column shows an em dash and the tooltip says why.

Every entry carries its sample size, where the sample came from, and the engine version it was taken
against, because a rule's precision moves when the engine does.

| Rule | Measured | From |
|---|---|---|
| `oxlint/vitest/valid-title` | **6%** of 174 | Every finding across five corpus repositories, read at its byte range |
| `oxlint/import/no-unassigned-import` | **0%** of 5 | Both repositories the generated registry was validated against |
| `actionlint/action` | **10%** of 10 | All findings over a 403-file corpus |

### Why this is not impact

A rule that is wrong most of the time is not "low impact" — it is unreliable, and the answer is to
fix it or withhold it, not to report it more quietly.

`vitest/valid-title` is that mistake, caught after the fact: it was moved from `error` to `warn`
because it is right 6% of the time, which encoded *confidence* on the *severity* axis. Under this
model the 6% is stated where it belongs, and whether the rule belongs in `recommended` at all is a
separate argument with a number attached to it.

### Where the numbers will come from

Three measurements is a start, not a system. The intent is that a developer can report a finding as
a false positive and the figure moves on real data, so an unreliable rule becomes visible in the
table rather than being discovered by whoever next reads 174 findings by hand.

## Prevalence

`packages/core/src/registry/prevalence.ts`, generated from the corpus run rather than written.

How often a rule actually fires: `seenIn` of 20 projects, and the raw finding total. **Prevalence is
the primary number** — one repository contributing 4,000 findings says less about how widely a rule
applies than 17 repositories contributing one each.

162 of 923 rules fired on anything. A rule absent from the table fired on none of the 20, which is
not "never fires": the corpus is JavaScript and TypeScript, so a Dockerfile or workflow rule can be
absent because nothing there exercised it.

    17/20 projects   2,823 findings   oxlint/no-shadow
    17/20            2,699            oxlint/typescript/no-explicit-any
    16/20            1,418            oxlint/unicorn/consistent-function-scoping
    15/20            2,374            oxlint/no-unused-vars
    13/20              526            deps-security/vulnerability

## Options

`hasOptions` on each rule comes from the JSON Schema oxlint ships, so the table can separate two
things that look identical from outside:

- **`tuned`** — slop-gate sets options, and the reason is recorded with the measurement behind it.
  4 concepts today.
- **`default`** — the rule accepts options and slop-gate takes the engine's default. 326 rules.
- **`—`** — the rule takes no options; the default is the only shape there is. 593 rules.
