# `slop.narrative-comment`

**Engine:** ast-grep · **Default level:** `warn` · **Preset:** `slop` · **Fix:** none

Detects a comment that describes a *hypothetical other version of the code* instead of explaining
the code that is there:

```ts
// In a real implementation, this would call the payments API.
export const charge = () => 0

// This is a placeholder until the real service lands.
export const lookup = () => null

// Error handling omitted for brevity.
export const parse = (input: string) => JSON.parse(input)
```

## Why this is a problem

These comments mark work that was *described* rather than done. That alone would make them useful
signposts — the trouble is that they outlive the gap. The stub gets filled in, the comment stays,
and a future reader now has an authoritative-sounding note telling them the code beside it is not
real. Every one of them is a small, permanent lie about the state of the codebase.

They are also the single most reliable textual fingerprint of code that was generated rather than
written, because they are addressed to a reader being shown an example, and no such reader exists
once the code is committed.

## What it does not detect, and why that list matters more than the one above

**A comment explaining *why* a decision was made is the opposite of this and is deliberately not
detected.** slop-gate's own source is dense with them by policy (spec §20), and it is the primary
corpus this rule was measured against.

Six candidate patterns were written, measured, and removed. Counts are from 3,366 third-party files:

| Pattern | Findings | Why it was dropped |
|---|---|---|
| `note that we`, `as you can see`, `we'll`, `here we`, `notice that` | **76** | Every one a legitimate explanation. Spec §14 names "Note that we…" as an example to detect; it is not implemented, and this is why |
| `for now` | 25 | "This file provides a workaround for now" |
| `this is a (simplified\|example\|mock\|dummy)` | 2 | "This is a simplified version…", "This is an example of what *not* to do:" |
| `for testing purposes` | 2 | An ordinary comment above test-only code |
| `in (production\|reality)` | 2 | "…style links and asset preload directives in production" |
| `you can (typically\|…)` | 1 | "you can probably leave this undefined" — which is why `can` is absent from the surviving `you (would\|might\|could)` alternation |

Each of those phrases is preserved verbatim in
`packages/engine-astgrep/fixtures/narrative-comment.negative.ts`, so widening the regex re-flags them
and fails a test.

## Measured accuracy

| Corpus | Findings | Verdict |
|---|---|---|
| slop-gate, 163 JS/TS files | **0** | Near-misses everywhere and none matched: "in a real run", "a placeholder path", "in production that transitively loads…" |
| 3,366 third-party files (~45 MB) | 2 | Both the same comment in two bundles of rollup: `// Placeholder until proper Symbol.Iterator support` — a genuine self-declared placeholder |

**0 measured false positives over 3,529 files.** There is no matching recall claim: no corpus of
known AI-generated code was available, so what is proved on real code is the false-positive rate.
That the rule fires on the patterns it names is proved by fixtures.

## Escapes

```ts
// sgate-disable-next-line slop.narrative-comment -- quoting the RFC's own wording
```

If a whole directory is documentation or teaching material, turn the concept off there:

```ts
overrides: [{ files: ['examples/**'], rules: { 'slop.narrative-comment': 'off' } }]
```
