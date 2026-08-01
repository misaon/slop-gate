# slop-gate — Design Specification

**Date:** 2026-07-30
**Status:** Approved, ready for implementation planning
**Repository:** https://github.com/misaon/slop-gate
**Package:** `@misaon/slop-gate` · **Binary:** `sgate` (alias `slop-gate`)

---

## 1. Purpose

slop-gate is a code-quality gate for repositories written with AI assistance. It aggregates
best-in-class analysis engines behind one interface, one configuration file and one diagnostic
model, and it reports findings in a form that is equally useful to a human reading a terminal
and to an AI agent tasked with fixing them.

The developer experience is three commands:

```
npm install -D @misaon/slop-gate
sgate init      # detects the repo, writes a tailored config, migrates existing tooling
sgate check     # analyses the whole monorepo
sgate fix       # applies what can be applied safely
```

### 1.1 Why this exists

Aggregating linters is not novel — trunk, qlty, MegaLinter and SonarQube all do it. Two problems
remain unsolved by all of them, and they are the reason slop-gate exists:

1. **Nobody governs the rules.** Enable enough engines and plugins and you get duplicate findings,
   contradictory fixes, rules that silently shadow each other, and overrides that stopped applying
   to anything years ago. Maintaining hundreds of rules by hand becomes untenable.
2. **Nobody targets AI-generated code specifically.** Existing anti-slop tools are LLM prompts
   (non-deterministic, share the blind spots of the model that wrote the code) or single-language
   scripts.

slop-gate's answer to (1) is the **Rule Registry** — a compiled, versioned catalogue in which every
rule declares the *concept* it detects, with deterministic single-owner arbitration per concept and
full provenance for every decision. Its answer to (2) is a deterministic `slop.*` ruleset that grows
on top of that substrate.

### 1.2 Non-goals

- **No LLM calls in the core.** `check` is offline, reproducible, key-free and cost-free. AI value is
  delivered through output formats and an MCP server, not by calling a model.
- **Not a CI platform.** No hosted dashboards, no proprietary backend. A remote cache is the only
  planned network feature, and it is optional.
- **Not a formatter of its own.** Formatting is delegated to oxfmt, exclusively.
- **Not a security scanner** beyond what the aggregated engines provide.

---

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Primary binary is `sgate`, alias `slop-gate`. `sg` is **not** used. | `sg` collides with shadow-utils `/usr/bin/sg` on Linux and with ast-grep's alias. Shipping a global bin named `sg` would generate "ast-grep stopped working" reports. |
| D2 | slop-gate **owns** the rules: `init` migrates and replaces existing eslint/prettier/biome/stylelint configs. | Conflicts are eliminated at the source. A wrapper that defers to the repo's own configs cannot govern what it does not control. Migration doubles as the onboarding feature. |
| D3 | Core engines bundle as `optionalDependencies` platform packages; exotic engines download lazily into a checksum-verified local cache. | One `npm install` must produce a working tool. Shipping every engine would push install size into hundreds of MB. |
| D4 | Deterministic core, first-class agent surface. No LLM in the analysis path. | Reproducible CI, no keys, no cost, no flaky results. Agent value comes from `--format agent` and `sgate mcp`. |
| D5 | Orchestrator in TypeScript. `engines.node` is `>=24`; runtime-agnostic ESM so it also runs under Bun and Deno. | A devDependency must work in every CI, and Node is the only universal runtime. Node 24 has been LTS since October 2025, so requiring it costs nothing and buys native TS config loading. |
| D6 | No first-party Rust crate initially. Discovery and hashing sit behind an interface so a napi-rs crate can replace them once profiling justifies it. | Rust arrives free via oxlint/oxfmt/ast-grep binaries. A cross-compile CI matrix is real cost; pay it when measurements demand it. |
| D7 | Three-tier fixes: `safe` (default), `suggested`, `unsafe`. Each declared per rule in the registry and covered by tests. | Trust is the scarce resource. One bad rewrite in someone else's repo ends the project. |
| D8 | Aggregation and governance are built first; the `slop.*` ruleset grows incrementally on top. | The substrate is the hard, irreversible part. Rules are additive and cheap once the substrate is right. |
| D9 | `engine-eslint` exists as a deliberately shrinking escape hatch. | oxlint cannot lint framework templates yet (roadmap: late 2026). ESLint runs only for concepts no faster engine owns; as oxlint grows, the registry re-elects owners and ESLint's scope shrinks to nothing without users touching their config. |
| D10 | Biome is enabled **scoped to CSS/SCSS only**. | Biome's CSS rules fill a real gap. Its JS/TS rules would massively overlap oxlint — concept ownership makes the narrow scoping explicit and enforced rather than a convention. |
| D11 | License MIT. | Maximum adoption. qlty's BSL is a differentiator we can use against it. |

---

## 3. Verified ecosystem state (July 2026)

Recorded with dates so a future session can tell what has gone stale.

| Component | State as of 2026-07-30 | Consequence for us |
|---|---|---|
| **oxlint** | v1.75. Type-aware linting **stable** (2026-07-22). Distributed as an npm package using **NAPI-RS**. Output formats: default, json, unix, checkstyle, github, gitlab, junit, stylish. | Primary JS/TS engine, callable **in-process** via NAPI — no subprocess startup. Consume `--format json`. |
| **tsgolint** | v7, tracks TypeScript 7.0.2, covers **59 of 61** typescript-eslint type-aware rules. | Owner of all `types.*` concepts. |
| **oxlint JS plugins** | ESLint v9-compatible API, **alpha** since 2026-03-11. `@oxlint/plugins` provides `definePlugin`/`defineRule`. | Usable but gated behind a capability probe with graceful degradation. Not the primary vehicle for slop rules. |
| **oxfmt** | Beta 2026-02-24, 100% of Prettier's JS/TS conformance tests. Supports JS/JSX/TS/TSX, JSON/JSONC/JSON5, YAML, TOML, HTML, Angular, Vue, Svelte, CSS/SCSS/Less, Markdown/MDX, GraphQL, Handlebars. Import sorting and Tailwind class sorting included. | Exclusive owner of every `formatting.*` concept across ~20 file types. Removes the need for Prettier entirely. |
| **TypeScript** | **7.0 GA 2026-07-08**, Go-native, 8–12× faster. **No stable programmatic API**; planned for 7.1 (~Oct 2026). No separate `tsgo` binary in stable — the native build *is* `tsc`. | Type errors come from shelling out to `tsc` and parsing text output. Revisit when 7.1 lands. |
| **Biome** | v2.5 (June 2026), 500+ rules, cross-file analysis, own type inference without tsc. | CSS/SCSS only (D10). |
| **knip** | Current, first-class monorepo/workspace support. | Owner of `dead-code.unused-file`, `dead-code.unused-export`, `deps.*`. Whole-program, cannot be cached per file. |
| **ast-grep** | Rust, tree-sitter based, YAML rule files, multi-language. | Engine for declarative structural and slop rules, including languages no JS parser covers. |
| **MCP** | Spec revision **2026-07-28**: stateless protocol core (no `initialize` handshake, no protocol-level session), extensions framework, Tasks extension, cacheable list results. | `sgate mcp` targets the stateless core — a natural fit for a CLI that holds no session state. |
| **AGENTS.md** | De facto standard, donated to Linux Foundation Dec 2025, 60k+ repos, read by 20+ agents. | `sgate init` writes a marker-fenced, idempotent section. |
| **napi-rs** | v3 stable (July 2025), WASM fallback, cross-compilation without heavy Docker images. | The route for a future first-party Rust crate (D6). |
| **Rolldown / tsdown** | Rolldown 1.0 stable May 2026; Vite 8 stable March 2026 ships on it. tsdown is the Rolldown+oxc library bundler. | tsdown builds our packages. |
| **Node.js** | 24 is recommended LTS since March 2026. Native TS type stripping (via Amaro/SWC) on by default for `.ts`. Does **not** read `tsconfig.json` paths at runtime and does **not** type-check. | Config files load natively; path aliases in config files are unsupported and warned about. |
| **Competitors** | trunk (30+ tools, caching, new-issues-only), qlty (Rust, 60+ plugins, 20k+ rules, **BSL** licence), MegaLinter (Python multiprocessing, 60+ languages), SonarQube (quality profiles). None governs rule overlap; none detects AI slop. | Our differentiators: rule governance, slop ruleset, agent-native output, MIT. |

---

## 4. Architecture

### 4.1 Pipeline

```
sgate check
  │
  ├─ 1  Config resolution   → EffectiveConfig + per-layer provenance
  ├─ 2  Rule Registry       → EffectiveRuleset + concept arbitration + lockfile check
  ├─ 3  Discovery           → FileInventory (paths, hashes, language, workspace)
  ├─ 4  Planner             → ExecutionPlan (engine × file batch, cache-aware)
  ├─ 5  Scheduler           → worker pool + subprocess pool, streaming
  ├─ 6  Normalizer          → canonical Diagnostic stream (filter, fingerprint, suppress)
  └─ 7  Reporters           → pretty │ agent │ json │ sarif │ github │ junit
```

