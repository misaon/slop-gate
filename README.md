# slop-gate

One quality gate over many analysis engines, for repositories written with AI assistance.

```bash
npm install -D @misaon/slop-gate
npx sgate init     # detects the repo, writes one tailored config
npx sgate check    # analyses the whole monorepo
npx sgate fix      # applies what can be applied safely
```

> **Status: pre-release, not yet published to npm.** The commands above are what installation will
> look like; today the only way to run it is from a clone. [What is missing](#what-is-not-built-yet)
> is listed honestly at the bottom — including two things that matter a lot.

## Why it exists

A person describes what they want and a model writes the code. Sometimes that person is a developer
who could have written it themselves and sometimes they could not, and the difference does not matter:
neither of them read every line. A model produces *plausible* code. It compiles, it reads well, and it
launders a type assertion through `unknown` to get past an error, leaves a function returning a
hard-coded value, calls an API it half-remembers.

A human reviewer catches that by being suspicious. Nobody has the attention budget to be suspicious
about a thousand lines they did not write.

Increasingly no person is there at all: an agent reads the ticket, writes the spec, implements it,
opens the pull request. slop-gate is meant to be the step between *implements it* and *opens the pull
request* — which is why its output is built to be read by a machine at the same level of detail as by
a person, and why a finding reaching the pull request is a requirement rather than a nice integration.

Three things follow, and they explain the choices that would otherwise look severe:

- **Strict is the default.** A gate that passes the median AI-written commit has not gated anything.
  `recommended` *is* the strict preset — there is no strict mode to remember to turn on.
- **A missing check is worse than a noisy one.** An engine that could not run is reported out loud,
  never silently skipped. Exiting 0 over a check that did not happen is the one failure nobody notices.
- **A false positive is a bug, not a tolerable cost.** Someone who cannot fully read the code cannot
  tell a wrong finding from a right one, so noise does not merely annoy — it destroys the only thing
  the tool has, which is output you can trust without verifying it.

## What it runs

Nine engines behind one interface, one config file and one diagnostic model:

| Engine | Covers |
|---|---|
| **oxlint** | JS, TS, JSX, TSX, Vue, Svelte, Astro — the bulk of the ruleset |
| **tsc** | type errors, using *your* TypeScript, across every project a monorepo declares |
| **knip** | dead code: unused exports, types, dependencies and files |
| **ast-grep** | the `slop.*` ruleset — patterns specific to machine-written code |
| **biome-css** | CSS and SCSS |
| **oxfmt** | formatting — TS, JS, JSON, YAML, CSS, Markdown. Opt-in, see below |
| **actionlint** | GitHub Actions workflows |
| **hadolint** | Dockerfiles |
| **schema** | YAML and JSON against their schemas, incl. docker-compose |
| **deps-security** | dependency advisories, from an offline snapshot |

Frameworks are detected separately from languages, because a framework has rules a language does not:
**Next.js**, **NestJS**, **Angular**, **MikroORM**, **VitePress**, React's JSX transform, and the test
framework in use. Detection carries evidence, not a boolean, and a profile can only *raise* strictness
— never lower what your config asked for.

## The part that is actually hard

Aggregating linters is not novel; trunk, qlty and MegaLinter all do it. The problem none of them
solves is that **nobody governs the rules.** Enable enough engines and you get duplicate findings,
contradictory fixes, rules that silently shadow one another, and overrides that stopped applying to
anything years ago.

slop-gate's answer is a **rule registry** where every rule declares the *concept* it detects, and
exactly one rule owns a concept per language — decided deterministically, with the reasoning
inspectable:

```bash
sgate rules why correctness.no-debugger   # who owns this, why, and what lost
sgate rules conflicts                     # every concept more than one engine could serve
sgate rules list                          # the effective ruleset for this repository
```

Two consequences worth knowing:

- **A rule added or removed upstream cannot pass unnoticed.** The registry is generated from each
  engine's own catalogue and `generate:registry:check` runs in CI, so an oxlint release that adds or
  drops a rule fails the build instead of silently changing behaviour.
- **A rule's options are exhausted before it is disabled.** Turning a rule off loses its true
  positives too. `eqeqeq` with `smart` dropped 2,637 findings to 84 — a 96.8% cut where every removed
  one was provably equivalent. `expect-expect` taught to recognise supertest and chai chains dropped
  3,206 to 584 across ten repositories, and still reports a genuinely empty test.

Every rule in `recommended` is there because of a count against a named corpus, recorded next to the
rule. Not because it sounded sensible.

## In CI

Findings land in the pull request, not in a log somebody has to scroll.

```yaml
# .github/workflows/quality.yml
name: quality
on: pull_request
jobs:
  slop-gate:
    runs-on: ubuntu-latest
    permissions: { contents: read, security-events: write }
    steps:
      - uses: actions/checkout@v5
      - run: npm ci
      # Annotates the diff directly. Needs no token, so it works on fork PRs.
      - run: npx sgate check --format=github
      # Richer: rule descriptions, docs links, and findings tracked across pushes.
      - run: npx sgate check --format=sarif > slop-gate.sarif
        if: always()
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: slop-gate.sarif }
```

Both, not either: SARIF is richer, but uploading it needs `security-events: write`, which a **fork
pull request does not get** — and a contributor's first PR is exactly the run whose findings matter
most. GitLab is one job:

```yaml
slop-gate:
  script: npx sgate check --format=gitlab > gl-code-quality-report.json
  artifacts: { reports: { codequality: gl-code-quality-report.json } }
```

A `warn` never arrives as a platform `error` — our warnings do not fail a run, and turning them red on
a platform would make the distinction meaningless. Both platforms silently truncate long lists
(GitHub shows 10 annotations per level per step), so each reporter says what it exceeded rather than
letting a truncated report look like a clean one.

## For AI agents

```bash
sgate check --format=agent   # a report written for a model, with a token budget
sgate mcp                    # the same over the Model Context Protocol
```

The `agent` format is byte-identical between a cold and a warm run — no timings, no cache counts,
nothing run-dependent — so an agent diffing two runs sees only what changed in the code. When it has
to truncate, it says what it dropped rather than trailing off. The MCP tools are read-only, and
`propose_fixes` cannot write: it returns a diff.

## Configuration

One file, fully typed, with autocompletion over every concept id:

```ts
// slop-gate.config.ts
import { defineConfig } from '@misaon/slop-gate'

export default defineConfig({
  // `recommended` is the strict one. `essential` is the level below it: only the rules whose findings
  // would fail a build — 218 of 352, derived from each rule's own severity so the two cannot drift.
  extends: ['recommended'],
  rules: {
    'slop.as-any-cast': 'off',                       // a library of type machinery may need it
    'pedantic.eqeqeq': ['warn', 'smart'],            // options, not off
  },
  overrides: [{ files: ['**/*.test.ts'], rules: { 'dead-code.unused-export': 'off' } }],
})
```

A typo'd key is a type error, and an unknown top-level key is refused with the key it probably meant.
`sgate baseline create` accepts everything a repository already has, so only *new* findings fail the
build — which is how to adopt this on an existing codebase without fixing 2,000 things first.

## Performance

Measured with hyperfine, on this repository (374 files) and on synthetic corpora:

| | |
|---|---|
| warm run, no changes | **124 ms** |
| cold run | 6.0 s |
| 2,003 files with 8,000 findings | 350 ms |
| peak RSS at 8,003 files | 343 MB |

Results are cached per (engine, file) and the cache lives in `.slop-gate/`. `--no-cache` writes
nothing at all, so the tool can be pointed at a read-only checkout.

## What is not built yet

Stated plainly, because a README that implies otherwise is the same kind of lie this tool exists to
catch:

| Gap | What it means for you |
|---|---|
| **The formatter is opt-in, not default** | oxfmt 0.62.0 has no style options, so on by default it would rewrite every project's quotes and semicolons with no way to configure it. Turn it on with `'formatting.unformatted': 'warn'` |
| **No Nuxt or Tailwind profile** | two named frameworks are undetected |
| **Not published** | install from a clone |

Ranking thousands of findings by severity rather than only summarising them, and a reviewable way to
record that a finding is wrong, are designed but unbuilt. See
[the design specification](docs/superpowers/specs/2026-07-30-slop-gate-design.md) — §1.4 lists the
gaps, §12.5 the pull-request integration, §5.7 the false-positive question and the privacy line it
must not cross.

## Requirements

Node ≥ 24. Engines are bundled; `actionlint` and `hadolint` are resolved from `PATH` or installed on
request with `sgate engines install`, and a missing one is a reported coverage gap rather than a
silent skip.

## Licence

MIT
