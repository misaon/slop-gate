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
3. Root config `rules`
4. Per-workspace config
5. Path-scoped `overrides`, in declaration order
6. Inline source directives

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
| Type errors | **tsc** (TS 7) | peer | Shell out and parse; `--incremental`. Uses the repo's own TypeScript version |
| Formatting, ~20 file types | **oxfmt** | bundled | Exclusive owner of `formatting.*`, incl. import and Tailwind class sorting |
| Dead code, dependency hygiene | **knip** | bundled | Pure JS. Project granularity, runs in a worker |
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

## 23. References

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
