# Brand

The palette is not a design choice made in the abstract — it is sampled from the logo, so anything
built against it matches the mark without anyone having to eyeball it.

## The mark

`docs/assets/` holds the sized, theme-split versions. The originals are 3 MB and are gitignored.

| File | Use |
|---|---|
| `logo-wide-darkmode.png` · `logo-wide-lightmode.png` | 960×275. README, anywhere with room for the wordmark |
| `logo.png` | 512×512. The hexagon mark alone |
| `logo-wide-darkmode-360.webp` | 360×103, 13 kB. Web UI headers — the PNG is 169 kB for the same pixels |
| `logo-mark-96.webp` | 96×96, 3 kB. Favicons, compact headers |

## Colour

Sampled from `logo.png` with an 8-colour histogram, then converted to OKLCH. Round-tripping
`oklch(0.770 0.171 65.8)` back to sRGB gives `#FC9A04` against the logo's `#FC9A05`, so the palette
is the mark rather than an approximation of it.

### Brand

| Token | OKLCH | sRGB | What it is |
|---|---|---|---|
| `--color-brand` | `oklch(0.770 0.171 65.8)` | `#FC9A04` | The amber the hexagon starts at. Accent, links, focus, active state |
| `--color-brand-deep` | `oklch(0.682 0.201 42.8)` | `#F96206` | The orange it ends at. Gradients, hover, the `withheld` state |
| `--color-cream` | `oklch(0.991 0.003 84.6)` | `#FDFCFA` | The wordmark's warm off-white |

### Ink

A warm neutral at hue 70, so the greys sit under the amber instead of fighting it. A cool grey
(the violet-tinted scale this started with) makes the brand colour look like an accident.

| Token | OKLCH | sRGB | Contrast on `ink-950` | Use |
|---|---|---|---|---|
| `--color-ink-950` | `oklch(0.155 0.006 70)` | `#0E0C09` | — | Page |
| `--color-ink-900` | `oklch(0.200 0.007 70)` | `#181613` | — | Surface |
| `--color-ink-850` | `oklch(0.240 0.008 70)` | `#221F1B` | — | Raised surface, row divider |
| `--color-ink-800` | `oklch(0.290 0.009 70)` | `#2E2B27` | — | Border |
| `--color-ink-700` | `oklch(0.400 0.010 70)` | `#4B4742` | **2.12:1** | **Borders and rules only — never text** |
| `--color-ink-500` | `oklch(0.620 0.012 70)` | `#8B857F` | 5.36:1 | Secondary text, labels, placeholders |
| `--color-ink-300` | `oklch(0.800 0.010 70)` | `#C2BDB7` | 10.45:1 | Body text |
| `--color-ink-100` | `oklch(0.955 0.005 84.6)` | `#F2F0EC` | 17.15:1 | Primary text, headings |

### State

| Token | OKLCH | sRGB | Contrast | Meaning |
|---|---|---|---|---|
| `--color-state-on` | `oklch(0.760 0.150 155)` | `#52CD86` | 9.68:1 | A preset turns the rule on |
| `--color-state-withheld` | = `--color-brand-deep` | `#F96206` | 6.32:1 | Deliberately kept out, with a recorded reason |
| `--color-severity-error` | `oklch(0.700 0.170 25)` | `#F66D67` | 6.78:1 | `error` level |
| `--color-severity-warn` | = `--color-brand` | `#FC9A04` | 9.09:1 | `warn` level |

Every foreground above clears WCAG AA on `ink-950` and on `ink-900`; `ink-700` does not, which is
why it is a border colour and the table says so.

### Impact bar

The 1–3 bar in [impact-and-reliability.md](impact-and-reliability.md) escalates through the palette
rather than introducing colours of its own.

| Level | Token | Reads as |
|---|---|---|
| 1 · untidy | `--color-ink-500` | present but quiet |
| 2 · will bite | `--color-brand` | the tool's own colour — this is the ordinary case |
| 3 · broken or unsafe | `--color-severity-error` | the only red on the page |

## Rules

**The brand amber doubles as the `warn` severity, on purpose.** In a linter, `warn` is the most
common thing on screen, and this tool's colour is amber — separating them would mean inventing a
second amber nobody could tell apart. The distinction that matters is `error` (red) against
everything else.

**`withheld` is the deep orange, not the amber.** A withheld rule is the one with a story worth
reading, so it gets a brand colour; using the same amber as `warn` would collapse two different
statements into one swatch.

**Do not introduce a second accent hue.** The design is monochrome-accent: amber for anything
interactive, neutral for everything else, and three semantic colours that only appear as state.
