<!--
Thanks for contributing. Delete any section that does not apply — an empty heading helps
nobody. The only section we will always read is "Evidence".
-->

## What this changes

<!-- One or two sentences. The diff says what; say why. -->

## Evidence

<!--
If this changes what gets reported, put the numbers here — a count against a named
repository, ideally before and after:

    typeorm/typeorm   1 700 -> 1   (errors 1 806 -> 107)
    hono              unchanged, declares no chai

If you classified a finding class, say that you read a sample of the source rather than
going by the count. If you could not measure it, say so and give the mechanism instead —
that is a fine answer, an unverifiable number is not.
-->

## Cost

<!--
What does this give up? A rule turned off loses coverage somewhere; say where, and how much.
"8 of the 3 041 findings this silences were genuine" is the kind of sentence that gets a PR
merged quickly.
-->

## Checklist

- [ ] `pnpm check` passes locally
- [ ] Tests were written before the implementation, and I watched them fail first
- [ ] Commits follow Conventional Commits (this repo merges by rebase — every commit lands)
- [ ] `pnpm changeset` added, if users would notice this change
