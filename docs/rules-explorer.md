# rules-explorer

Internal. Not published — `private: true`, and there is nothing here a consumer of slop-gate needs.

A visual index of every rule the registry knows about: which engine owns it, which concept it maps
to, whether a preset turns it on, at what level, and — for the ones deliberately kept out — the
reason recorded in the registry, verbatim.

```bash
pnpm --filter @misaon/slop-gate-rules-explorer build   # build the client
pnpm --filter @misaon/slop-gate-rules-explorer serve   # http://0.0.0.0:4173
pnpm --filter @misaon/slop-gate-rules-explorer dev     # vite, with the API proxied
```

`PORT` and `HOST` override the defaults.

## What it answers

`sgate rules list` walks the concepts a *run* enabled, so it cannot show you a rule that is off.
This shows all 923, which is what you want when an engine upgrade lands: sort by **Added** and the
new rules are at the top, with the commit that introduced them.

## Design

Dark only, on the palette in [brand.md](brand.md) — amber for anything interactive, a warm neutral
scale under it, and three semantic colours that only ever appear as rule state. The header carries
`logo-wide-darkmode-360.webp`, which is the README's logo at web size: 13 kB against the PNG's 169 kB
for the same pixels.

## Columns

**Impact** and **Reliability** are the two axes in
[impact-and-reliability.md](impact-and-reliability.md) — what a finding costs, and how often the rule
is right. Reliability is an em dash for the 920 rules nobody has measured, which is the honest value.

**Options** separates "the rule takes no options" from "it takes options and we use the default" from
"we tune it" — the last one opens the recorded reason and its measurement.

## Icons and motion

[lucide-preact](https://lucide.dev), named once in `src/components/icons.tsx` so the page's whole
icon vocabulary is readable in one place and Lucide tree-shakes to only what is used — 17 icons for
6.5 kB.

Motion is **interaction-driven only**. 923 rows are on screen at once, so nothing animates on mount
except the four summary tiles; an entrance animation per row would start 923 of them at a time.
Everything is `transform` or `opacity` so it stays off the main thread, and everything sits inside
`motion-safe`, so `prefers-reduced-motion: reduce` removes it rather than merely shortening it.

## Where the data comes from

- **The catalogue** is `buildRuleCatalogue()` in core — static registry data, no run required.
- **`Added`** is derived from git. `RuleEntry.since` is the version the registry was generated at
  and is the same string on all 923 rules, so it cannot answer "what did this upgrade add". The
  registry files are generated, so the first commit containing a rule is the commit that introduced
  it; `scripts/history.ts` walks them. It also reports rules that were present once and are gone,
  which is the other half of an upgrade diff.

## Not built yet

Toggling a rule from the table. It would have to write a config file, and which config — the
repository's, or a scratch one to preview against — is a decision worth making deliberately rather
than discovering after the first write.
