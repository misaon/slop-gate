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

Two sets, and the split is deliberate.

**[lucide-animated](https://lucide-animated.com) (pqoqubbw/icons, MIT)** in `components/animated/` —
a real animated icon pack, where each glyph carries its own keyframes: the shield draws its tick, the
ban draws its circle and slash, the gauge needle sweeps, the search lens hops, the external-link
arrow lifts. Adapted from upstream in two ways: the wrapper `div`, mouse handlers and
`useAnimation()` controller are dropped, and a parent `HoverGroup` drives the variants instead. That
is one hook fewer per icon, and hovering the whole tile animates the glyph rather than needing the
pointer on a 16 px target.

**[lucide-preact](https://lucide.dev)** static, in `components/icons.tsx`, everywhere else.

### Why not animated everywhere

Every animated icon is a motion component with its own animation state. The table renders **923
rows**; at three icons a row that is ~2,800 animation controllers for glyphs nobody hovers. So the
animated set is used only where there is a single instance and the motion is noticed — the four
tiles, the search field, the docs link — and table cells keep the static set.

Motion costs **+42 kB gzipped, fixed**, whether one icon uses it or fifty: 27 kB → 69 kB for the
page. That is fine for an internal dashboard served over the LAN and would not be for the CLI, which
is where this repository's bundle discipline actually applies.

Motion also needs `react` aliased to `preact/compat`, in `vite.config.ts` and in `tsconfig.json`
both. That is the cost `@tanstack/table-core` was chosen to avoid; here there is no framework-agnostic
core to choose instead.

### The rest of the motion

Interaction-driven only. Nothing animates on mount except the four tiles — a per-row entrance would
start 923 animations at once. The chevron rotates 90° because that rotation *is* the expand state,
the sort arrow slides in, the detail row unfurls. All `transform` or `opacity`, and all inside
`motion-safe`, so `prefers-reduced-motion: reduce` removes it rather than shortening it.

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
