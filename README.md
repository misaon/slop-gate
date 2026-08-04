<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-wide-darkmode.png">
  <img src="docs/assets/logo-wide-lightmode.png" alt="slop-gate" width="460">
</picture>

### Ten analysers. One config. One verdict you can actually trust.

A quality gate for the era where most code is written fast and read slowly.

[![npm](https://img.shields.io/npm/v/@misaon/slop-gate?style=for-the-badge&labelColor=0b0b0f&color=6366f1)](https://www.npmjs.com/package/@misaon/slop-gate)
[![downloads](https://img.shields.io/npm/dm/@misaon/slop-gate?style=for-the-badge&labelColor=0b0b0f&color=8b5cf6)](https://www.npmjs.com/package/@misaon/slop-gate)
[![CI](https://img.shields.io/github/actions/workflow/status/misaon/slop-gate/ci.yml?branch=main&style=for-the-badge&labelColor=0b0b0f&color=22c55e&label=ci)](https://github.com/misaon/slop-gate/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/@misaon/slop-gate?style=for-the-badge&labelColor=0b0b0f&color=14b8a6)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@misaon/slop-gate?style=for-the-badge&labelColor=0b0b0f&color=64748b)](LICENSE)

```bash
npx sgate init && npx sgate check
```

</div>

---

## The problem nobody wants to say out loud

Your codebase is growing faster than anyone is reading it.

The code is *plausible*. It compiles. It reads well. And somewhere in it a type assertion has been
laundered through `unknown` to get past an error, a function returns a hard-coded value behind a
real-looking signature, and an API that was half-remembered got called with arguments that almost
match.

A reviewer catches that by being suspicious. Nobody has the attention budget to be suspicious about
a thousand lines they did not write.

So you reach for linters. And then you meet the *second* problem: turn on enough of them and you get
duplicate findings, contradictory fixes, rules that silently shadow each other, and 15,000 warnings
about React in a codebase that does not use React. The noise costs you the one thing the tools were
supposed to give you — **output you can trust without checking it yourself.**

slop-gate is the answer to both.

## See it

```
  ╭──────────────────────────────────────────────────────────────────────────────╮
  │  ◆  slop-gate                                                         v0.1.0 │
  ╰──────────────────────────────────────────────────────────────────────────────╯

  ▌ app/singleton.server.ts                                                    1

    🟡  9:13    Type assertion laundered through `unknown`/`any`. The compiler
                rejected the direct cast; this asserts it anyway.
                slop.double-cast
                help: Narrow the source type, or add a runtime type guard. If the
                assertion is genuinely load-bearing, keep it behind an inline
                `sgate-disable` comment saying why it holds.

        9 │    const g = global as unknown as { __singletons: Record<string, unknown> };
          │              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ╭──────────────────────────────────────────────────────────────────────────────╮
  │  12 warnings                                                                 │
  │  69 scanned · 48 analysed (all cached) · 135 ms                              │
  │  Most frequent                                                               │
  │      3 ×  correctness.no-img-element                                         │
  │      2 ×  correctness.shadows-outer-binding                                  │
  ╰──────────────────────────────────────────────────────────────────────────────╯
```

That is a real run. 135 milliseconds, warm.

## What makes it different

Aggregating linters is not new — trunk, qlty and MegaLinter all do it. What none of them solve is
that **nobody governs the rules.**

### Every rule has an owner, and you can ask why

Ten engines will happily report the same problem four times under four names. In slop-gate every
rule declares the *concept* it detects, and exactly one rule owns a concept per language — decided
deterministically, and inspectable:

```console
$ sgate rules why suspicious.react-in-jsx-scope

  Enabled: yes — enabled at `warn` by preset `recommended`
      preset                recommended -> warn
      path-scoped framework react-jsx-transform (runtime-tests/bun/**, src/**) -> off

  Framework: react-jsx-transform turns this off under `runtime-tests/bun/**`, `src/**`
      detected via `compilerOptions.jsx` is `react-jsx` in tsconfig.spec.json
      React 17's automatic JSX transform compiles JSX to `react/jsx-runtime` calls,
      and a `jsxImportSource` naming another runtime compiles it to that one, so
      importing React is unnecessary and its absence is correct. Scoped to the
      projects whose own config says so, because another project here is on the
      classic transform.
```

No other tool in this category can answer that question at all.

### It knows what framework you are using

Not "it has a Next.js preset". It reads your `tsconfig.json`, follows the `extends` chain, resolves
`jsxImportSource`, finds every workspace manifest — and then **turns rules off with a stated reason,
scoped to the directories the evidence covers.**

Detected today: **Next.js**, **NestJS**, **Angular**, **MikroORM**, **VitePress**, **chai**, React's
JSX transform, and which test framework you actually use. Detection carries evidence, never a
boolean. When the evidence is ambiguous, a profile **stands down and tells you why** rather than
guessing.

### We proved it on other people's code

We ran slop-gate across **20 real repositories** — 10 frontend app frameworks, 10 backend — and then
went hunting for *our own* false positives. Reading source, not counting lines.

| | before | after |
|---|---:|---:|
| Total findings | 78,219 | **49,783** |
| Error-severity findings | 12,350 | **5,257** |
| Repositories where an engine crashed | 3 | **0** |

Some of what that removed:

- **21,551 → 2,880** `react-in-jsx-scope`. Hono, Solid and Medusa were being told to import React.
  15,442 of them were on one repository, and **not one** was in the directory that had caused the
  rule to stay on.
- **3,363 → 322** `no-unused-expressions`. chai asserts by property access — `expect(x).to.exist` is
  a complete assertion — so the rule was calling an entire assertion library dead code. On typeorm:
  1,700 of 1,700 findings, no residue.
- **3,308 → 2** unresolved imports on an Astro site. The repository's only problem was that nobody
  had run `pnpm install`. That is now a stated coverage gap instead of 3,308 red errors.

Every one of those numbers is in a commit message with the method next to it. That is the standard
here: **a count against a named repository, or it does not ship.**

### A missing check is louder than a passing one

```
   COVERAGE GAP  deps-security could not run here — no advisory snapshot found;
                 dependency vulnerabilities were not checked
    3 concepts went unchecked. Resolve it with `sgate engines install advisories`.
```

Exiting 0 over a check that never happened is the one failure nobody notices. slop-gate refuses to
do it.

## Install

```bash
npm install -D @misaon/slop-gate
npx sgate init      # reads the repo, writes one tailored config
npx sgate check     # analyses everything
npx sgate fix       # applies only what is safe
```

Node 24+. Engines are bundled — no Docker, no Java, no `pip install`.

## What runs

| Engine | Covers |
|---|---|
| **oxlint** | JS · TS · JSX · TSX · Vue · Svelte · Astro — the bulk of the ruleset |
| **tsc** | type errors, using *your* TypeScript, across every project a monorepo declares |
| **knip** | dead code: unused exports, types, dependencies, files |
| **ast-grep** | the `slop.*` ruleset — patterns specific to machine-written code |
| **biome** | CSS and SCSS |
| **oxfmt** | formatting — TS, JS, JSON, YAML, CSS, Markdown *(opt-in)* |
| **actionlint** | GitHub Actions workflows |
| **hadolint** | Dockerfiles |
| **schema** | YAML and JSON against their published schemas |
| **deps-security** | dependency advisories, from an offline snapshot |

## In your pipeline

Findings land **in the pull request**, not in a log somebody has to scroll.

```yaml
name: quality
on: pull_request
jobs:
  slop-gate:
    runs-on: ubuntu-latest
    permissions: { contents: read, security-events: write }
    steps:
      - uses: actions/checkout@v5
      - run: npm ci
      # Annotates the diff. Needs no token, so it works on fork PRs.
      - run: npx sgate check --format=github
      # Richer: rule descriptions, docs links, findings tracked across pushes.
      - run: npx sgate check --format=sarif > slop-gate.sarif
        if: always()
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: slop-gate.sarif }
```

Both, not either — SARIF is richer, but uploading it needs `security-events: write`, which a **fork
pull request does not get**, and a contributor's first PR is exactly the run whose findings matter
most. GitLab is one job:

```yaml
slop-gate:
  script: npx sgate check --format=gitlab > gl-code-quality-report.json
  artifacts: { reports: { codequality: gl-code-quality-report.json } }
```

## Built for agents too

```bash
sgate check --format=agent   # a report written for a model, with a token budget
sgate mcp                    # the same over the Model Context Protocol
```

The `agent` format is **byte-identical between a cold and a warm run** — no timings, no cache
counts, nothing run-dependent — so an agent diffing two runs sees only what changed in the code.
When it truncates, it says what it dropped. The MCP tools are read-only; `propose_fixes` returns a
diff and cannot write.

## Configure it

One file, fully typed, autocompletion over every concept id:

```ts
// slop-gate.config.ts
import { defineConfig } from '@misaon/slop-gate'

export default defineConfig({
  // `recommended` IS the strict one. There is no strict mode to remember to turn on.
  // `essential` is the level below: only rules whose findings would fail a build.
  extends: ['recommended'],
  rules: {
    'slop.as-any-cast': 'off',              // a library of type machinery may need it
    'pedantic.eqeqeq': ['warn', 'smart'],   // options, not off
  },
  overrides: [
    { files: ['**/*.test.ts'], rules: { 'dead-code.unused-export': 'off' } },
  ],
})
```

A typo'd key is a **type error**. An unknown top-level key is refused with the key it probably meant.

Adopting on an existing codebase with 2,000 findings? Don't fix them first:

```bash
sgate baseline create   # accept what exists — only NEW findings fail the build
```

## Speed

Measured with hyperfine, on this repository (374 files) and synthetic corpora.

| | |
|---|---|
| **warm run, no changes** | **124 ms** |
| cold run | 6.0 s |
| 2,003 files / 8,000 findings | 350 ms |
| peak RSS at 8,003 files | 343 MB |

Results cache per (engine, file) in `.slop-gate/`. `--no-cache` writes nothing at all, so you can
point it at a read-only checkout.

## What is *not* built yet

A README that implies otherwise is the same kind of lie this tool exists to catch.

| Gap | What it means for you |
|---|---|
| **Formatter is opt-in** | oxfmt has no style options yet, so on by default it would rewrite every project's quotes with no way to configure it. Enable with `'formatting.unformatted': 'warn'` |
| **No Nuxt or Tailwind profile** | Nuxt's `#shared`/`#app` aliases and Nuxt layers are not yet understood by the dead-code engine |
| **Findings are not ranked** | thousands of findings are summarised, not prioritised |

The [design specification](docs/superpowers/specs/2026-07-30-slop-gate-design.md) records every
architectural decision and the measurement behind it. §1.4 lists the gaps.

## Trusted by

<div align="center">
<br>

<a href="https://www.techfides.cz">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/techfides-darkmode.svg">
    <img src="docs/assets/techfides-lightmode.svg" alt="TechFides" height="34">
  </picture>
</a>

<br>

*Running slop-gate on production codebases.*<br>
Using it at work? [Open a pull request](https://github.com/misaon/slop-gate/pulls) and add yourself.

</div>

## Contributing

Pull requests welcome — and the bar is specific: **bring a number against a named repository.**
[CONTRIBUTING.md](CONTRIBUTING.md) explains why, and what to do when you cannot measure something.

---

<div align="center">

<img src="docs/assets/logo.png" alt="" width="52">

**[MIT](LICENSE)** © Ondřej Misák

</div>
