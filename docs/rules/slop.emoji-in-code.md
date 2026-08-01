# `slop.emoji-in-code`

**Engine:** ast-grep · **Default level:** `warn` · **Preset:** none (opt in by concept) · **Fix:** none

Detects an emoji inside a string or template literal:

```ts
console.log('✅ Migration complete!')
throw new Error(`🚨 ${count} records failed`)
```

## Why this is a problem

An emoji in program output is a character with no fallback. It reaches places its author never
sees: log aggregators that store bytes and render none of them, CI transcripts, `grep` over a
production log, code review diffs, a terminal with no colour-emoji font, a Windows console. In each
of those it becomes a replacement glyph, a pair of mojibake characters, or a width miscalculation
that corrupts a whole table.

Decorative status markers are also a tell. `'✅ Done!'` is written to make output *look* finished,
which is a different goal from making it *be* finished.

## Identifiers are not checked, deliberately

Spec §14 says "identifiers or strings". JavaScript identifiers cannot contain emoji — they are
excluded from `ID_Start` and `ID_Continue`, so `const 🚀 = 1` is a syntax error. The only place an
emoji can appear in JS or TS source is a string, a template literal, JSX text or a comment. Comments
are documentation, which §14 excludes by name.

## The `\p{Emoji}` trap

The obvious regex is wrong, and wrong in a way that is easy to ship. The Unicode `Emoji` property is
true for `#`, `*` and every ASCII digit, so `\p{Emoji}` flags `'#1 and *2 and 3'`, `'25°C'` and
`'€100'` — all three reproduced. This rule uses `\p{Emoji_Presentation}`, plus
`\p{Extended_Pictographic}` followed by U+FE0F to catch the text-default pictographs that only
render as emoji when qualified (`⚠️` is `U+26A0 U+FE0F`; U+26A0 alone is `Emoji_Presentation=No`).

`™`, `✓`, `→`, `°`, `€`, `≤` and box-drawing characters are correctly left alone.

## Measured accuracy

| Corpus | Findings | Verdict |
|---|---|---|
| slop-gate, 163 JS/TS files | 20 | **20/20 false positives** |
| 3,366 third-party files (~45 MB) | 127 | Dominated by `tsdown`'s CLI status lines; all deliberate |

On slop-gate itself: twelve in `packages/reporters/src/display-width.test.ts` and four in
`position.test.ts`, both of which exist *to* test wide and multi-byte characters, plus the three
severity glyphs in `packages/reporters/src/severity.ts` — which are the product's own output.

**That is why this concept is in no preset, including `slop`.** No syntactic property separates a
deliberate CLI glyph from `console.log('✅ Done!')`. It is aimed at codebases where an emoji has no
business appearing at all, and it is useless-to-harmful in a CLI — which slop-gate happens to be.

Enable it deliberately:

```ts
rules: { 'slop.emoji-in-code': 'warn' }
```

## Escapes

```ts
// sgate-disable-next-line slop.emoji-in-code -- severity marker, part of the pretty reporter's output
const SEVERITY_MARK = { error: '🔴', warn: '🟡', info: '🔵' }
```

Or scope it away from the layer that legitimately renders glyphs:

```ts
overrides: [{ files: ['src/ui/**', 'src/reporters/**'], rules: { 'slop.emoji-in-code': 'off' } }]
```
