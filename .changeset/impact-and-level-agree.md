---
'@misaon/slop-gate': minor
---

**A published advisory and a hardcoded credential in a workflow now fail a run rather than warning.**
`security.vulnerable-dependency` and `security.workflow-hardcoded-credential` move from `warn` to
`error` in `recommended`.

Both carry impact 3, which this vocabulary defines as *a security or data-loss risk now* — and both
were reported at a level that exits 0. `impact.test.ts` has recorded that contradiction as a
deliberate to-do since the impact axis was introduced; this is it being taken.

Nothing changes for a run that already passes `--max-warnings 0`, which is what this repository's own
gate uses. A run without it that was passing while a dependency had a published advisory will now
fail, which is the point. To keep the previous behaviour, set the two concepts to `warn` in
`slop-gate.config.ts`.

The test that recorded the gap now asserts it is empty, so a future impact-3 concept cannot be added
at `warn` without someone deciding to.