Stages 1–2 are pure functions over configuration; they never touch the filesystem beyond reading
config files. This makes the entire governance layer unit-testable without fixtures.

Stage 6 is a transform over an async stream, not a batch step. Diagnostics reach the reporter as
they are produced.

### 4.2 Module boundaries

Each package has one purpose, a documented interface, and no knowledge of its consumers.

```
packages/
  cli/                  @misaon/slop-gate            argument parsing, command wiring, bins
  core/                 @misaon/slop-gate-core       config, registry, discovery, planner,
                                                     scheduler, cache, diagnostics, fix arbiter
  reporters/            @misaon/slop-gate-reporters  every output format
  mcp/                  @misaon/slop-gate-mcp        stateless MCP server
  rules-slop/           @misaon/slop-gate-rules-slop ast-grep rule files + oxlint plugins
  testkit/              @misaon/slop-gate-testkit    fixture harness for engine conformance
  engine-oxlint/        engine-oxfmt/      engine-tsc/       engine-knip/
  engine-biome-css/     engine-astgrep/    engine-schema/    engine-actionlint/
  engine-zizmor/        engine-hadolint/   engine-eslint/
```

`core` depends on no engine package. Engines are registered at runtime through a manifest, which
keeps the dependency graph acyclic and lets a user's config add a third-party engine.

---

## 5. The Rule Registry

The central mechanism. Everything else is plumbing around it.

### 5.1 Concepts

A **concept** is a stable, engine-independent identifier for *what is being detected*. Concepts form
the vocabulary users configure and the key by which overlap is detected.

Top-level groups:

| Group | Meaning |
|---|---|
| `correctness.*` | Genuine defects: unreachable code, duplicate object keys, invalid regex |
| `types.*` | Type-aware findings: floating promises, unsafe `any` flow, misused promises |
| `dead-code.*` | Unused imports, variables, exports, files, dependencies |
| `formatting.*` | Whitespace, quotes, semicolons, import order — **always owned by the formatter** |
| `style.*` | Naming, preferred syntax |
| `complexity.*` | Function length, nesting depth, cognitive complexity |
| `duplication.*` | Copy-paste clones |
| `security.*` | Injection, secrets, unsafe eval, CI script injection |
| `perf.*` | Known slow patterns |
| `a11y.*` | Accessibility in JSX and framework templates |
| `framework.*` | React hook rules, Vue reactivity mistakes |
| `config.*` | Invalid or deprecated configuration, schema violations |
| `deps.*` | Unlisted, duplicated, or version-mismatched dependencies |
| `slop.*` | AI-specific smells |

Leaves are the configurable unit, e.g. `dead-code.unused-import`, `types.floating-promise`,
`slop.narrative-comment`.

Concepts are versioned. A renamed concept keeps a `renamedTo` entry, a removed one keeps a
`deprecated` entry with a removal version. **A config referencing a deprecated concept warns; it
never silently stops applying.**

### 5.2 Registry entries

