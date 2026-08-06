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