The registry is **generated at build time** by introspecting each engine (`oxlint --rules --format json`,
Biome rule metadata, ESLint plugin metadata, our ast-grep rule files, actionlint's catalogue) and
merging hand-authored mapping metadata. It is committed, reviewable, and diffable.

```ts
type RuleEntry = {
  engine: EngineId
  engineRuleId: string          // what the engine calls it
  concepts: ConceptId[]         // many-to-many: one rule may cover several concepts
  tier: 0 | 1 | 2               // 0 native, 1 native+types, 2 JS/WASM
  priority: number              // fix-conflict tiebreaker
  severityDefault: Severity
  fixKind: 'none' | 'safe' | 'suggested' | 'unsafe'
  fixTouches: FixDomain[]       // 'imports' | 'statements' | 'formatting' | 'jsx' | ...
  requires: Capability[]        // 'types' | 'project-graph' | 'workspace-graph'
  languages: LanguageId[]
  docsUrl: string
  since: string
  deprecated?: { since: string; replacedBy?: ConceptId }
}
```

### 5.3 Arbitration

For each **enabled concept**, exactly one rule is elected owner:

1. If the config pins an owner (`owners: { 'dead-code.unused-export': 'knip' }`), that wins.
2. Otherwise candidates are filtered to rules whose `requires` are satisfiable in this repo
   (e.g. `types` requires a resolvable tsconfig) and whose `languages` intersect the inventory.
3. Candidates are ranked by `tier`, then by the registry's engine preference order, then by
   `engineRuleId` alphabetically. The ranking is total, so elections are fully deterministic.

   The default preference order is:
   `oxfmt > oxlint > tsgolint > tsc > biome-css > astgrep > schema > actionlint > zizmor > hadolint > knip > eslint`.
   It expresses one principle — prefer the fastest engine that is *capable* of the concept — and it is
   data in the registry, not logic, so adding an engine means adding a row.
4. Losers are recorded with `suppressedBy` and a reason.

A rule is **enabled** if it was elected for at least one concept. Because rules cover multiple
concepts, an enabled rule may still emit findings for a concept owned by someone else — so
arbitration is enforced twice:

- **at election time**, deciding which rules to configure on which engine, and
- **at normalization time**, dropping any diagnostic whose `(rule, concept)` pair is not the elected
  owner for that concept.

The second check is what makes double-reporting structurally impossible rather than merely unlikely.

`formatting.*` is a special case: the formatter is the permanent owner of the whole group, so every
formatting-related lint rule in every engine is disabled by construction. This dissolves the
`eslint-config-prettier` class of problem instead of patching it.

### 5.4 Provenance and the governance commands

Every config layer application and every arbitration decision is recorded, producing an audit trail
per rule. That trail powers commands no competitor offers:

```
sgate rules                          list effective rules: concept, engine, severity, why enabled
sgate rules why types.floating-promise
                                     full provenance: which preset enabled it, which override
                                     changed severity, which competing rules were suppressed
sgate rules conflicts                overlapping concepts, shadowed rules, dead overrides,
                                     contradictory severities
sgate rules diff <ref>               diff the effective ruleset between two configs or commits
sgate rules search unused            discovery across concepts and engine rule ids
sgate explain <concept>              human documentation for a concept
```

`sgate rules conflicts` also runs as part of every `check`, emitting `config.*` diagnostics. Config
rot surfaces automatically instead of accumulating silently.

**Dead overrides** deserve emphasis: an override targeting a rule that is not the elected owner, or a
concept that no enabled engine covers, is reported. This is the specific failure mode that makes
hand-maintained hundred-rule configs decay, and it becomes a visible diagnostic.

### 5.5 The lockfile

`slop-gate.lock` (committed) records:

- the resolved effective ruleset hash,
- per-engine version and per-engine ruleset hash,
- the concept taxonomy version,
- the arbitration outcome for every concept where more than one candidate existed.

Three payoffs: exact cache keys; `sgate check --frozen-rules` fails CI on unexpected ruleset drift
(exit code 4); and a ruleset change becomes a reviewable diff in a pull request. Engine upgrades stop
being invisible behaviour changes.

### 5.6 Generated types

Registry generation also emits a `.d.ts` containing a union of all concept ids and per-concept option
types. `defineConfig` is therefore fully autocompleting and type-checked across hundreds of rules,
with inline documentation from `docsUrl`. Typos in concept names become type errors.

---

## 6. Configuration

### 6.1 File

`slop-gate.config.ts` at the repo root; optional per-workspace `slop-gate.config.ts` in workspace
roots. `.js`, `.mjs` and `.mts` are accepted.

```ts
import { defineConfig } from '@misaon/slop-gate'

export default defineConfig({
  extends: ['recommended', 'typescript', 'vue', 'tailwind'],
  workspaces: 'auto',

  rules: {
    'dead-code.unused-import': 'error',
    'complexity.max-function-length': ['warn', { max: 80 }],
    'slop.narrative-comment': 'error',
  },

  overrides: [
    { files: ['**/*.test.ts'], rules: { 'complexity.max-function-length': 'off' } },
  ],

  owners: { 'dead-code.unused-export': 'knip' },
  engines: { eslint: { enabled: 'auto' } },
  ignore: ['**/generated/**'],
})
```

Presets are written in terms of concepts: `recommended`, `strict`, `slop`, plus domain packs
(`typescript`, `react`, `vue`, `svelte`, `tailwind`, `node`, `ci`, `docker`).

Engine rule ids are also accepted as keys, resolved through the registry — but if the referenced rule
is not the elected owner, that is reported as a dead override. The documented canonical form is the
concept id, which is what makes engine substitution invisible to users.

### 6.2 Resolution layers

Lowest to highest precedence:

1. Registry defaults
2. slop-gate presets, in `extends` order
3. Framework profiles (§23) — may only turn a concept **off**
4. Root config `rules`
5. Per-workspace config
6. Path-scoped `overrides`, in declaration order
7. Inline source directives

Every application is recorded as a provenance step.

### 6.3 Inline suppressions

```ts
// sgate-disable-next-line slop.as-any-cast -- upstream types are wrong, see #482
const x = y as any                          // sgate-disable-line -- reason
// sgate-disable-file correctness.no-debugger -- intentional in this fixture
```

Three directives, implemented in `packages/core/src/suppressions/parse.ts`:

- **`sgate-disable-next-line`** silences a finding on the line *after* the comment.
- **`sgate-disable-line`** silences a finding on the *same* line as the comment (a trailing comment
  next to the offending code).
- **`sgate-disable-file`** silences a matching finding anywhere in the file.

Block `disable`/`enable` pairs are deliberately out of scope: they are more machinery, and the form
most often opened and never closed.

**Targets** are zero or more concept ids or engine rule ids (the same `RuleKey` shape `config.rules`
accepts — an engine rule id is the escape hatch), space- or comma-separated, up to a literal `--`.
Naming no target silences every concept at that location. A target is not validated against the
concept catalogue or registry: a typo'd target simply never matches anything, which is reported as
`config.unused-suppression` below — that diagnostic *is* the validation.

**A reason is required** — the text after `--`. Suppressions that match nothing are reported as
`config.unused-suppression`; a directive present with no reason (or an empty one) is reported as
`config.suppression-missing-reason` **but still applies** — hiding a finding a user explicitly
silenced, as punishment for comment formatting, is worse than the formatting problem. Both prevent
the disable-comment graveyard that every large codebase accumulates: one for a suppression nobody
removed after the code was fixed, the other for one nobody explained in the first place.

**Matching is a whole-line token scan, not a per-language comment parse.** M0 only analyses script
files, but `#`-commented languages (shell, Docker, YAML) arrive in M2, and a token scan costs nothing
now and keeps working then without per-language grammar. The known cost: a string literal containing
the token verbatim reads as a real directive too. Accepted, not fixed — the same class of tool
(ESLint, oxlint itself) makes the same trade.

**A suppressed finding is marked, not dropped.** `Diagnostic.suppressed` (§10) is set on it and it is
kept in the array `normalizeDiagnostics` returns — and so in the per-file cache entry — rather than
removed; `run/check.ts` is the layer that hides a suppressed diagnostic from the default result and
severity counts, which is the seam a future `--show-suppressed` flag would change instead of
restructuring anything upstream of it. Unused-suppression detection is computed in the same place,
for the same reason: it needs to know what the file's diagnostics actually were, which is only known
once normalization has run, and a cache-hit file skips normalization entirely — so both the
suppressed marker and the unused-suppression diagnostic have to live in the cached array itself, or a
warm run silently loses them.

### 6.4 Loading

Node's native type stripping first; on failure (older Node, non-erasable syntax) fall back to
`oxc-transform`, which is already in the dependency graph. Config files must not use `tsconfig`
path aliases — Node does not resolve them at runtime, and this is detected and reported with a clear
message rather than failing obscurely.

Loading a `.ts`/`.js` config in a project whose `package.json` lacks `"type": "module"` makes Node
emit a `[MODULE_TYPELESS_PACKAGE_JSON]` process warning — it cannot tell CommonJS from ESM from the
package scope alone, so it reparses and warns about the overhead. `sgate init` writes `.mts` for such
a project specifically to make the extension unambiguous, but that only helps new setups; an existing
or hand-written `.ts` config still triggers it on every run. The config file is ours, loaded by our
own code, so the noise is ours to own rather than Node's: `importModule` (`config/load.ts`) suppresses
this one warning code for the duration of the import and restores the prior `process` warning
listeners immediately after, so any unrelated warning is unaffected. Matched on `warning.code`, never
on the message text, which is Node's to reword at any time.

Loading a config file executes repository code. This is the same trust model as ESLint, Vite and
Prettier, and it is documented explicitly.

---

## 7. Discovery and inventory

One filesystem pass per run, shared by every engine.

- In a git repository with `git` available: `git ls-files -co --exclude-standard -z --deduplicate`.
  This yields exactly the tracked plus non-ignored untracked files, correctly and fast, without
  reimplementing ignore semantics. Verified to honour nested `.gitignore` at every level,
  `.git/info/exclude` and the global `core.excludesFile`.
- Otherwise (no git, or `git` unavailable): an internal parallel walker that collects every
  `.gitignore` it passes as it descends and applies each with real gitignore semantics — negation,
  nesting, and a directory pattern excluding everything beneath it — via the `ignore` package (the
  same engine eslint uses for `.eslintignore`). A deeper `.gitignore` is tested after its ancestors,
  so it can override them, matching git's own precedence; once a directory itself is excluded,
  nothing beneath it is visited, including a deeper negation, matching the documented gitignore(5)
  limitation ("It is not possible to re-include a file if a parent directory of that file is
  excluded"). This walker does not read `.git/info/exclude` or `core.excludesFile` — outside a git
  repository neither exists to read.
- `.slopignore` and config `ignore` are applied on top of whichever source ran, as one combined
  rule set — a path either excludes is excluded, and a `!negation` in either can re-include a path
  the other matched, the same way two blocks appended to one `.gitignore` combine. Both are real
  gitignore patterns via the `ignore` package, not bare globs: a bare directory name, a trailing
  slash and a leading slash all anchor and mark directories exactly as they would in a `.gitignore`,
  and an unrooted pattern like `*.ts` matches at every depth. This is one syntax across both
  surfaces rather than "globs in config, gitignore in `.slopignore`".
  `.dockerignore`, `.npmignore` and `.eslintignore` are deliberately never read: each answers a
  different question than "what should be analysed" (`.dockerignore` routinely excludes `test/`
  and `docs/`, which users want linted) and reading one would silently narrow what gets analysed
  with no signal — the same class of failure as the cache-inventoried bug (M0 follow-ups). Do not
  add this thinking it was an oversight.
- **Language detection**: extension map, then special filenames (`Dockerfile`, `docker-compose.yml`,
  `.github/workflows/*.yml`), then shebang sniffing for extensionless files.
- **Workspace attribution**: the workspace graph is built from `pnpm-workspace.yaml`,
  `package.json#workspaces`, `bun.lock`, `deno.json`, `turbo.json`, `nx.json` or `moon.yml`. Each
  file is attributed to its nearest workspace root.
- **Hashing**: `(size, mtimeMs)` is checked against the cache index first; content is hashed only
  when that pre-check indicates a possible change. This is the single largest warm-run win.

`FileInventory` is the only representation of "what files exist" in the system. Engines never walk
the filesystem themselves; they receive explicit file lists.

Discovery and hashing sit behind `FileSource` and `Hasher` interfaces so a napi-rs implementation can
be substituted later (D6) without touching anything downstream.

---

## 8. Planner and scheduler

### 8.1 Planning

For each engine, the planner computes the set of files that (a) the engine's capabilities cover,
(b) at least one elected rule applies to, and (c) have no valid cache entry. Engines with zero
planned work are not started at all.

Engines declare granularity:

- `file` — results are per file and cacheable per file (oxlint, oxfmt, ast-grep, biome-css, schema, actionlint, zizmor, hadolint)
- `project` — whole-program analysis, cacheable only per workspace against an aggregate input hash (tsc, knip)

### 8.2 Scheduling

- **Project-granularity engines start first.** They are the long pole; per-file work runs alongside
  them and fills the CPU.
- **Per-file engines are batched**, with batch size tuned per engine: large batches for subprocess
  engines to amortise startup, worker-sized chunks for NAPI engines.
- **Results stream.** The reporter renders findings as they arrive, so the first diagnostic appears
  well before the run finishes. This is what makes the tool *feel* fast, independent of total time.
- **Worker pool**: a purpose-built pool over `node:worker_threads`. Off-the-shelf pools model tasks
  as request/response; we need per-task result *streaming*, cooperative cancellation and engine
  affinity (keeping a NAPI engine instance warm inside a worker). This justifies ~150 lines of our own.
- **Subprocess pool**: N long-lived processes fed batches, stdout parsed incrementally as
  line-delimited JSON where the engine supports it.
- **Concurrency** defaults to `os.availableParallelism()` but is clamped by cgroup v2 `cpu.max` when
  present. Containers routinely report host CPU counts, which otherwise causes catastrophic
  oversubscription in CI.
- **Cancellation**: one `AbortSignal` threaded throughout. `SIGINT` kills the child process group and
  removes materialised temp configs.
- **Backpressure**: in-flight diagnostics are capped; the reporter consumes as it goes.

---

## 9. Caching

`.slop-gate/cache/`, gitignored.

- `index` — path → `{ size, mtimeMs, hash }`, the pre-check that avoids hashing.
- `results/<engineId>/<hh>/<hash>.json` — normalized diagnostics for one
  `(file, engine, engineVersion, engineRulesetHash, configHash)` tuple, folded into a single hash.
  Key components are stored inside the entry for debuggability.
- `results/project/<engineId>/<aggregateHash>.json` — whole-program results per workspace.

Details that matter:

- **Negative caching is explicit.** A clean file stores an empty result. Without this, clean files are
  re-analysed on every run — the most common meta-linter caching bug.
- `tsc --incremental` is used in addition to our cache, with its build info stored inside
  `.slop-gate/cache/`.
- knip has no incremental mode; it is re-run only when JS/TS files, `package.json` files or the
  workspace graph changed.
- Eviction is LRU by access time with a configurable cap (default 512 MB).
- `sgate cache info | prune | clear`.
- A `CacheStore` interface (`has`/`get`/`set`) is defined now; HTTP and S3 implementations for shared
  CI caching are phase 6. Local is the default and the only implementation at launch.

---

## 10. Diagnostic model

```ts
type Diagnostic = {
  concept: ConceptId
  ruleId: string            // `<engine>/<engineRuleId>`, for traceability
  engine: EngineId
  severity: 'error' | 'warn' | 'info'
  message: string
  file: string              // repo-relative, posix separators
  range: { start: number; end: number }              // byte offsets
  position: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  related?: Array<{ file: string; range: Range; message: string }>
  fix?: { kind: 'safe' | 'suggested' | 'unsafe'; description: string; edits: Edit[] }
  docsUrl: string
  fingerprint: string
  suppressed?: { by: 'inline' | 'baseline' | 'config'; reason?: string }
}
```

**Offsets are bytes; columns are UTF-16 and 1-based.** Rust engines speak byte offsets, editors and
LSP speak UTF-16 code units. Conversion happens once in the normalizer, using a per-file line index
built lazily. Getting this wrong produces off-by-N columns on any file containing non-ASCII text, so
it is covered by explicit fixtures with multi-byte content.

### 10.1 Fingerprints

```
sha256(concept + '\0' + repoRelativePath + '\0' + normalizedWindowHash + '\0' + occurrenceIndex)
```

`normalizedWindow` is the diagnostic's range expanded to whole lines with runs of whitespace
collapsed. `occurrenceIndex` disambiguates identical windows within one file. Line numbers are
deliberately excluded so fingerprints survive reformatting and unrelated edits above the finding —
the property that makes baselines usable in practice.

---

## 11. Fix pipeline

`sgate fix` applies fixes at the requested tier (`safe` by default, `--suggest`, `--unsafe`).

1. Gather all fixes for a file from all engines as `(range, replacement, kind, ruleId)`.
2. Sort by start offset. Where ranges overlap, the higher-priority edit wins — priority comes from the
   registry, then severity, then rule id. Losers are dropped and their rules re-run next pass.
3. Apply in reverse offset order into an in-memory buffer.
4. Re-run affected engines on changed files. Iterate to a fixed point, maximum 10 passes.
5. **Oscillation detection**: buffer hashes are retained per file per pass. A repeated hash means two
   rules are fighting. We stop fixing that file and emit `config.fix-oscillation` **naming both
   rules**. A rule pair that endlessly rewrites each other becomes a precise, actionable diagnostic
   instead of a hang or a corrupted file.
6. **Formatting runs last, always**, over the changed files only. Combined with the formatter's
   permanent ownership of `formatting.*` (§5.3), no fix can fight the formatter.
7. Writes are atomic: temp file plus rename.

Safety rails: `fix` refuses to run with a dirty git worktree unless `--allow-dirty`; `--dry-run`
prints a unified diff and writes nothing; files outside the inventory or matched by `ignore` are never
touched; a summary of files changed and rules applied is always printed.

---

## 12. Reporting

All reporters consume the same diagnostic stream.

- **`pretty`** (default, human): framed header and footer, an open (unframed) body grouped by file
  with code frames, OSC 8 hyperlinks to rule docs, top-offending files, optional `--timing` breakdown
  per engine and rule. Honours `NO_COLOR`, `FORCE_COLOR` and TTY detection for colour, and `TERM=dumb`
  separately for an ASCII-only frame and severity-marker fallback — colour and Unicode degrade
  independently, so a non-TTY pipe (colour off) still gets the real frame and emoji glyphs, and only
  `TERM=dumb` (not "not a TTY") drops to ASCII.
- **`agent`**: the differentiator. Deterministic ordering, token budget via `--max-tokens`, minimum
  sufficient context per finding (concept, why it matters, exact location, offending snippet, and the
  suggested change as a unified diff when one exists), **grouped by fix strategy** so an agent can
  batch related work, and an explicit split between "`sgate fix` handles this, do not touch it" and
  "this needs your judgement". Ends with a `nextActions` block.
- **`json`**: versioned, stable schema. The contract for third-party integrations.
- **`sarif`**: GitHub code scanning ingests this, yielding PR annotations for free.
- **`github`**: workflow commands for inline annotations without SARIF upload.
- **`junit`**: CI test-report surfaces.

### 12.1 MCP server

`sgate mcp` implements the **stateless** 2026-07-28 revision — no `initialize` handshake, no
protocol-level session, which matches a CLI that holds no state between calls. Transports: stdio
(default) and HTTP.

Tools: `check` (optionally scoped to paths or concepts), `explain_rule`, `list_conflicts`,
`fix` (with `dryRun`), `baseline_status`. Resources: rule documentation pages.

No network egress. Local-only by default.

### 12.2 Baseline

`.slop-gate/baseline.json` records existing findings by fingerprint so a team can adopt slop-gate on
a large codebase without fixing everything first — only new findings fail the build.
`sgate baseline create | update | show`. Because fingerprints exclude line numbers (§10.1), a
reformat does not invalidate the baseline.

---

## 13. Engine adapters

```ts
interface Engine {
  readonly id: EngineId
  version(): Promise<string>
  readonly capabilities: {
    languages: LanguageId[]
    granularity: 'file' | 'project'
    provides: Capability[]
    fixes: boolean
  }
  ruleCatalog(): Promise<RuleDescriptor[]>              // feeds registry generation
  materializeConfig(rules: EffectiveRules, ctx: RunContext): Promise<EngineConfigHandle>
  run(scope: FileBatch | ProjectScope, signal: AbortSignal): AsyncIterable<RawDiagnostic>
}
```

Ephemeral engine configs are materialised under `.slop-gate/tmp/` with restrictive permissions and
removed afterwards. Users never see or maintain engine-native config files.

### 13.1 Domain ownership

"Bundled" means an `optionalDependencies` platform package installed with slop-gate. "Lazy" means
downloaded on first use into a checksum-verified cache (D3). "Peer" means resolved from the user's own
dependencies.

| Domain | Owner | Delivery | Notes |
|---|---|---|---|
| JS/TS/JSX lint | **oxlint** (NAPI, in-process) | bundled | Also handles `<script>` blocks in `.vue`/`.svelte`/`.astro` |
| Type-aware findings | **tsgolint** via oxlint | bundled | 59/61 typescript-eslint type-aware rules |
| Type errors | **tsc** (TS 7 eventually; TS 5.9.3 measured) | peer | Shell out and parse; `--incremental`. Uses the repo's own TypeScript version |
| Formatting, ~20 file types | **oxfmt** | bundled | Exclusive owner of `formatting.*`, incl. import and Tailwind class sorting |
| Dead code, dependency hygiene | **knip** | bundled | Pure JS. Project granularity. Shelled out to today, not run in a worker — see §13.2 |
| CSS/SCSS semantics | **Biome, scoped to CSS** | lazy | Registry enforces zero overlap with oxlint |
| Structural and slop rules | **ast-grep** | bundled | Declarative YAML, cross-language |
| GitHub Actions correctness | **actionlint** | lazy | Go binary |
| GitHub Actions security | **zizmor** | lazy | Rust binary |
| Config files | **JSON Schema** / SchemaStore | bundled | docker-compose, tsconfig, package.json, renovate — cheap, high value. Schemas cached locally |
| Dockerfile | **hadolint** | lazy | Plus ast-grep rules |
| Framework templates, niche plugins | **eslint** (shrinking escape hatch) | peer | Only concepts no faster engine owns |

Using the repository's own `typescript` and `eslint` (peer) is deliberate: type errors and ESLint
results must match what the developer's editor and existing CI already report, or the tool loses
credibility on its first run.

The escape hatch is the mechanism that lets us claim complete coverage today and improve silently:
as oxlint gains template support, the registry re-elects owners and ESLint's planned file set shrinks
toward empty — with no change to any user's configuration.

**`tsc` implemented (M2, first project-granularity engine).** `@misaon/slop-gate-engine-tsc` shells out
to the resolved project's own `tsc -p <tsconfig> --noEmit --pretty false --incremental`, parsing plain
text — confirmed against the real 5.9.3 binary that `--pretty false` (or simply omitting `--pretty`,
which already auto-detects non-TTY output) never emits ANSI codes or a code frame, only
`file(line,col): error TSxxxx: message`, with **no length**, only a starting position, and **no
trailing summary line** (`Found N errors...` is `--pretty`-only). A diagnostic is not always one line:
multi-candidate errors (overload mismatches, some module-resolution messages) continue onto further
lines with two- or four-space indentation and no `file(line,col):` prefix of their own — the only
correct way to parse this is a line-based state machine that treats any non-matching line as a
continuation of whichever diagnostic is currently open. `RawDiagnostic.range` is filled in as a
deliberate one-character span at the reported column, `typescript` is resolved from the *analysed
project's own* directory (never `engine-tsc`'s own install location — it is a peer dependency), and the
resolved `bin/tsc` needed the identical Windows shebang-spawn fix oxlint's own resolver already has
(both are extensionless `#!/usr/bin/env node` scripts) — now shared as `resolveScriptBin`
(`packages/core/src/exec/resolve-script-bin.ts`) rather than duplicated. One concept,
`types.type-error`, covers every TS error code deliberately: `tsc` has no `--rules`-style catalogue to
introspect the way oxlint does, and one concept is what lets `'types.type-error': 'off'` disable
typechecking wholesale without inventing group-wildcard config syntax. Project-granularity caching
(spec §9) landed as a genuinely separate code path in `streamCheck`, not a variant of the per-file one —
see `.superpowers/engine-tsc-report.md` for the full design writeup, the captured-output log every
claim above is checked against, and the measured finding counts this repository and the linked NestJS
playground actually produced (both zero, at time of writing — `types.type-error` is not yet in the
`recommended` preset; see that report for why).

### 13.2 `knip`: dead code and dependency hygiene

**Implemented (M2, second project-granularity engine).** `@misaon/slop-gate-engine-knip` shells out to
its own bundled `knip --reporter json`, parsing the JSON report.

**What it does that a bare `knip` run cannot.** knip discovers workspaces the way a package manager
does: `package.json#workspaces`, `pnpm-workspace.yaml`, and so on. slop-gate's inventory (§7) has
already listed every file in the repository before any engine starts, nested manifests included, so the
set of real packages is simply *known* — declared or not. The adapter therefore **synthesises knip's
workspace map from the inventory**, deriving one entry per `package.json` in the assigned file list
(`synthesizeKnipWorkspaces`). Measured against a fixture reproducing the shape below, this produces
**byte-identical findings to the same repository with its workspaces properly declared** — the
synthesis is not an approximation of the declared case, it is the declared case. Two further
inventory-derived suppressions ride along: `.slop-gate/**` (our own cache and temp directory, which
`check` must never report on whether or not `init` has gitignored it) and the slop-gate config file
itself, whose path only the CLI knows.

**Why that matters — the grounding measurement.** `knip --reporter json` was run once, read-only,
against a real NestJS monorepo-ish project (24 issues: 15 `files`, 12 `devDependencies`, 11 `exports`,
7 `dependencies`, 3 `owners`, 3 `unlisted`). Accuracy was poor, and the cause was diagnosed rather than
guessed: that repository declares **no** workspaces in `package.json` and has no `pnpm-workspace.yaml`,
yet `tech-docs/` has its own `package.json`. knip saw a single package, never reached `tech-docs/**`
from the root entry graph, and never activated its own VitePress plugin. **knip's accuracy collapses
when it cannot see the workspace structure**, and that is exactly the gap the inventory closes.

**What it cannot do, stated plainly.** Workspace synthesis fixes what knip could not *see*; it does not
fix what knip cannot *know*. Measured against a fixture reproducing that repository's shape:

- **The VitePress false positives survive it.** Declaring `tech-docs` a workspace does make knip read
  its manifest and enable its VitePress plugin — but that plugin's entry patterns are
  `.vitepress/config.*` relative to the *workspace root*, and the real site lives at
  `tech-docs/docs/.vitepress/`. The two config files stay unused-file findings, and `vitepress` itself
  now additionally reports as an unused devDependency **and** an unlisted binary. Naive synthesis went
  from 18 findings to 20 on that fixture: two more, both wrong. Pointing the plugin at the right
  subdirectory is framework awareness — §23, which this and the two findings below are three of the
  five motivating measurements for.
- **ORM migrations, runtime-loaded config and convention directories remain unused files.** They are
  loaded, never imported; no import graph can see them.
- **A dependency re-exported by a framework meta-package reads as unlisted.** `express` through
  `@nestjs/platform-express` is the measured case.

**Measured accuracy, two independent repositories** (a NestJS-shaped fixture reproducing the grounding
run, and this repository): `files` **13/13 false positives**; `dependencies` **3/3** (config-referenced
`@mikro-orm/*` on one, `require.resolve`-spawned `oxlint` on the other); `unlisted` **3/3**, all three
the same logical `express`; `devDependencies` 4 true / 1 false; `binaries` 1 true / 1 false; `exports`
1 true / 0 false. **Nothing knip owns is in `recommended`**, and the reason is accuracy, not cost —
knip checks this repository's 153 JS/TS files in ~0.31s standalone and ~0.39s through the full
pipeline, which is cheap for a project engine. The ten concepts are opt-in by concept, exactly like
`types.type-error`. Every entry in `packages/core/src/registry/entries.manual.ts` records its own
measurement.

**Ten of knip's seventeen issue types are surfaced, one concept each; seven are excluded with a written
reason each** (`packages/engine-knip/src/issue-types.ts`), and a test asserts the two sets partition
knip's vocabulary so no category can be dropped silently. Unlike `tsc` — whose whole domain collapses
into one synthetic `type-error` because it has no selectable rule set at all — knip *does* publish a
real selection vocabulary: the names its own `--include`/`--exclude` accept. That is what
`RuleEntry.engineRuleId` names here, so a user can turn off one distrusted category
(`'dead-code.unused-file': 'off'`) without losing the rest. `severityDefault` is `warn` throughout
except `deps.unresolved-import`, which is `error` on categorical grounds: everything else in the group
asks "is this still needed?", a judgement, while an import resolving to nothing means the module cannot
load.

**knip reports the same logical finding once per referencing file** — `express` appeared three times in
the grounding run, once per importing source file, each with its own real position. Those stay three
diagnostics. Collapsing them would have to pick one file arbitrarily, and, decisively, an inline
`sgate-disable-next-line deps.unlisted-dependency` at one import site would then silently govern (or
fail to govern) the other two. knip already deduplicates *within* a file, so no two are ever the same
position.

**Bundled, not peer** — the opposite of `tsc`, deliberately. `tsc` is a peer because a type error must
match what the developer's editor and existing CI already report; knip has no editor counterpart to
agree with, so that argument does not exist here and the opposite one does: knip's findings are a
property of its own version and plugin catalogue, and the accuracy figures above are only reproducible
against a pinned one. It also has no peer dependencies of its own (it parses with `oxc-parser`, not
`typescript`), and essentially no repository has knip installed — a peer would mean "engine
unavailable" for nearly every user. The consequence shows up in the API: `createKnipEngine()` needs no
`rootDir`, where `createTscEngine({ rootDir })` does.

**Three implementation details worth carrying forward.**

- **knip's `exports` map does not list `./package.json`**, so the `require.resolve('<pkg>/package.json')`
  both other adapters use throws `ERR_PACKAGE_PATH_NOT_EXPORTED` (verified against 6.31.0, and pinned
  by a test so a future release that adds the export is noticed). Left to `resolveScriptBin`'s own
  `catch` that degrades silently to a bare `knip` on `PATH`, which a globally-installed `sgate` has no
  reason to have. `resolveKnipPackageJson` reaches the manifest through the package's `.` entry point
  instead. `bin/knip.js` then needs the identical Windows `node <script>` treatment as `bin/oxlint` and
  `bin/tsc` — the `.js` extension is no reprieve, since `CreateProcess` cannot launch a `.js` file as
  an image either.
- **`--no-exit-code` collapses knip's exit-code ambiguity.** Without it knip exits 1 for "found issues"
  and 2 for "could not run" — the same trap `engine-tsc` had to reason its way through. With it, 0
  means the run succeeded and anything else is a real failure; confirmed directly that a genuine error
  still exits 2 under the flag.
- **The config is materialised in two phases**, because its two halves become available at two
  different moments: the elected ruleset at `materializeConfig`, the workspace map only at `run` (it is
  derived from the planner's file list, per §7's "engines receive explicit file lists"). `run` merges
  the second half into the file the first wrote. `rulesetHash` covers only the ruleset half; the
  workspace half needs no hash because a project assignment's cache key already folds in every assigned
  file's path and content hash — which is why knip's declared languages include `json` and `jsonc`
  (§9: "re-run only when JS/TS files, `package.json` files or the workspace graph changed"), and
  deliberately exclude `yaml`, since this adapter overrides knip's own workspace discovery and
  `pnpm-workspace.yaml` therefore no longer influences the outcome.

---

## 14. The slop ruleset

Pattern-shaped rules are ast-grep YAML (contributable without writing code, cross-language).
AST- and type-dependent rules are oxlint JS plugins, gated behind a capability probe because that API
is alpha.

Initial set:

| Concept | Detects |
|---|---|
| `slop.narrative-comment` | Comments addressing a reader about process: "In a real implementation…", "Note that we…", "This is a placeholder" |
| `slop.redundant-comment` | A comment restating the line beneath it |
| `slop.swallowed-error` | `catch` that is empty, or only logs and continues |
| `slop.as-any-cast` | `as any`, `as unknown as T` |
| `slop.stub-implementation` | Exported function whose body only throws "not implemented" or returns a placeholder literal |
| `slop.defensive-bloat` | Null checks on values already narrowed by their types |
| `slop.duplicate-utility` | Near-identical helper defined in two or more places |
| `slop.emoji-in-code` | Emoji in identifiers or strings outside i18n and docs |
| `slop.over-abstracted-wrapper` | Single-caller wrapper that only forwards its arguments |
| `slop.hallucinated-import` | Import of a module that is neither declared nor resolvable |
| `slop.config-drift` | Generated config blocks contradicting the repo's actual setup |

Every slop rule ships with: a documentation page explaining *why* the pattern is a problem, a declared
`fixKind`, fixture tests covering true **and** false positives, and a documented escape for the
legitimate cases. A slop rule with a high false-positive rate damages the project more than its
absence, so the false-positive fixtures are mandatory, not optional.

---

## 15. CLI surface

```
sgate init [--ci github] [--no-migrate]
sgate check [paths...]
sgate fix [paths...] [--suggest] [--unsafe] [--dry-run] [--allow-dirty]
sgate rules [list | why <id> | conflicts | diff <ref> | search <q>]
sgate explain <concept>
sgate baseline [create | update | show]
sgate cache [info | prune | clear]
sgate doctor
sgate migrate
sgate mcp [--http]
sgate lsp                                  # phase 6
```

Global flags: `--format <pretty|agent|json|sarif|github|junit>`, `--since <ref>`, `--only <concept-glob>`,
`--engine <id>`, `--max-warnings <n>`, `--frozen-rules`, `--no-cache`, `--concurrency <n>`,
`--max-tokens <n>`, `--timing`, `--quiet`, `--verbose`.

`check` analyses everything by default and relies on the cache for speed. `--since <ref>` restricts
per-file engines to changed files while still running project-granularity engines whole — narrowing
those would produce wrong answers, and silently wrong results are worse than slow ones.

**Exit codes:** `0` clean · `1` findings at or above threshold · `2` config or usage error ·
`3` engine failure · `4` frozen-ruleset drift. Distinct codes let both CI and agents react correctly.

### 15.1 `sgate init`

Probes the repository into a `RepoProfile`: package manager and workspace layout, languages and
frameworks (from dependencies plus file sampling), the tsconfig graph and its strictness, existing
lint and format configs, CI provider.

Then emits a **minimal** config — presets plus only the deltas this repository actually needs, not a
dump of every option. Also writes `slop-gate.lock`, creates `.slop-gate/` with a gitignore entry,
appends a marker-fenced idempotent section to `AGENTS.md`, and optionally scaffolds a CI workflow.

Migration mappers translate ESLint (flat and eslintrc), Prettier, Biome and Stylelint configs into
concepts. The output is a **migration report** listing what mapped, what did not map and why, and
which rules were dropped because a faster engine owns the concept. Old configs are archived to
`.slop-gate/migrated/`, never deleted without confirmation.

---

## 16. Performance targets

Committed to a benchmark suite; CI fails on regression beyond 10%.

| Metric | Target |
|---|---|
| First diagnostic rendered | < 200 ms |
| Cold run, 5 000 files | < 3 s |
| Warm run, no changes | < 300 ms |
| Warm run, one file changed | < 500 ms |
| Cold run, 100 000 files | < 45 s |
| Install size, default engines | < 60 MB |

Benchmarks cover synthetic repositories at 1k, 10k and 100k files plus real-world monorepos.
Comparative numbers against trunk, qlty and ESLint are published, generated by a committed script so
anyone can reproduce them.

---

## 17. Testing strategy

- **Unit (Vitest)** for the pure layers: registry election, config layering and provenance, edit
  arbitration, fingerprinting, cache-key derivation. These carry the highest defect cost and need no
  fixtures.
- **Property tests (fast-check)** on the edit arbiter: for any set of overlapping edits, output is
  never corrupt and the loop always terminates.
- **Engine conformance fixtures**: each adapter has a fixture directory and a snapshot of expected
  normalized diagnostics. This is how we detect upstream engine behaviour changes on version bumps —
  the main ongoing maintenance risk of an aggregator.
- **Registry invariants**: every rule has at least one concept, docs and a `fixKind`; every enabled
  concept has exactly one owner; presets reference only existing concepts; no concept is orphaned.
- **Reporter golden files** per format, including a token-budget-constrained `agent` output.
- **End-to-end** on real sample monorepos, asserting exit codes and finding counts.
- **Platform matrix**: Linux, macOS, Windows × Node 24 and 26, with explicit CRLF and non-ASCII
  fixtures. Node 24 is the declared minimum in `engines`; nothing below it is tested or supported.
- **Performance gates** as in §16.

---

## 18. Error handling

Engines are treated as untrusted subprocesses.

- Per-engine timeouts, configurable, with a clear message naming the engine and the batch.
- **Crash isolation**: one engine failing does not fail the run. It is reported as an engine-level
  diagnostic and the process exits `3`, distinct from "findings were reported".
- Missing binary produces an actionable message containing the exact install command.
- Engine version mismatch against the lockfile warns and invalidates that engine's cache.
- Malformed engine output is reported with the raw fragment retained under `--verbose`, never
  swallowed.
- Every failure names the engine, the file batch and the reproduction command.

---

## 19. Security

- Lazily downloaded binaries are verified against SHA-256 digests pinned in a committed manifest. No
  `curl | sh`. An offline mode fails loudly rather than reaching the network.
- Materialised engine configs live in `.slop-gate/tmp/` with restrictive permissions and are removed
  on exit, including on `SIGINT`.
- The MCP server is local-only by default with no network egress.
- Loading `slop-gate.config.ts` executes repository code — the same trust model as ESLint and Vite,
  stated explicitly in the documentation.
- `fix` never writes outside the file inventory.

---

## 20. Our own repository

| Concern | Choice |
|---|---|
| Package manager | pnpm 10 workspaces |
| Task runner | Turborepo |
| Build | tsdown (Rolldown + oxc) |
| Tests | Vitest, fast-check |
| Versioning and release | Changesets |
| Lint and format | oxlint + oxfmt, replaced by `sgate` on itself as soon as it can run |
| CI | GitHub Actions: platform × Node matrix, plus a dedicated performance job |
| Licence | MIT |

Source-code standards, enforced in review: no comments restating code; comments only for non-obvious
*why*; no duplicated logic across packages; files stay focused, and a file growing large is treated as
a signal that it holds more than one responsibility. The tool's own source has to survive its own
`slop.*` ruleset — the most honest test available.

---

## 21. Phasing

| Milestone | Content | Definition of done |
|---|---|---|
| **M0 Foundation** | Repo, tooling, CI. Core types, config loader, discovery, inventory, cache skeleton, `pretty` reporter. `check` with oxlint only, engines run sequentially. Minimal `init` that writes a default config. | `sgate check` finds real issues in a real repo, end to end |
| **M1 Governance** | Concept taxonomy, registry generation, arbitration, provenance, all `rules` subcommands, lockfile, dead-override and unused-suppression detection, generated config types | `sgate rules why` and `sgate rules conflicts` produce correct answers on a repo with deliberately conflicting rules |
| **M2 Engine breadth** | oxfmt, tsc, knip, biome-css, schema, actionlint, zizmor, eslint escape hatch. Scheduler maturity, streaming, project-granularity caching | All target file types covered: TS, JS, YAML, CSS/SCSS, HTML, Vue, React, Tailwind, Dockerfile, docker-compose, GitHub Actions |
| **M3 Fix and safety** | Edit arbiter, three fix tiers, oscillation detection, formatter-last, dry-run diffs, baseline | Property tests pass; a deliberately oscillating rule pair is reported, not hung on |
| **M4 Agent surface** | `agent` reporter with token budgeting, MCP server, AGENTS.md integration, `explain`, SARIF, `github` | An agent fixes a seeded slop finding from `--format agent` output alone |
| **M5 Init and migration** | Repo profiling, migration mappers, migration report, CI scaffolding | `sgate init` on three real repos with existing ESLint configs produces working setups |
| **M6 Launch and beyond** | Docs site, published benchmarks, slop ruleset expansion, LSP, remote cache, first-party Rust scan core if profiling justifies it | Public release |

This specification covers the whole system so that later milestones inherit a coherent design. It is
deliberately larger than one implementation plan. **M0 and M1 are planned and built first**, because
together they produce a working tool and the governance layer that every later milestone depends on;
M2–M6 each get their own plan once the substrate exists and has been measured.

---

## 22. Risks

| Risk | Mitigation |
|---|---|
| oxlint JS plugin API is alpha and may break | Slop rules are primarily ast-grep; oxlint plugins sit behind a capability probe and degrade gracefully |
| TypeScript 7 has no programmatic API until ~7.1 | Shell out to `tsc` with a robust output parser pinned by fixtures; revisit when 7.1 ships |
| Upstream engines change behaviour on upgrade | Conformance fixtures, lockfile, `sgate doctor`, and ruleset diffing in PRs |
| The concept taxonomy is a long-term maintenance commitment | Versioned, with `deprecated`/`renamedTo`; configs never break silently |
| Windows paths and CRLF | Explicit platform matrix and fixtures from M0, not retrofitted |
| Install size creep | Measured per release with a CI budget |
| Slop rules with high false-positive rates | Mandatory false-positive fixtures; a noisy rule ships disabled by default until fixed |
| Perceived as "just a wrapper around oxlint" | Governance commands and the slop ruleset are the launch narrative, not the engine list |

---

## 23. Framework awareness

A repository's framework changes what is *true* about its code, and until now nothing in the pipeline
could see one. Five independent measurements — three recorded in §13.2, every one of them in the M0
follow-ups — share exactly that cause:

| Measured finding | What the tool would need to know |
|---|---|
| `typescript/no-extraneous-class` — 11/11 false positives on a NestJS project, one per `*.module.ts` | decorator-driven DI *requires* an empty class body |
| knip reports ORM migrations as unused files | the ORM discovers them at runtime from a path in its own config |
| knip reports `docs/.vitepress/config.mts` unused | knip's VitePress plugin looks for `.vitepress/` at the workspace root; the site is a level down |
| knip reports `express` unlisted in a NestJS project | `@nestjs/platform-express` re-exports it |
| oxlint's jest and vitest plugins both fire on every `describe`/`it` | only one of the two frameworks is actually installed |

Two of those are rules being wrong; three are an engine being wrong. **They are one problem with two
consumers, and they get one mechanism.** Building a framework notion for the registry and a second,
similar-but-different one for engine config synthesis is how a codebase ends up with two answers to
"does this repository use NestJS" that disagree in the one case anybody cares about.

### 23.1 Detection

A **framework profile** is a named description of one framework's consequences. Detection answers one
question per profile: *is this framework present, and with what parameters?*

**Detection never returns a boolean.** A boolean cannot fix any of the rows above: "VitePress is
present" does not tell knip where to look, and it does not let `sgate rules why` say anything more
useful than "off, because reasons". Detection returns **evidence**, and every variant names the file
it came from:

```ts
type FrameworkEvidence =
  | { kind: 'manifest-dependency'; file: string; workspace: string; name: string; field: DependencyField }
  | { kind: 'path-present'; file: string }
  | { kind: 'config-literal'; file: string; property: string; value: string }
```

Evidence is produced by **probes**, and a profile declares which it needs. There are three, ordered by
cost, and a profile that can answer with a cheaper one must:

| Probe | Reads | Cost | Yields |
|---|---|---|---|
| `dependency` | the `package.json` files the inventory already listed | one `JSON.parse` per workspace manifest | `manifest-dependency` |
| `path` | the inventory itself | **zero I/O** — the file list is already in memory | `path-present` |
| `literal` | one named config file | one bounded read plus one parse | `config-literal` |

**Detection never executes repository code.** §6.4 accepts that loading `slop-gate.config.ts` runs
repository code, on the grounds that the file is written *for us*, by the user, as configuration.
`mikro-orm.config.ts` is not that file: it is written to open a database connection, and importing it
to learn one string would make `sgate check` dial a database. So the `literal` probe reads the source
and extracts a **string literal at a known property path**; it never imports it. When the value is not
a literal — a variable, `process.env`, a computed `join()` — the probe yields nothing and the profile
falls through to its next probe, or, if it has none left, declares itself **inapplicable**.

That failure direction is chosen deliberately and is worth stating on its own: **an unresolvable
parameter makes a profile not apply, which restores today's behaviour, rather than applying it with a
guessed value, which would silently move the wrong files.** A profile that cannot establish its
parameters is not a degraded profile; it is an absent one.

**Determinism.** Same repository state, same detected set — the product's central promise (§1.1), and
it is a promise about ordering as much as about content. Four points could leak filesystem iteration
order, and each is pinned:

- manifests are visited in `FileInventory.files` order, which `buildInventory` has already sorted with
  `compareStrings`;
- dependency names within a manifest are sorted before they become evidence, never taken in
  `Object.keys` order;
- profiles are evaluated in `compareStrings` order of their ids, not in registration order;
- the merged adjustment set is sorted before it is applied or hashed (§23.3 — and merging is a set
  union, so the sort is the *only* thing order could have affected).

**Cost.** Detection runs on every invocation, so it is bounded by the workspace count, not the file
count: N small `JSON.parse`s plus at most one bounded read per parameterised profile. `path` probes
cost nothing at all — the inventory is the input. No probe walks the filesystem (§7: "Engines never
walk the filesystem themselves"; neither does this), no probe reads a source file to scan its
contents, and no probe is allowed to grow into one without a measurement in this section justifying it.

**Where it runs.** In `resolveRun`, between `buildInventory` (which produces its input) and
`createRuleSetResolver` (the first of its two consumers). That places it inside the one code path
`sgate check` and every `sgate rules` command already share, so the governance commands explain the
same detection a real run performs rather than a second opinion about it.

### 23.2 Profiles and their two consumers

A profile is data plus one pure function. `consequences` is a function only because parameters make it
one — the paths a VitePress profile contributes depend on where the site turned out to be — and it is
pure over the detection facts: no filesystem, no config, no clock, so it is directly testable.

```ts
type FrameworkProfile = {
  readonly id: FrameworkId
  readonly detect: readonly Probe[]
  readonly consequences: (detected: DetectedFramework) => readonly FrameworkAdjustment[]
}

type FrameworkAdjustment =
  | { kind: 'disable-concept'; concept: ConceptId; reason: string }
  | { kind: 'engine-setting'; engine: EngineId; key: string; values: readonly string[]; reason: string }
```

Two adjustment kinds, one per consumer. Both carry a `reason` written for a human, because both end up
in `sgate rules why` (§23.4).

**Consumer 1 — the ruleset.** `disable-concept` enters the §6.2 cascade as its own layer, above the
presets and below the user's own `rules`. Above the presets because correcting a preset that is wrong
for *this* repository is the entire point; below the user because **a human who writes
`'suspicious.no-extraneous-class': 'error'` in a NestJS repository means it**. The framework layer
never wins an argument with a person.

**A profile may only subtract.** It can turn a concept off. It cannot turn one on, and it cannot change
a level. Three reasons, in descending order of importance:

1. **It makes the layer safe by construction.** The worst a wrong profile can do is lose coverage a
   user can restore in one config line. If profiles could enable rules, a wrong profile would invent
   findings in someone's CI, triggered by a dependency they added for unrelated reasons.
2. **It keeps the merge order-free.** Every adjustment is a set contribution in a single direction, so
   two profiles' outputs merge as a union (§23.3).
3. **`extends` is already the mechanism for adding.** §6.1's domain packs (`react`, `vue`, `node`) are
   opted into by name. "Installing a package changed which rules run" belongs nowhere, and least of all
   in the layer whose job is to make the tool quieter.

**Consumer 2 — engine configuration.** `engine-setting` is delivered to adapters on `RunContext`, which
gains one field carrying the adjustments for that engine only. `key` is an engine-specific string core
does not interpret — the same arrangement as `RuleEntry.engineRuleId`, and for the same reason: core
has no business modelling knip's config schema.

**The adapter owns its engine's merge semantics, not the profile.** knip makes this concrete and it is
measured, not assumed: in knip 6.31.0 `ConfigurationChief.getConfigForWorkspace` resolves
`workspaceConfig.entry ? arrayify(workspaceConfig.entry) : baseConfig.entry` — writing `entry` for a
workspace **replaces** knip's two default patterns rather than adding to them. A profile contributing
one migrations glob must therefore not produce a config that silently un-registers `src/index.ts` as an
entry point. The profile says "add this pattern"; `materializeKnipConfig` is what knows it must write
the defaults alongside it.

The six profiles, and what each is for:

| Profile | Detected by | Parameter | Consequence |
|---|---|---|---|
| `nestjs` | `@nestjs/core` (`dependency`) | — | disable `suspicious.no-extraneous-class` |
| `angular` | `@angular/core` (`dependency`) | — | disable `suspicious.no-extraneous-class` (see §23.5 on its narrower warrant) |
| `nestjs-express` | `@nestjs/platform-express` (`dependency`) | — | knip `ignoreDependencies += express` |
| `mikro-orm` | `@mikro-orm/core` (`dependency`) | migrations directory, via `literal` on the ORM config then `path` on the inventory | knip `entry += <dir>/*.ts` in the owning workspace |
| `vitepress` | `vitepress` (`dependency`) + a `.vitepress/` directory (`path`) | the site root that directory sits in | knip `workspaces[ws].vitepress.entry += <root>/.vitepress/config.*` |
| `test-framework` | `jest` and/or `vitest` (`dependency`) | which of the two are present | disable the **shared** concepts of every scope that is not the unique installed one |

`nestjs` and `nestjs-express` are two profiles rather than one because they are two facts. A NestJS
project on Fastify has the first and not the second, and merging them would make the `express`
suppression fire on a repository that never depends on `express` at all.

`nestjs` and `angular` are two profiles that reach the *same* conclusion, which is the one concept two
profiles genuinely contest — and the contest is a non-event, because both want it off. The rule layer
carries `off` twice, each profile keeps its own reason for `sgate rules why`, and the outcome does not
depend on which ran first. This is §23.3's union property on a real case rather than a hypothetical
one, and it is why that section is short.

`test-framework` is the one profile whose parameter is a *set*, and the only one whose rule reads
oddly enough to state in full: **disable the shared concepts of every scope that is not the unique
installed one; if there is not exactly one, disable them for both.** Both frameworks installed, or
neither, and dual firing is either genuinely unavoidable or the concepts match nothing anyway — both
cases degrade to exactly the unconditional exclusion this replaces, which is the behaviour
`registry/exclusions.ts` asked for ("until framework detection can elect the one that is actually
installed").

**"Shared" is doing real work there, and it was measured rather than reasoned about.** The first
implementation disabled the *whole* absent scope, which also turned off `correctness.no-export` — from
`jest/no-export`, a rule the vitest plugin has no counterpart for, that therefore never double-reports,
and whose advice is just as true under vitest. It bought thirteen concepts and quietly gave one back.
Pairing on the rule id (`jest/x` is dual-firing iff `vitest/x` exists) keeps all thirteen and is
independent of how the generator happens to spell a concept: it scope-qualifies a name only when two
scopes collide, so `correctness.jest-expect-expect` and `correctness.no-export` are both jest concepts
spelled differently, and matching on the spelling would encode a generator detail in a profile.

**What this actually moved into `recommended`, measured** (`extends: ['recommended']`, concepts that
elect an owner and therefore run, against the commit before this change):

| Repository | Before | After |
|---|---|---|
| slop-gate itself, and any vitest-only repository | 152 | **164** |
| a jest-only repository | 152 | **165** |
| both, or neither, installed | 152 | 153 |

Twelve concepts gained, none lost, and on this repository they produce **twelve findings** — eight
`vitest/no-conditional-expect` and four `vitest/require-to-throw-message`, taking `sgate check` from 53
diagnostics to 65. Four of the eight are a guarded `if (cond) { expect(...) }` with no `else`, which is
precisely the vacuous pass that rule exists to catch, so this is coverage doing its job rather than
noise to be tuned away.

One rule went the other way and is excluded outright, because its problem is the engine rather than the
framework: **`vitest/valid-expect`**, 27/27 false positives. The defect is narrow and worth stating
exactly, because a looser version of this claim was wrong: the rule accepts `expect(x, 'literal')` and
rejects `expect(x, key(x))`, though vitest declares `message?: string` and a computed string is still a
string. `jest/valid-expect` is deliberately *not* excluded — it reports the same message on the same
code and is correct there, since jest's `expect` really does take one argument. Measuring a rule *out*
is the same mechanism working.

### 23.3 Why there are no conflicts to resolve

The loudest failure mode this whole product exists to prevent is rules that overwrite each other —
§5.3 answers it for arbitration by making double-reporting *structurally impossible* rather than
merely unlikely, enforcing ownership twice instead of trusting one check. **This section takes the same
move one step earlier: rather than resolving framework conflicts, the adjustment vocabulary makes them
inexpressible.**

Every `FrameworkAdjustment` is a set contribution — a concept removed, or patterns/names added to a
list. There is no shape that assigns a value to a key. So the merge of every profile's output is a
sorted set union, which is commutative, associative and idempotent; the result does not depend on
detection order, profile order, or how many profiles said the same thing.

Union is not merely deterministic here, it is *semantically* safe, and that is a property of the
vocabulary rather than luck. Every key it can name holds a list of patterns or package names, and a
pattern that matches nothing costs nothing: two profiles contributing `docs/.vitepress/config.*` and
`site/.vitepress/config.*` produce a knip config that looks in both places and finds one. Contrast the
shape deliberately not offered — `{ key: 'entry', value: 'docs' }` — where the second writer wins,
the winner depends on evaluation order, and explaining the outcome requires a precedence table.

**If a future consequence genuinely needs a scalar, it does not get one here.** That requirement is a
signal the consequence belongs in a preset or in the engine adapter's own logic. Should a real case
ever prove otherwise, §5.3 is the pattern to copy — a total order, a single elected owner, and a
recorded loser with a reason — but it is deliberately not built in advance. A precedence mechanism with
no conflict to resolve is a precedence mechanism nobody has tested against a real disagreement.

### 23.4 Explainability, the lockfile, and the cache

**`sgate rules why` gains the framework layer.** The provenance step the framework layer emits carries
`layer: 'framework'` and the profile id as its `source`, so §5.4's existing provenance rendering prints
it with no special case, and `ConceptWhy` gains the evidence behind it:

```
  suspicious.no-extraneous-class
  Unexpected empty class

  Enabled: no — preset `recommended` enabled this at `warn`, but framework `nestjs` turned it off
      preset            recommended -> warn
      framework         nestjs -> off
  Framework: nestjs — detected via `@nestjs/core` in `package.json` (dependencies)
      NestJS requires an empty class body: the @Module decorator carries the behaviour.
```

That is the difference evidence buys. "Off because NestJS" is a dead end for a reader who disagrees;
naming the dependency and the manifest it is declared in tells them exactly what to change, and tells
them immediately if detection got it wrong.

**The detected set is part of the cache key.** `configHash` currently folds in the config and the
registry entries. It must fold in the detection result too, and the reason is a real bug rather than
tidiness: adding `@nestjs/core` to a `package.json` changes the effective ruleset without changing any
file oxlint was assigned, so a warm run would otherwise keep serving diagnostics from a ruleset that no
longer applies. The same argument puts the detected set in the lockfile (§5.5): framework drift is
ruleset drift, and `--frozen-rules` must fail on it.

### 23.5 Deliberately out of scope

- **Heuristic detection.** No "looks like a NestJS project" scoring over file names. Every profile
  detects on a declared dependency or a config file that exists. A framework whose presence cannot be
  established that way does not get a profile — because a false positive here *removes* coverage
  silently, which is the failure mode hardest to notice and hardest to attribute.
- **Profiles whose *effect* is unmeasured**, with one explicitly narrower warrant that is worth
  stating precisely, because the distinction is easy to collapse and the rule is easy to hollow out.

  The bar is a measured false-positive count against a real repository. Five of the six profiles
  clear it. `angular` does not: no Angular codebase was checked. It ships on **mechanism identity
  with an already-measured framework** — `@NgModule({...}) export class AppModule {}` is not similar
  to the NestJS case that was measured 11/11 false, it is the same construct, empty for the same
  reason, and `no-extraneous-class` is wrong about it for the same reason. What transfers is the
  mechanical claim; what does not transfer is a fresh count, and the profile's own comment says so.

  That warrant is available only when the construct is *demonstrably the same one*, and it is not a
  general licence to reason from resemblance. The asymmetry is what makes it acceptable here, and it
  is the same asymmetry behind "a profile may only subtract": shipping `angular` wrongly costs one
  rule's coverage on Angular repositories, restorable in a single config line, while omitting it
  leaves a rule in `recommended` — the *default* — that there is concrete mechanical reason to expect
  fires 100% falsely on every Angular repository that contains an NgModule. A profile that cannot
  point to either a measurement or an identity this specific does not ship.
- **Executing any repository code**, including a framework's own config file. See §23.1.
- **Per-file profiles.** Adjustments are workspace-scoped where the engine supports it, and that is as
  fine-grained as this gets. §6.2's `overrides` already scope rules by path, declared by a human who
  knows why.
- **Framework versions.** No profile branches on NestJS 9 versus 11. No measured case needs it, and
  the version is already in the evidence for whoever finds one that does.
- **Adding rules, choosing engines, or writing a user's config for them.** §23.2 covers the first;
  the other two are `extends` and `engines` respectively, and both are things a user says out loud.
- **A `sgate frameworks` command.** Detection surfaces through `rules why`, where the question is
  already being asked. A standalone listing is easy to add later and answers nothing yet.

---

## 24. References

Verified 2026-07-30.

- [oxlint — Type-Aware Linting Stable (2026-07-22)](https://oxc.rs/blog/2026-07-22-type-aware-linting-stable)
- [oxlint — JS Plugins Alpha (2026-03-11)](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha.html)
- [oxlint — Output formats](https://oxc.rs/docs/guide/usage/linter/output-formats)
- [oxlint — Writing JS Plugins](https://oxc.rs/docs/guide/usage/linter/writing-js-plugins)
- [oxfmt Beta (2026-02-24)](https://oxc.rs/blog/2026-02-24-oxfmt-beta)
- [oxc compatibility matrix](https://oxc.rs/compatibility.html)
- [tsgolint](https://github.com/oxc-project/tsgolint)
- [TypeScript 7 migration readiness](https://www.digitalapplied.com/blog/typescript-7-native-compiler-early-adopter-migration-readiness)
- [MCP specification 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28)
- [MCP — The 2026-07-28 Specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [Biome v2.5](https://biomejs.dev/blog/biome-v2-5/)
- [Knip — why use Knip](https://knip.dev/explanations/why-use-knip)
- [ast-grep](https://ast-grep.github.io/) · [rule configuration](https://ast-grep.github.io/guide/rule-config.html)
- [qlty CLI](https://github.com/qltysh/qlty)
- [MegaLinter configuration](https://megalinter.io/latest/configuration/)
- [AGENTS.md field guide 2026](https://www.iuriio.com/blog/posts/2026/05/agents-md-field-guide-2026)
- [napi-rs v3 announcement](https://napi.rs/blog/announce-v3)
- [Rolldown 1.0](https://voidzero.dev/posts/announcing-rolldown-1-0) · [tsdown](https://tsdown.dev/)
- [Node.js — running TypeScript natively](https://nodejs.org/learn/typescript/run-natively)
- [ast-grep `sg` name conflict](https://github.com/ast-grep/ast-grep/issues/706)
- [Specification and Detection of LLM Code Smells (ICSE 2026)](https://arxiv.org/pdf/2512.18020)
