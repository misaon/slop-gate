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
| D10 | Biome is enabled **scoped to CSS only**. | Biome's CSS rules fill a real gap. Its JS/TS rules would massively overlap oxlint — concept ownership makes the narrow scoping explicit and enforced rather than a convention. Originally written "CSS/SCSS"; narrowed on measurement, because Biome 2.5.6 does not lint SCSS at all (§13.6). |
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
| **Biome** | v2.5.6, 511 rules, cross-file analysis, own type inference without tsc. **SCSS: parsing and formatting in progress, linting 🚫 — verified, `biome lint x.scss` ignores the file.** | CSS only (D10, narrowed by measurement). |
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

For each **enabled concept**, and **for each language that concept is contested over**, exactly one
rule is elected owner:

1. If the config pins an owner (`owners: { 'dead-code.unused-export': 'knip' }`), that wins.
2. Otherwise candidates are filtered to rules whose `requires` are satisfiable in this repo
   (e.g. `types` requires a resolvable tsconfig) and whose `languages` intersect the inventory.
3. Candidates are ranked by `tier`, then by the registry's engine preference order, then by
   `engineRuleId` alphabetically. The ranking is total, so elections are fully deterministic.

   The default preference order is:
   `oxfmt > oxlint > tsgolint > tsc > biome-css > astgrep > schema > actionlint > zizmor > hadolint > knip > eslint`.
   It expresses one principle — prefer the fastest engine that is *capable* of the concept — and it is
   data in the registry, not logic, so adding an engine means adding a row.
4. Losers are recorded with `suppressedBy`, a reason, and the languages they lost on.

**Why per language.** The guarantee is that exactly one rule reports a given concept *at a given
place*, and a place is a file, which has exactly one language. Two engines reporting
`correctness.parse-error` on the same file is the collision this exists to prevent; two engines
reporting it on YAML and on TypeScript respectively is not a collision at all, because no file is
both. Most concepts have a single owner across every language they cover and read exactly as they
always did; `correctness.parse-error` and `correctness.no-duplicate-object-key` are the ones that do
not, each owned by oxlint for JavaScript and TypeScript and by the `schema` engine for YAML.

> Ownership was originally keyed on the concept alone, which approximated this and got it wrong in
> one direction: an engine covering a language no other engine touched still lost the concept
> repository-wide, and the run emitted a `config.rule-overlap` for an overlap that could not happen —
> a false positive in the tool's own governance output. Corrected rather than loosened: the rule that
> exactly one rule may report a concept at a place is unchanged, and is now actually enforced at the
> scope it was always about.

A rule is **enabled** if it was elected for at least one concept. Because rules cover multiple
concepts, an enabled rule may still emit findings for a concept owned by someone else — so
arbitration is enforced twice:

- **at election time**, deciding which rules to configure on which engine, and
- **at normalization time**, dropping any diagnostic whose `(rule, concept)` pair is not the elected
  owner for that concept — consulting the file's language only where a concept has more than one
  owner, since that is the only case where there is anything to disambiguate. Enforcing language
  where a rule owns a concept outright would discard legitimate findings: a project engine reports
  against files it was never handed, `tsc` naming `tsconfig.json` being the standing example.

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
    'pedantic.eqeqeq': ['warn', 'smart'],
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

#### Per-rule options

A setting is either a level (`'warn'`) or a level followed by that rule's options
(`['warn', 'smart']`, `['warn', { max: 80 }]`). The options are a **positional list**, matching the
ESLint-family grammar every engine here inherits, and they are **opaque to core** — the same
arrangement `RuleEntry.engineRuleId` uses. Core decides *which* options apply; the adapter that owns
the elected rule is the only thing that decides what they mean. Core validating an oxlint option
shape would couple the two and be wrong for the next engine.

A positional list rather than an options object because the object form cannot express the values
that matter. `eqeqeq`'s `smart` mode — the reason `recommended` can carry the rule at all — is only
reachable as `["warn", "smart"]`; oxlint 1.76.0 rejects the object form outright with *unknown
variant `null`, expected `always` or `smart`*.

**Merge semantics — three decisions, stated rather than left to implementation order:**

- **Level and options are settled independently**, each last-wins. A layer that writes the bare level
  raises severity and inherits the options an earlier layer set. Without this, the commonest edit
  anyone makes to a config — `'pedantic.eqeqeq': 'error'` on top of `extends: ['recommended']` —
  silently discards a measured option and restores 2553 findings.
- **Options replace, they never merge.** A positional list has no meaning-preserving merge: combining
  `['smart']` with `['always', { null: 'ignore' }]` produces a third configuration nobody wrote. A
  deep merge would also require core to understand the engine's option grammar.
- **`['error']` — the tuple with no options — is the explicit reset**, so clearing an inherited
  option stays expressible without a second keyword.

**Options cannot be scoped to a path.** Levels can: the engine runs at the strongest level any
override asks for and each finding is re-graded per file during normalization. Options change
*whether the engine reports the finding at all*, and an engine is configured once per run — so
honouring a path-scoped option would mean applying it to every file or to none. Options in an
`overrides` block are therefore ignored and reported as `config.dead-override`; the level in the
same block still applies. (An engine whose own config format has path scoping, as oxlint's does,
could in principle be handed the override structure. That is a larger change than this and is
recorded as a follow-up.)

`sgate rules why` answers "what won" separately for each: the enablement line names the layer that
decided the level, and an `Options:` line names the layer that decided the options.

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

**`occurrenceIndex` is counted per `(concept, file, normalizedWindow)`, and that is a guarantee rather
than an implementation detail.** Counting it per `(concept, file)` — which is what the code did until
the follow-up that wrote this paragraph — numbers two findings on textually different lines `0` and
`1` in whatever order the engine emitted them, so a fingerprint depends on that order. Several engines
do not fix it: actionlint iterates a workflow's jobs over a randomised Go map and lints files
concurrently. Keyed on the window, the index only ever separates findings whose fingerprint inputs are
otherwise identical, so the *set* of fingerprints over a file is the same however the engine ordered
them.

### 10.2 An engine whose findings are not reproducible

Some engines do not return the same findings for the same input. actionlint is the measured case: ten
identical runs over 403 workflow files produced 442–447 findings, 441 of them in all ten. Three
decisions, so the next such engine does not reopen them:

1. **Do not detect it at run time.** Detection means running the engine twice and comparing, which
   doubles the cost of the slowest engines to answer a question two runs answer badly: the ten-run
   measurement above differed from the stable core by 0–5 findings per run, so two runs frequently
   agree by accident.
2. **Do not weaken the fingerprint for it.** Only two instability classes exist, and neither is
   reachable by hashing differently. A finding that is *absent* from the next run has no fingerprint at
   all. A finding *re-attributed to another line* quotes different text by construction, and the only
   way to stop caring is to drop the window — which would make fingerprints churn for every engine on
   any edit that adds an earlier finding to the same file. Emission order was the one class a hash
   change could fix, and §10.1 now fixes it for everyone.
3. **Keep the unstable rule out of the default presets, with the measurement recorded on it**
   (`registry/exclusions.ts`; `entries.test.ts` checks the exclusion holds). A rule too valuable to
   exclude has no answer here yet, and the honest thing to tell a user who enables one anyway is that
   its findings will drift and a baseline will show that drift as new findings.

---

## 11. Fix pipeline

`sgate fix` applies fixes at the requested tier (`safe` by default, `--suggest`, `--unsafe`).
Implemented in `packages/core/src/run/fix.ts` and `packages/core/src/fix/`; the CLI surface is
`packages/cli/src/commands/fix.ts`.

1. Gather all fixes for a file from all engines as `(range, replacement, kind, ruleId)`. `kind` comes
   from `RuleEntry.fixKind`, never from the engine — see §11.1.
2. Where ranges overlap, the higher-priority edit wins: registry `priority`, then severity, then rule
   id. Losers are dropped and their rules re-run next pass. Implemented as a greedy accept in
   *precedence* order rather than a left-to-right walk by offset, because the spec's original wording
   under-determines the three-edit case (A overlaps B, B overlaps C, A and C disjoint) — accepting in
   precedence order gives the same answer for any input ordering, and the accepted set is returned
   sorted by offset regardless. Half-open intervals, so **exactly adjacent ranges do not conflict**;
   a zero-width edit sharing a start offset with another edit does, because their order is otherwise
   undefined.
3. Apply in reverse offset order into an in-memory buffer. **The buffer is `Uint8Array`, not a
   string**: ranges are byte offsets (§10) and a JS string indexes UTF-16, so `slice` corrupts every
   file with non-ASCII text before the finding.
4. Re-run affected engines on changed files. Iterate to a fixed point, maximum 10 passes. Files are
   written between passes — the engines are subprocesses reading from disk, so an in-memory-only loop
   is not available. This is what the dirty-worktree rail exists for: a crash mid-run leaves a
   partially-fixed tree, and `git diff` is how the user untangles it.
5. **Oscillation detection**: buffer hashes are retained per file per pass. A repeated hash means the
   file has re-entered a state it was already in. We stop fixing that file and emit
   `config.fix-oscillation` **naming every rule that applied an edit from the repeated state
   onwards** — for the modal two-rule cycle that is exactly the two rules, and for a longer cycle
   every participant rather than an arbitrary two. The repeat is detected *before* the write and the
   write is skipped, so the file is left in the previous pass's state rather than at an arbitrary
   point in the cycle. Silencing the concept hides the report and never restarts the loop.
6. ~~**Formatting runs last, always**~~ — **not implemented, and not implementable today.** See
   §11.2.
7. Writes are atomic: temp file plus rename, via `writeFileAtomic` (which retries a transiently
   locked rename on Windows).

Safety rails, all implemented and each covered by a test:

- refuses to run with a dirty git worktree unless `--allow-dirty`. Untracked files are deliberately
  not dirt (`--untracked-files=no`): `sgate fix` never creates a file, so an untracked one cannot be
  confused with one of its edits, and a rail that fires on the wrong signal is one users learn to
  pass `--allow-dirty` past. A directory that is **not** a git worktree is also refused — there is no
  way to review or undo the rewrite — as is a `git status` that fails rather than answering.
- `--dry-run` prints a unified diff and writes nothing, and skips the worktree rail entirely (nothing
  to protect). It reports **one pass only**, flagged in the output, because a second pass needs the
  engines to read changed files back off disk.
- files outside the inventory or matched by `ignore` are never touched. Enforced by an allowlist
  built from the run's own `FileInventory`, which has already had gitignore, `.slopignore` and config
  `ignore` applied (§7) — not by a second implementation of the ignore rules. This is load-bearing
  rather than defensive: a project-granularity engine is explicitly permitted to report against files
  the inventory never contained (§8.1).
- an **engine failure aborts the pass before anything is written**. Not in the original list, and it
  is not caution: a failed engine contributed no edits, so arbitration made overlap decisions without
  seeing candidates that might have won them. Fewer fixes would be tolerable; differently chosen ones
  are not.
- a summary of files changed and rules applied is always printed, including the count of findings
  that were fixable at each tier — on a run that changed nothing, that line is the answer to "why did
  nothing happen".

### 11.1 Where fix data comes from

Two routes, because the engines genuinely differ:

- **Reported inline.** `RawDiagnostic.fix` rides along with the finding. ast-grep emits `replacement`
  and `replacementOffsets` on every match of a rule declaring a `fix:` (verified, 0.45.0), so its
  adapter carries them through at no extra cost. No shipped `slop.*` rule declares a `fix:` yet
  (§14), so this path produces nothing on a real repository today — it is proved by tests against
  captured real output, not by use.
- **Derived on request.** `Engine.deriveFixes` is called by `sgate fix` *after* normalization.
  **oxlint 1.76.0 reports fix data in no output format** — checked directly: `--format json` carries
  `message`/`code`/`severity`/`url`/`help`/`labels` and nothing else, `--format sarif` emits results
  with no `fixes` array (SARIF has a standard place for them), `--format agent` is one line of text
  per finding, and there is no `--fix-dry-run`. The only way oxlint will describe a fix is to perform
  one. So `engine-oxlint` copies the affected files under `.slop-gate/tmp/`, runs `--fix` there **one
  rule at a time** (which is what makes each resulting edit attributable, and therefore arbitrable),
  and recovers byte-ranged edits by diffing. The user's files are only read.

In both cases the **tier comes from `RuleEntry.fixKind`**, stamped on in `normalizeDiagnostics`. An
engine that offers edits for a rule the registry calls unfixable has them dropped, not retiered: D7
makes the registry the reviewable, committed declaration of how far a fix is trusted, and an adapter
reporting its own tier would be a second, unreviewed source of truth for exactly that decision.

Two findings about oxlint's fix flags, recorded to the standard the M0 follow-ups set (version,
observation, reproducer):

- **The three flags are mutually exclusive.** `oxlint 1.76.0 --fix --fix-suggestions` fails with
  ``Error: `--fix --fix-suggestions` is not expected in this context`` and leaves the file untouched.
  A caller that only checks whether the file changed reads that as "this rule has no fix".
- **They are not cumulative tiers.** `--fix` applies a `fixable_dangerous_fix`
  (`unicorn/no-useless-spread`, rewritten by plain `--fix`), and `--fix-suggestions` does not apply a
  `conditional_fix` (`prefer-const`, left alone). They select a *kind* of change, not a trust level,
  so **`--fix` is not a "safe fixes only" flag** and must never be used as a tier gate. The tier gate
  here is the single-rule config, built from a registry entry the caller already filtered.

### 11.2 The formatting step does not exist

Step 6 above requires formatting to run last over the changed files, resting on a formatter engine
owning `formatting.*` (§5.3). **No formatter adapter exists.** `oxfmt` is a known engine id with
nothing behind it.

Stated plainly, because it is the one guarantee §11 promises and does not deliver: **nothing in the
shipped pipeline prevents a fix from leaving formatting the repository's own formatter would undo.**
An edit that produces an over-long line, a different quote style, or an import in the wrong position
is written exactly as the engine produced it. `sgate fix` says so in its own output on every run that
changed a file. Run your formatter before committing.

This is not a small gap dressed up as a caveat — §5.3's whole argument for the formatter owning
`formatting.*` is that it dissolves the `eslint-config-prettier` class of problem, and step 6 is the
half of that argument that applies to *fixes*. Until an oxfmt adapter lands, `sgate fix` and a
repository's formatter are two tools writing to the same files with no arbitration between them.

---

## 12. Reporting

All reporters consume the same diagnostic stream.

- **`pretty`** (default, human): framed header and footer, an open (unframed) body grouped by file
  with code frames, OSC 8 hyperlinks to rule docs, top-offending files, optional `--timing` breakdown
  per engine and rule. Honours `NO_COLOR`, `FORCE_COLOR` and TTY detection for colour, and `TERM=dumb`
  separately for an ASCII-only frame and severity-marker fallback — colour and Unicode degrade
  independently, so a non-TTY pipe (colour off) still gets the real frame and emoji glyphs, and only
  `TERM=dumb` (not "not a TTY") drops to ASCII.
- **`agent`**: the differentiator. Plain text, deterministic ordering, token budget via
  `--max-tokens`, minimum sufficient context per finding, **grouped by fix strategy** so an agent can
  batch related work, and an explicit split between "`sgate fix` handles this, do not touch it" and
  "this needs your judgement". Ends with a `nextActions` block. Implemented in
  `packages/reporters/src/agent.ts`; see §12.3 for what shipped and the one clause of the sentence
  above that does not survive contact with a real run.
- **`json`**: versioned, stable schema. The contract for third-party integrations.
- **`sarif`**: GitHub code scanning ingests this, yielding PR annotations for free.
- **`github`**: workflow commands for inline annotations without SARIF upload.
- **`junit`**: CI test-report surfaces.

### 12.1 MCP server

`sgate mcp`, in `packages/cli/src/commands/mcp/`. The `agent` reporter lets an agent *read*
slop-gate; this lets one *call* it. No network egress, and nothing here writes to the repository.

**Stateless, protocol revision 2026-07-28.** No `initialize` handshake and no protocol-level session:
every request carries its own protocol version and client capabilities in
`_meta.io.modelcontextprotocol/*`, and `server/discover` — mandatory for a server, optional for a
client — answers identity, capabilities and supported versions in one round trip. That is the reason
for choosing this revision rather than an accident of timing: slop-gate holds nothing between calls,
so a protocol insisting on a session would model state that does not exist. Built on
`@modelcontextprotocol/server` 2.0, which serves a 2025-era `initialize` opening from the same
factory, so era is a property of the caller and not of the tool surface.

**stdio only.** HTTP was in the original wording and is deliberately not implemented: it is
network-facing, it is where the revision's authorization hardening applies, and a listening socket
needs a threat model rather than a flag. stdio has no such surface — the client launches the process
and owns both ends of the pipe, so the operating system's process permissions *are* the access
control. Deferred, with the threat model it would need, in the follow-ups.

#### The three tools, and why not the others

Each answers one question an agent has about **the user's code**:

- **`check`** — what is wrong here. Runs every installed engine and returns the `agent` reporter's
  own output verbatim as its text content. Verbatim is the point: the `INCOMPLETE:` block, the
  `coverage:` line leading with its correction, the automated/judgement split and `nextActions` are
  properties of that renderer (§12.3), and re-deriving any of them for a second surface would be
  re-deriving exactly the part that matters. Bounded to 25,000 estimated tokens by default, where the
  CLI is unbounded — a tool result lands directly in a context window, and the report states its own
  budget and omissions on every run, so the bound is safe to apply without being asked.
- **`explain_concept`** — why this counts as wrong. `resolveRun` + `explainConcept`, so no engine is
  ever spawned. Named for what it takes: **§12.1 previously called this `explain_rule`**, and every
  finding carries both a `concept` and a `ruleId`, so that name invites the wrong argument. Passing a
  rule id is answered rather than refused — the registry knows which concepts a rule declares, and
  saying so turns a dead end into a retry the model can make itself.
- **`propose_fixes`** — what would the tool change. The real fix pipeline (§11) with `dryRun: true`
  **hard-coded, not defaulted**; no argument turns it off. `sgate fix` can refuse a dirty worktree and
  offer `--dry-run` because a human is standing at the terminal to read the refusal; a model calling a
  tool has none of that, and an unexpected edit lands in a repository nobody is watching. Exposing the
  diff costs the caller one shell command and leaves the decision with the person whose files they
  are. All three tools are annotated `readOnlyHint: true`, and that is a property of the set.

Not shipped, each for a reason rather than for want of time:

- **`baseline_status`** cannot ship. §12.2's baseline does not exist in this codebase — there is no
  `sgate baseline` command and no `.slop-gate/baseline.json` writer, only the `'baseline'` member of
  `Diagnostic.suppressed.by` reserving room for one.
- **`list_conflicts` and a rules listing** answer a question about *slop-gate's own configuration*,
  which is a human's authoring task. Every tool costs context in every session on every `tools/list`,
  and `explain_concept` already reports the suppressed candidates and displaced owners for the concept
  a caller actually holds. `sgate rules conflicts` remains one shell command away.
- **Scoping `check` to paths** was in the original wording and is not implementable safely. `knip` and
  `tsc` are project-granularity (§8.1) and receive the inventory-derived file set, so narrowing the
  inventory does not give a narrower answer — it gives a *wrong* one, with every import from outside
  the subset reading as unused. This is §15's own argument for why `--since` narrows per-file engines
  only, applied to the same engines. `rootDir` is offered instead: it re-resolves config, inventory
  and project graph from a real root, which is what `--cwd` already does.
- **Resources.** `docsUrl` is a third-party URL for most concepts, and fetching one would breach the
  no-egress rule above; the five local `docs/rules/*.md` pages are not in the published package.

#### Confinement

`rootDir` defaults to the directory the server was started in and must resolve inside it. `sgate
check --cwd /anywhere` is fine because a human typed it; the same argument reaching a tool handler
came from a model, which may have read it out of a source file or a commit message. This is a
guardrail and not a sandbox — containment is lexical, so a symlink inside the root that points
outside it is followed — and the server runs with the user's own privileges regardless. What it stops
is the realistic accident.

#### Making a coverage gap unrepresentable

An MCP tool returning `{"findings": []}` while hadolint was missing is §12.3's cardinal sin with the
safety removed. Three things prevent it, and only the first is prose:

1. The text content **is** the `agent` report, so every honesty property in §12.3 applies unchanged.
2. `structuredContent.outcome` is a required enum — `clean`, `findings`, `incomplete`,
   `incomplete-with-findings` — with **no value meaning "nothing found" on its own**. A run that could
   not see everything is `incomplete` whatever its finding count, and the word leads.
3. `outcome`, `complete` and `gaps` are `required` in the declared `outputSchema`, and the SDK
   validates `structuredContent` against it before anything reaches the wire. An edit that drops the
   coverage block becomes a loud validation failure, not a quietly reassuring result.

Gap-ness is `isCoverageGap` — the reporter's own predicate, exported rather than restated, so an
absent engine that would have won nothing is not reported as a loss in one channel and not the other.
`ruleset.uncovered` is deliberately **not** a gap: it means "no *capable* candidate", and an engine
that is registered but not installed is not capable, so every concept an absent optional engine owns
lands there whether or not the repository holds a single file it would have looked at. Thirteen
workflow concepts, on a directory with no workflows. It is surfaced beside the gaps, not as one —
which is also what keeps this agreeing with the `coverage:` line, which counts engines only.

### 12.2 Baseline

`.slop-gate/baseline.json` records existing findings by fingerprint so a team can adopt slop-gate on
a large codebase without fixing everything first — only new findings fail the build.
`sgate baseline create | update | show`. Because fingerprints exclude line numbers (§10.1), a
reformat does not invalidate the baseline.

### 12.3 The agent reporter

`sgate check --format agent`, in `packages/reporters/src/agent.ts`. Rendered once on the `done`
event, like `json` — not streamed — because grouping, ordering and the budget all need the whole
result before the first byte is written.

**Layout.** A header (version, severity counts, files scanned and analysed); any incompleteness
notice; a `coverage` block; then two sections, `## automated` and `## judgement`, each subdivided by
concept; then `nextActions`. Text rather than JSON: the format's job is to be read by a model, unified
diffs paste out of it into `git apply`, and `json` already exists as the machine-parsing contract.
The closing block is headed literally `nextActions`, matching this section's own wording.

**The split is computed, not guessed.** A finding is automated when the run's registry entry for its
`ruleId` declares a `fixKind` other than `'none'` — the same lookup `sgate fix` gates on (§11.1), read
from `RULE_ENTRIES` by default and overridable for a run that passed `CheckOptions.entries`. The tier
is named on the group and the section header prints the flag needed to reach it, because a finding
only `--unsafe` reaches is useless to an agent that runs plain `sgate fix`. A rule with **no** registry
entry at all — every `slop-gate/config.*` concept the orchestrator emits itself — is judgement, not
unknown: those are the largest groups on a real run and dropping them would be the exact failure this
format exists to prevent.

**Grouping is by concept within each section**, ordered by severity, then finding count descending,
then concept id. Reason, remedy, rule id and docs link are stated once per group; a `message` or
`help` shared by every finding in a group is hoisted to it. On this repository that turns 41
`config.unused-suppression` findings into one four-line header plus 41 location-and-snippet lines.

**`why:` is printed only for a curated concept.** The registry generator names 801 concepts after the
oxlint rules it found and writes their descriptions mechanically — "Generated from oxlint's
`unicorn/no-useless-spread` rule (category: correctness). No Useless Spread." Presenting that as a
reason would be worse than printing nothing, so `GENERATED_CONCEPT_IDS` (`concepts/catalogue.ts`)
distinguishes the two and the header states how many groups have no rationale rather than leaving the
absence to be read as a bug. Four of the six concepts a real run of this repository produces are in
that state.

**The unified diff is the clause of §12 that does not survive contact with the diagnostic stream.**
`sgate check` never asks an engine for fix data — for oxlint that means re-running the binary once per
rule per file (§11.1), which a plain check has no business doing — and no shipped ast-grep rule
declares a `fix:`. So on this repository, today, **no finding in a check run carries an edit and no
diff is ever printed.** The renderer is real (`applyEdits` + `unifiedDiff`, `sgate fix`'s own, so a
diff shown here is the one that would be written) and is covered by tests, but it is dead on real
input. Rather than leave that to be inferred, the automated section says so on every run that has no
edits attached and points at `sgate fix --dry-run`.

#### Token budget

`--max-tokens <n>` bounds the whole report. **There is no tokenizer here**: one token is estimated as
three UTF-8 bytes, which over-counts prose (nearer four) and roughly matches dense CJK (one token per
three-byte character), so the estimate errs toward under-filling. Bytes rather than `String.length`
because counting characters would under-count CJK threefold — the one direction this must never err
in. The report states the ratio and calls it an approximation.

Truncation is never silent, which is the property everything else is arranged around:

- **A group header is never dropped.** Every concept appears with its *true* finding count even when
  every one of its findings was omitted, so the report is always a complete inventory of what the run
  found and only the per-finding detail is elided.
- **`coverage` states shown, omitted and the budget on every run**, including runs where nothing was
  dropped — "no omission notice" is never something the reader has to infer from silence — and lists
  the omitted count per concept.
- **The admission rule is printed in the report.** Findings are admitted one per group in rotation —
  the first of every group, then the second — so a small budget keeps a worked example of every
  concept rather than spending itself on the largest one. A finding too large for the space left is
  skipped and the next considered.
- **Space is reserved by a sizing render** with no finding admitted, every optional block present and
  every count at its widest, so it is an upper bound on the fixed sections and the finished document
  cannot overrun. The complete report is tried first, because a report with nothing omitted carries
  none of the bookkeeping a truncated one needs and can be *smaller* than the reservation.
- **When the fixed sections alone exceed the budget they are printed anyway**, with a line saying so.
  A report that fits its budget by hiding what it dropped is worse than one that overruns. The
  practical floor is roughly 600 tokens for a two-concept run and 1,600 for this repository's six.

**Nothing time- or cache-dependent is printed.** `durationMs`, `filesFromCache` and `enginesRun` are
omitted deliberately: the format's value as an agent input rests on the same repository state
producing the same bytes, and `packages/cli/src/e2e.test.ts` proves it end to end by comparing a cold
run's report with a warm one's.

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

Per-rule options (§6.2) reach the adapter on `RunContext.ruleOptions` — `engineRuleId` → that rule's
option list, in the same key space as the selection, present only for the rules that have any. They
ride there rather than inside `EngineRuleSelection`'s value, which is where they would sit if the
interface were being designed now: widening that value type would break every adapter outside this
repository, and four of the adapters inside it decide enablement by comparing it against the literal
`'off'` — a comparison that keeps compiling and starts being wrong the day the value can be a tuple.
Recorded as a follow-up.

**An adapter that reads `ruleOptions` must fold it into `EngineConfigHandle.rulesetHash`.** That hash
is the only per-engine term in the result cache key (§9), so two runs differing only by a rule's
options would otherwise share a cache entry and the second would be served the first's findings. An
adapter that materialises its options into a config object it already hashes gets this for free; one
that does not has to say so on purpose.

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
| CSS semantics | **Biome, scoped to CSS** | bundled | Implemented — see §13.6. **CSS only: Biome cannot lint SCSS or Less at all** |
| Structural and slop rules | **ast-grep** | bundled | Declarative YAML, cross-language. Implemented — see §13.3 |
| GitHub Actions correctness | **actionlint** | lazy | Go binary. Implemented — see §13.5 |
| GitHub Actions security | **zizmor** | lazy | Rust binary |
| Config files | **JSON Schema** / SchemaStore | bundled | docker-compose implemented — see §13.4. tsconfig, package.json, renovate still open (JSON needs a position-preserving parser) |
| Dockerfile | **hadolint** | lazy | Haskell binary. Implemented — see §13.8 |
| Dependency vulnerabilities and malware | **deps-security** (in-process) | bundled, **data lazy** | Reads the lockfile against a local OSV snapshot. Implemented — see §13.7. Never touches the network at check time |
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

### 13.3 `ast-grep`: the pattern-shaped slop rules

**Implemented (M2, fourth engine, second with `granularity: 'file'`).**
`@misaon/slop-gate-engine-astgrep` shells out to a bundled `ast-grep 0.45.0`, running
`scan --rule <file> --json=compact --inspect summary <paths...>` and parsing the JSON array of
matches. Byte offsets come straight off `range.byteOffset`, which is what §10 wants; the per-match
line/column fields are 0-based and ignored.

**It is the one adapter that must not use `resolveScriptBin`, and the reason is a live install
hazard rather than a preference.** That helper always returns `node <script>`, correct for
`bin/oxlint`, `bin/tsc` and `bin/knip.js`, which are all `#!/usr/bin/env node` scripts. The file at
`@ast-grep/cli/ast-grep` is *not one thing*: the published tarball ships a small JS fallback shim
there, and the package's `postinstall` **overwrites that same path in place** with the native binary
hardlinked out of the matching platform package. Whether `node <that path>` works therefore depends
on whether a lifecycle script ran — and under pnpm 10 it does not, because build scripts are blocked
unless the package is listed in `onlyBuiltDependencies` (observed directly on this repository:
`Ignored build scripts: @ast-grep/cli@0.45.0`). A `node` prefix would work here today and break the
moment someone runs `pnpm approve-builds`, or installs with npm. The adapter resolves the platform
package (`@ast-grep/cli-darwin-arm64` and its six siblings) **from `@ast-grep/cli`'s own directory**,
because under pnpm's non-hoisted layout it is that package's dependency and is not reachable from
ours, and spawns the native binary directly. musl Linux falls back to `PATH`: upstream publishes no
musl build, and the `-gnu` optional dependency still installs there because `os`/`cpu` match and libc
is not expressible — present, and unrunnable.

**One rule document per (rule, language), not per rule.** ast-grep's `language:` field takes a single
value and its extension map is not ours: `TypeScript` matches `.ts`/`.mts`/`.cts` and **not** `.tsx`;
`JavaScript` matches `.js`/`.jsx`/`.mjs`/`.cjs`. A missing document produces zero findings and exit 0,
so the gap is silent. Duplicate `id`s across documents are accepted and every finding still reports
the shared id, which is what keeps **one `engineRuleId` per concept** — two entries claiming one
concept would leave arbitration electing one and discarding the other's findings at normalisation.

**`--inspect summary` is this engine's `number_of_rules`, and it guards two silent failures.**
`effectiveRuleCount` (documents actually loaded) is asserted against `EngineConfigHandle.ruleCount`.
`skippedFileCount` catches the worse one: **past roughly 4 MB ast-grep declines a file, reports
nothing and exits 0**, which slop-gate would then write to the cache as a clean result. (The
threshold is a property of the parse tree rather than byte count alone — a 3.7 MB file of statements
parsed, a 4.1 MB one did not, and a 5.2 MB file that was one long comment did.) The counter is 0 for
the benign cases, so the guard does not fire on an ordinary mixed batch. A missing summary is itself
treated as a failure: an adapter whose guard has been disabled by an upstream format change should
say so. Two more behaviours are guarded because they are hard failures rather than empty results —
`ast-grep scan` with no path arguments scans `.`, and `--rule` pointed at an empty document refuses
to start.

**Explicitly named paths bypass ast-grep's own `.gitignore` and hidden-file walking** (verified), which
is the behaviour this pipeline needs: the inventory (§7) is the authority on what gets analysed, and a
second engine-local ignore layer would subtract from it invisibly.

The rules themselves, and what they measured, are §14.

### 13.4 `schema`: configuration files, and the only engine that is not a wrapper

`@misaon/slop-gate-engine-schema` validates YAML configuration files with `ajv` and the `yaml`
package, against a copy of the Compose specification vendored from `compose-spec/compose-go`
(Apache-2.0, ~77 kB, licence carried alongside it). It runs **in process**: no binary, no spawn, no
platform matrix, no network at install time or at run time.

That is a deliberate answer to the distribution problem the rest of this domain has. Every other
config linter worth having here — actionlint, hadolint, zizmor — is Go, Haskell or Rust, has no
official npm distribution, and must be fetched and checksum-verified on first use (D3). A validator
built from a vendored schema has none of those failure modes and, measurably, delivers most of the
value: over 826 YAML files from four unrelated repositories it produced **six findings and zero false
positives**. The full measurement, and the traps found in the `yaml` package while building it, are in
the M0 follow-ups.

Three rules, all `error` and all in `recommended`:

| Rule | Concept | What it catches |
|---|---|---|
| `parse-error` | `correctness.parse-error` | Syntax errors, tabs used as indentation, unresolved aliases |
| `duplicate-mapping-key` | `correctness.no-duplicate-object-key` | A key declared twice; the earlier value is discarded silently |
| `compose-spec` | `config.compose-schema` | A Compose file that does not match the specification |

Two of the three claim the `correctness.*` concepts that already describe them exactly, co-owned with
oxlint per language (§5.3): oxlint owns `correctness.parse-error` for JavaScript and TypeScript, this
engine owns it for YAML, and no file is both. That is what `correctness.parse-error` has promised
since M0 — "any engine capable of parsing the language may report it" — and the first time the
promise has been keepable. Only `config.compose-schema` is this engine's alone, because no other
concept describes a file failing to match a published specification.

Two implementation notes that are not obvious. `parseAllDocuments` is mandatory — `parseDocument`
treats a second YAML document as a parse *error*, which would flag every Kubernetes manifest in
existence. And ajv's `allErrors` output must be collapsed before reporting: a single bad
`depends_on.condition` produces three errors across two paths, of which only the deepest, most
specific one describes what the author actually wrote.

### 13.5 `actionlint`: GitHub Actions, and the first optional engine

`@misaon/slop-gate-engine-actionlint` shells out to actionlint 1.7.12 with
`-shellcheck= -pyflakes= -no-color -config-file <ephemeral> -format '{{json .}}'`. It is the first
adapter to declare `Engine.availability()`, so it is also the first to make availability-gated
ownership something a real run can observe rather than something the stub tests describe.

**Sixteen rules, thirteen in `recommended`, and the split is a measurement.** 403 workflow files from
17 actively-maintained repositories at pinned default-branch HEADs produced **447 findings: 32 true
positives, 406 false positives and 9 correct-but-inert**. That aggregate is not the number anything
was decided on — 308 of the 406 belong to one rule — and the per-rule figures are recorded on each
entry in `registry/entries.manual.ts`. What ships produces **29 findings on those same 403 files, all
29 true positives**: an `${{ matrix.goos }}` in a job with no matrix, a release job whose `if:` reads
an output its dependency never declares and which therefore never runs, an `environment:` named after
an input that was renamed. Eight of the thirteen shipped rules fired zero times across thousands of
opportunities (773 `permissions:` blocks, 971 `env:` blocks, 2,432 job ids, 469 `needs:`) and are in
on that silence plus an authored-defect fixture each.

Three rules are excluded, as data in `registry/exclusions.ts` with the measurement written out:
`runner-label` (308 findings, zero true positives — every one a legitimate self-hosted, commercial or
newer-than-actionlint runner label, and actionlint's own remedy is an engine-native config file §13
forbids), `syntax-check` (7 of 9 false, all of them GitHub features that shipped after the pinned
release), and `action` (below).

**actionlint is not deterministic, and that is a first for this project.** Ten identical runs over
the same 403 files produced 442–447 findings. The variance is confined to one message —
`could not parse action metadata` — and the mechanism is exact: `LocalActionsCache.FindMetadata`
reports a metadata parse failure only on the *uncached* lookup, actionlint lints files concurrently
sharing one cache, **and iterates a workflow's jobs over a Go map**, whose order is randomised. So the
same finding lands on a different line on each run of a *single file in a single process*; per-file
invocation does not help. Excluding the rule handles this instance, and only this instance —
slop-gate has no policy for a non-deterministic engine, and position-based fingerprints (§10.1) would
thrash on every run if one arrived that could not simply be excluded.

**Two concepts actionlint deliberately does not take.** `correctness.parse-error` and
`correctness.no-duplicate-object-key` stay with the `schema` engine for `github-workflow`. The plan
was for the specialist to win them; the corpus reported **zero of either across 403 files**, and the
M0 follow-ups had already recorded the cost — on an unresolved YAML alias actionlint reports
`line: 0, column: 0`, the absence of a position, where the schema engine gives the offending token's
byte range. The adapter drops both message classes rather than mapping them, so `syntax-check` claims
only the schema-violation third of what actionlint reports under that one `kind`.

**"Lazy" means on explicit request, not on first use, and this is a deliberate narrowing of D3.** D3
says an exotic engine downloads on first use; `Engine.availability` says the availability probe may
touch the filesystem and nothing else. Both cannot hold, because availability is *what decides
whether a first use ever happens* — an engine reported absent is never elected and its `run` is never
called. The contract wins. `availability()` is a `PATH` walk and a few `stat` calls over
`SLOP_GATE_ACTIONLINT_PATH`, then `PATH`, then a version-scoped cache; `sgate engines install
actionlint` is the only thing that downloads, and the coverage gap a run reports names that command.
So `sgate check` never reaches the network, an air-gapped image gets a clean coverage gap instead of a
mid-run engine error, and `--require-engines` cannot pass on a machine with no actionlint on it. The
download itself is D3 in full: pinned version, SHA-256 transcribed from upstream's published
`actionlint_<version>_checksums.txt`, hashed in memory and refused before anything is written,
extracted with a small ustar reader and moved into place by `rename`.

**Three smaller things worth not rediscovering.** actionlint's `column` is a 1-based *byte* offset
into the line but its `end_column` is a display-width offset **and** inclusive, so byte ranges are
derived from the source using actionlint's own token rule rather than from `end_column`. Messages
embed absolute paths, which are stripped before they can reach a fingerprint or a cache key. And the
`if: false` remediation actionlint emits — "remove the `if:` section" — would *enable* a job someone
disabled on purpose, so the diagnosis is kept and the instruction replaced.

### 13.6 `biome-css`: stylesheets, and the quietest engine here on purpose

**Implemented (M2, seventh engine).** `@misaon/slop-gate-engine-biome-css` shells out to a bundled
`@biomejs/biome` 2.5.6, running
`lint --config-path=<ephemeral> --max-diagnostics=none --no-errors-on-unmatched --reporter=json --reporter-file=<tmp>`
and parsing the JSON report. Distribution is oxlint's exactly — one npm dependency with eight
platform optional packages, both musl variants included, and `bin/biome` a `#!/usr/bin/env node`
shim, so `resolveScriptBin` applies unchanged and there is no `availability()`, no download and no
platform matrix. It is the only engine here whose upstream tool was already a candidate in §3 and
whose scope this section *narrows*.

**Expect it to find nothing, and read that as working.** Thirteen of its seventeen `recommended`
rules produced zero findings across 1729 hand-authored production stylesheets. Run over that whole
corpus the shipped configuration reports **66 findings in 1729 files** — 31 duplicate properties, 26
stylesheets it could not parse, 5 shorthand overrides, 3 unknown properties, 1 unknown type selector
— of which about 23 are real defects. This is written down because the first person to run `sgate
check` on a CSS codebase and see nothing will otherwise conclude the engine is broken.

**CSS only. Not SCSS, not Less.** Biome 2.5.6 does not lint them badly; it does not open them.
`biome lint x.scss` prints `Checked 0 files` and lists the path as ignored, and upstream's own
language-support table marks SCSS linting 🚫 with parsing and formatting still in progress. The
engine therefore declares `languages: ['css']`, because declaring `scss` would have arbitration elect
it for stylesheets it silently never reads and the run would report clean — the worst outcome
available. That leaves a real hole in the target file set, recorded in the M0 follow-ups: across the
ten corpus repositories alone there are 119 `.scss` and 176 `.less` files this engine cannot see,
and one of them (jellyfin-web) has 111 `.scss` files and no CSS at all.

**The measurement, and what it removed.** 1729 hand-authored `.css` files (220,585 lines) from ten
repositories at pinned default-branch HEADs — vscode, metabase, highlight.js, jupyterlab, zulip,
pdf.js, mediawiki, prism, django's admin, tailwindcss — with build output, minified files, vendored
directories, test fixtures and `.css` compiled from a same-named `.scss` excluded by path. Every
Biome rule enabled: **12,125 lint findings, roughly 23 of them real defects**. Four rules
(`noHexColors`, `noDescendingSpecificity`, `useBaseline`, `noImportantStyles`) are 11,525 of the
findings and none of the defects. They are house style, not defects, and shipping them on by default
would have ended this engine's credibility on first contact; all four keep full registry entries so a
project that wants the convention can enable it by concept. Nine rules have entries but stay out of
`recommended` (`MANUAL_RULE_EXCLUSIONS`), and nine more have no entry at all, each with a written
reason in `packages/engine-biome-css/src/rules.ts` — a test asserts those two lists partition Biome's
35 CSS-capable rules, so none can be dropped silently.

**Two exclusions are written as revisit triggers rather than verdicts, and the distinction is
load-bearing.** `noUnknownAtRules` (26 findings, 0 true positives) and `noUnknownFunction` (3, 0) are
*correct* about plain CSS and are defeated by a preprocessor standing between the file and the
browser: `@extend` is PostCSS, `@tailwind` is Tailwind v3, `alpha()` is `postcss-preset-mantine`.
Their reasons name the condition that puts them back — a §23 framework profile detecting a CSS
preprocessor — because a future reader must be able to tell them apart from `noUnknownUnit`, which is
genuinely wrong about `1x` (a standard resolution unit) in every repository.

**Three silent failures this adapter had to be built around, all verified against the real binary.**

- **The exit code is ambiguous three ways.** `1` means "found findings", "your configuration is
  broken" *and* "no path matched". `--no-errors-on-unmatched` removes the third; the other two are
  not separable, so the adapter never gates on the code. `--reporter-file` puts the report somewhere
  Biome's failure text cannot corrupt it, and the report's *absence* is what signals a failed run.
- **A file over `files.maxSize` (1 MiB) is not linted and barely says so** — a warning whose
  `message` is the empty string at line 0, with `summary.skipped` still 0. The ceiling is raised in
  the config, and `summary.unchanged` is compared against the batch size, because a ceiling can be
  set too low but never proved high enough.
- **`css.parser.tailwindDirectives: true` silently disables `.module.css` detection.** Isolated to
  that single key: with it set and `cssModules` left alone, `:global` becomes an unknown pseudo-class
  and the corpus produced **265 false findings across 36 files**. Both keys are now always set
  together, and the near-miss is the argument for testing config keys in combination rather than one
  at a time.

**No reporter emits byte offsets, and Biome's columns are not UTF-16.** All nine output formats give
line/column only, and the column counts **Unicode codepoints** — measured with three astral
characters ahead of a finding: UTF-16 would be 28, codepoints 25, Biome said 25. The two units agree
on every input without an astral character, so a `LineIndex.offsetAt` call would have been silently
correct in every test anybody thought to write. Core gained `offsetAtCodepointColumn` next to it,
with the discriminating fixture, rather than a flag that would let the units be confused again.

**A `biome-ignore` comment leaves no trace of any kind**, so the adapter does not ask Biome about
them: it scans the bytes it has already read for the byte-offset conversion and reports each one
under `config.foreign-suppression`. Verified — an effective suppression yields `diagnostics: []`,
`errors: 0`, and no counter anywhere. This matters more than it looks because D2 has `init` replace
the repository's own Biome configuration, so a comment orphaned by our own migration would go on
silencing findings slop-gate now owns, invisibly and forever. Same principle as an unavailable
engine: a silent gap must not be representable.

**A stylesheet Biome cannot parse is reported as `config.css-not-analysed`, not as a parse error**,
and its rule findings are discarded. Biome recovers from a syntax error and keeps linting the partial
tree — the 26 unparseable corpus files produced 986 further findings that way — and a finding derived
from a document the parser could not finish reading is not evidence. The concept is deliberately not
`correctness.parse-error`: all 125 parse errors measured came from `.css` files written for a
preprocessor, every one of which compiles and ships, so "this file is broken" would have been wrong
125 times out of 125 where "this file was not analysed" is right every time. Dropping those recovered
findings is also what makes the shipped rules look as good as they do — `noUnknownTypeSelector` goes
from 1 true positive in 4 findings to 1 in 1.

**One claim in this section was wrong and was caught by a fixture.** The first reading of the corpus
classified six `noDuplicateProperties` findings as Biome reporting across a nested `@container`
boundary and called it an upstream defect. An authored fixture refused to reproduce it — Biome
handles CSS nesting correctly — and all six turned out to be parse-recovery artefacts in files that
do not parse. `noInvalidGridAreas` failed the same way in the other direction: zero findings on the
corpus looked like a rare defect, and its fixture showed the rule misses its own documented invalid
example whenever the declaration sits on its own indented line. It is now excluded. A rule that never
fires is worse than no rule, and only an authored fixture can tell "never fires" from "rarely fires".


### 13.7 `deps-security`: dependency vulnerabilities, and the engine whose data is remote

**Implemented (M2, eighth engine, third with `granularity: 'project'`, and the second optional one.)**
`@misaon/slop-gate-engine-deps-security` reads the repository's lockfile and matches it against a
local snapshot of OSV's npm export. It runs in-process, spawns nothing, and **never reaches the
network** — the snapshot is written by an explicit `sgate engines install advisories`.

**`npm audit` was measured and disqualified, and the measurement is the reason this engine exists in
this shape.** On a controlled tree holding 34 real advisories:

| invocation | exit | stderr | reported |
|---|---|---|---|
| `npm audit --json` | 1 | — | 34 advisories, grouped into 3 package entries |
| **`npm audit --offline --json`** | **0** | **0 bytes** | **`"total": 0`** |
| `npm audit --prefer-offline --json` | 1 | — | 34 (falls back to the network) |
| `npm audit` against an unreachable registry | 1 | loud | a JSON error object |
| `pnpm audit --json` | 1 | — | 34 advisories |
| `pnpm audit --offline` | 1 | `Unknown option: 'offline'` | — |

`npm audit --offline` is a silent, total false negative: exit 0, not one byte of stderr, "no
vulnerabilities", on a tree with 34 of them. Wrapping it would mean an air-gapped CI image reports
every repository clean — worse than no check, because the tool implies it looked. It is not a cache
artefact either; the cache was populated by a successful online run immediately before. npm and pnpm
hit the *same* 34 advisories, differing only in reporting unit: npm collapses to one entry per package
carrying the worst severity, so its headline "3 vulnerabilities" is a package count.

**The offline snapshot reproduces the online audit exactly.** OSV's `npm/all.zip` is 213 MB and
224,136 documents (7,033 GHSA, 217,101 MAL); distilled it is 1.9 MB of vulnerability data over 3,483
packages and 41 MB of malicious-package data over 216,778. Six real lockfiles were scanned twice —
once offline against that index, once with `npm audit` against the live registry:

| repository | resolved packages | `npm audit` | offline | divergence |
|---|---|---|---|---|
| strapi 4.0.0 | 1,792 | 91 | 91 | 0 |
| gatsby 4.0.0 | 1,705 | 46 | 46 | 0 |
| Ghost 5.0.0 | 2,739 | 192 | 192 | 0 |
| nest 9.0.0 | 1,830 | 163 | 163 | 0 |
| vue 3.2.0 | 983 | 26 | 26 | 0 |
| axios 1.4.0 | 1,622 | 164 | 164 | 0 |

**10,671 packages, 682 advisories, zero divergence in either direction**, and on the controlled
fixture the severity histogram matched `pnpm audit` exactly. This is the only engine here whose
accuracy is not an estimate. Checking Ghost's tree end to end takes 0.84 s wall clock.

**The malicious feed nearly shipped 242 false positives, and how it was caught is the transferable
part.** The first distiller read only `affected[].ranges` and treated an entry with none as
unbounded. OSV records a compromised release of a *legitimate* package as an explicit version
enumeration instead — `chalk`'s MAL-2025-46969 carries `versions: ["5.6.1"]` and no range at all — so
that reading reported `chalk`, `debug`, `ansi-styles`, `color-name` and `supports-color` as malware
across all six corpora. Flagging the five most-installed packages on npm as malware is not a bug you
recover from. It surfaced only because the corpora were re-scanned rather than the unit tests re-run.
Reading `versions` brings the count to **zero across all six** while keeping version-exact
discrimination on the September 2025 compromise: `chalk@5.6.1` fires and `5.3.0` does not, likewise
`debug@4.4.2` against `4.3.4` and `@ctrl/tinycolor@4.1.1` against `4.1.0`. It matters in the other
direction too — 148 npm GHSA entries are versions-only, and a range-only reader loses every one
silently. `advisory.test.ts` pins both halves.

**Recall needs both feeds.** MAL has no entry for `event-stream@3.3.6` or `ua-parser-js@0.7.29`; GHSA
has both. Neither alone covers the history.

**Four concepts, and the split is deliberate.** `security.vulnerable-dependency` is `warn`, not
`error`: an advisory is a fact about the tree, not a judgement that the vulnerable path is reachable
from anything this repository wrote, and no reachability analysis backs it up — the axios lockfile
alone produces 164 findings, and an accurate check that fails every build on its first run gets
switched off wholesale. The advisory's own severity rides in the message, because
`normalizeDiagnostics` takes severity from the registry and one rule therefore has exactly one level.
`security.malicious-dependency` is `error` on categorical grounds. `deps.missing-lockfile-entry` is
the phantom-dependency check and the only rule here with a real false-positive mode, so it is kept
out of `recommended` (see registry/exclusions.ts). `deps.advisory-coverage-gap` is the engine
reporting what it did *not* cover.

**"Lazy" here means data, not a binary, and the staleness is reported rather than hidden.** There is
no bundled floor of advisories: a snapshot shipped in the package would age with the release cadence,
and npm publishes about 35 new advisories a week and 243 a month, so within a quarter it would be
quietly missing around a thousand — `npm audit --offline` again, only slower. An engine that is
loudly absent is safer than one that is quietly out of date. An installed snapshot past a week old
reports its own age as a `deps.advisory-coverage-gap` finding whose wording escalates through three
bands, because a line that reads identically at ten days and two hundred is a line people stop
reading. Age never makes the engine *unavailable*: that would turn a calendar date into a build
failure with no commit behind it and throw away every finding the snapshot can still make.

**Only npm and pnpm lockfiles are read.** `yarn.lock` and `bun.lockb` are named in
`UNSUPPORTED_LOCKFILES` and reported as a coverage gap rather than passed over, as is a repository
with dependencies and no lockfile at all. A repository whose manifests declare no dependencies gets
silence — a gap that fires when coverage is complete is how a gap line stops being read.

**Three implementation details worth carrying forward.**

- **The archive needs a real ZIP64 reader, and reading local headers would fail silently.** OSV writes
  `npm/all.zip` as a stream, so general-purpose flag bit 3 is set and every local header records
  `compressedSize: 0`, with the true figure in a data descriptor *after* the payload. A reader that
  trusted local headers would decompress nothing, hand back 224,136 empty files without erroring, and
  produce an index that reports every repository clean. `zip.ts` walks the central directory, which
  always carries real sizes; 224k entries also overflow the classic 16-bit entry count, so ZIP64 is
  mandatory rather than optional. Its fixtures are written by Info-ZIP and by Python, never by our own
  writer — a reader tested only against its own encoder proves nothing.
- **A finding points at a manifest line, not at byte zero.** OSV supplies no position, and there is
  still no position-preserving JSON parser here (§13.4 records that as open work), so `manifest.ts`
  does the bounded thing: locate the dependency group, then the quoted name inside its braces, and
  return nothing rather than guess. A transitive dependency borrows the line of whichever direct
  dependency reaches it, found by breadth-first walk of the lockfile graph, and names the chain in the
  message. `peerDependencies` is an edge in that walk — npm 7 installs peers — which on axios 1.4.0 is
  the difference between 1,866 and all 2,056 packages having a line to point at. It is deliberately
  *not* a declaration when read from the root manifest, where it would report every library that
  declares peers it does not carry. Where no path exists the fallback is honest: on Ghost 1,452 of
  3,814 packages have none, and npm marks exactly 1,452 entries `extraneous`.
- **An install that produces no vulnerability data is refused.** A snapshot with an empty index would
  make every repository read as clean and keep doing so on every run until someone reinstalled. An
  archive that yields none is far likelier to mean the layout changed than that npm has no advisories.

---

### 13.8 `hadolint`: Dockerfiles, and the engine whose measurement removed its own premise

**Implemented (M2, ninth engine, second optional one).** `@misaon/slop-gate-engine-hadolint` shells out
to hadolint 2.15.1 with `-f json --no-color -c <ephemeral>`, reusing actionlint's availability-gated
machinery wholesale — `SLOP_GATE_HADOLINT_PATH`, then `PATH`, then a version-scoped cache populated
only by `sgate engines install hadolint`.

**Six rules of roughly seventy, and the ratio is the result.** 275 Dockerfiles from 32
actively-maintained repositories at pinned default-branch HEADs produced **893 findings, and 217 of the
275 files — 79% — produce at least one**. Of the 816 that are hadolint's own, **204 are true positives
and 612 are false: 25% precision.** Thirteen rules account for **552 findings (68%) with zero true
positives** and are excluded as data in `registry/exclusions.ts` with their counts. What ships —
`DL3006`, `DL3007`, `DL3025`, `DL3029`, `DL3042`, `DL4006` — carries 150 of the 204, and three of them
(`DL3007` 18/18, `DL3029` 10/10, `DL3042` 8/8) had no false positives at all.

**The engine was prioritised on a premise the measurement destroyed.** Dockerfiles were ranked highly
because hadolint was expected to catch containers running as root. It cannot: **a Dockerfile with no
`USER` instruction produces zero hadolint findings**, since `DL3002` fires only on an explicit
`USER root`. And the rule that does exist runs backwards — **`DL3066` fired 69 times on `USER nobody`,
`USER node`, `USER appuser`**, complaining about exactly the practice that fixes the problem. The
engine still ships, on the strength of what it measured rather than what it was expected to do, and
the real gap — "this image never drops privileges" — remains uncovered by any engine.

**`DL3064` is excluded although it is a security rule, and because it is one.** 7 of 25: right about
`ENV PGPASSWORD=password`, wrong about `ENV TIKTOKEN_CACHE_DIR` (it substring-matches "TOKEN"). A
security finding wrong three times in four teaches people to dismiss the category.

**Two mechanisms worth not rediscovering.** hadolint's positions are line-level and instruction-scoped:
`column` is **1 in all 893 corpus findings**, there is no end position in its JSON, and a finding is
attributed to the instruction head. That is correct for these six rules, which are instruction-level by
nature, and it is why the adapter drops hadolint's statically linked ShellCheck output — those 77 `SC`
findings have an **empty error tier** and point tens of lines away from the shell they describe. And
`DL3006`/`DL3007` needed **separate concepts**: mapping both onto one made arbitration elect a single
owner and silently suppress `DL3007`, the 18/18 rule — caught end-to-end rather than in review.

**hadolint's distribution is easier than actionlint's, not harder.** Upstream ships raw binaries rather
than archives, so there is no extractor at all and **Windows x86_64 is supported** where actionlint's
`.zip` assets block it; the only gap is Windows arm64. Digests are upstream's own, transcribed from
`checksums.sha256` — a file whose layout changed in v2.15.0 from the per-asset `.sha256` of v2.14.0.
Linux builds are static, produced in an `alpine:3.24` container, so **Alpine is covered** (the M0
follow-ups previously grouped hadolint with zizmor as lacking a musl build; corrected there).

**shellcheck was measured alongside this and deliberately not shipped.** It scored 93% precision on its
`error` tier against 9% overall — the engine's own severity turned out to predict precision better than
per-rule intuition did — but across 43 JS/TS repositories the median has **1 `.sh` file** and 33% have
none, against a median of **57 workflow `run:` steps** and no repository with zero. A `.sh`-scoped
engine would let slop-gate claim shell coverage while missing essentially all the shell its users
write. The deferred design — extraction from workflow `run:` blocks, where the folded scalars that
looked prohibitive turn out to be **0.14% of 4,178 steps** and the real cost is masking the `${{ }}`
expressions in 13.6% of them — is costed in the M0 follow-ups.

## 14. The slop ruleset

Pattern-shaped rules are ast-grep YAML (contributable without writing code, cross-language; §13.3).
AST- and type-dependent rules are oxlint JS plugins, gated behind a capability probe because that API
is alpha.

**Five of the eleven concepts below shipped in M2.** The table records what each one actually is
today rather than what was planned, because three turned out to belong somewhere else and three more
were measured out of the rules that carry them.

| Concept | Status | Detects |
|---|---|---|
| `slop.narrative-comment` | **shipped** (ast-grep) | A comment describing a hypothetical other version of the code: "in a real implementation…", "this is a placeholder", "your code would go here". **Not** "Note that we…" — see below |
| `slop.double-cast` | **shipped** (ast-grep) | `x as unknown as T`, `x as any as T`. New concept; see `slop.as-any-cast` |
| `slop.swallowed-error` | **shipped**, opt-in by concept (ast-grep) | A `catch` with an empty body. **Not** "only logs and continues" — see below |
| `slop.stub-implementation` | **shipped** (ast-grep) | Exported function whose first non-comment statement throws "not implemented". **Not** "returns a placeholder literal" — `return null` is unclassifiable |
| `slop.emoji-in-code` | **shipped**, opt-in by concept (ast-grep) | Emoji in a string or template literal. Identifiers are not checked because JS identifiers cannot contain emoji |
| `slop.as-any-cast` | **owned by oxlint** | `typescript/no-explicit-any` covers `x as any`, `const x: any`, `f(p: any)` and `<any>x` natively at tier 0. ast-grep must not contest it |
| `slop.hallucinated-import` | **owned by knip** | `deps.unresolved-import` (§13.2) already is this concept's static-analysis half |
| `slop.redundant-comment` | **not expressible in ast-grep** | Needs a comment's text compared against the text of the node beneath it. ast-grep relates *nodes* and constrains a node's own text; it cannot test one node's text against another's |
| `slop.defensive-bloat` | blocked | Needs type information — the M2 type-aware work already recorded as blocking |
| `slop.duplicate-utility` | blocked | Cross-file analysis ast-grep does not do |
| `slop.over-abstracted-wrapper` | blocked | Cross-file (single-*caller*) analysis |
| `slop.config-drift` | not started | Bespoke; belongs with the JSON Schema engine, not here |

Every slop rule ships with: a documentation page explaining *why* the pattern is a problem
(`docs/rules/slop.*.md`), a declared `fixKind`, fixture tests covering true **and** false positives,
and a documented escape for the legitimate cases. A slop rule with a high false-positive rate damages
the project more than its absence, so the false-positive fixtures are mandatory, not optional.

**Measured, on two corpora: this repository's 163 JS/TS files (§20 — "the tool's own source has to
survive its own `slop.*` ruleset") and 3,366 third-party JS/TS files (~45 MB) under `node_modules`.**

| Rule | slop-gate | third-party | Verdict | Preset |
|---|---|---|---|---|
| `slop.narrative-comment` | 0 | 2 | Both the same rollup comment, `// Placeholder until proper Symbol.Iterator support` — a self-declared placeholder. **0 false positives over 3,529 files** | `slop` |
| `slop.stub-implementation` | 0 | 0 | 0 false positives; also 0 true positives on real code — published libraries do not ship stubs, which is the point | `slop` |
| `slop.double-cast` | 2 | 65 | Both slop-gate hits genuine (`RegExpExecArray` asserted to a tuple). The 65 are 7 files in 2 packages, 62 in `zod` | `slop` |
| `slop.swallowed-error` | 0 | 433 | ~19 of a 22-item sample deliberate: feature probes, optional reads, best-effort cleanup | **none** |
| `slop.emoji-in-code` | 20 | 127 | **20/20 false positives here** — the pretty reporter's severity glyphs and the tests for wide characters | **none** |

**The false-positive rate is what is measured; recall is not.** No corpus of known AI-generated code
was available, so what these numbers establish is that the rules are quiet on human code. That each
one fires on the pattern it names is established by `packages/engine-astgrep/fixtures`, and nothing
stronger is claimed.

**Three sub-patterns were written, measured and removed, and that list is the more useful record.**
`slop.narrative-comment` shipped without the reader-addressing family §14 originally named by
example — "note that we", "as you can see", "we'll", "here we", "notice that" — because it produced
**76 findings on the third-party corpus and every one was a legitimate explanation**. `for now` (25),
`in (production|reality)` (2), `for testing purposes` (2), `this is a (simplified|example|mock|dummy)`
(2) and `you can (typically|…)` (1) went the same way. `slop.swallowed-error` shipped without the
"only logs and continues" half: 5 findings, every one a CLI printing an error at its top level.
Each rejected phrase survives verbatim in `narrative-comment.negative.ts`, so widening a regex
re-flags it and fails a test.

**Adding a second file-granularity engine exposed a real defect in the orchestrator**, worth stating
here because it is about the escape §14 mandates rather than about ast-grep.
`normalizeDiagnostics` synthesises `config.unused-suppression` once per **(engine, file)** while
seeing only that engine's diagnostics, so an inline suppression naming a `slop.*` concept was both
correctly honoured by ast-grep *and* reported as matching nothing by oxlint's pass over the same
file. Fixed by scoping the unused judgement to an engine that owns one of the directive's targets,
plus a duplicate collapse in `run/check.ts`. One residual case — a *bare* directive with no targets,
where two engines can still disagree — is recorded in the follow-ups.

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
sgate mcp                                  # stdio; `--http` deferred, see §12.1
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

- Lazily downloaded **binaries** are verified against SHA-256 digests pinned in a committed manifest.
  No `curl | sh`. An offline mode fails loudly rather than reaching the network.
- **Lazily downloaded *data* cannot honour that rule literally, and says so rather than pretending
  to.** The advisory snapshot (§13.7) comes from OSV's `npm/all.zip`, which upstream regenerates
  daily and publishes no per-release checksum for; the `ETag` changes with it, so no committed digest
  could ever match. What `sgate engines install advisories` records instead is the SHA-256 of the
  bytes it actually fetched, written into the snapshot manifest and printed on install. **That makes
  a snapshot reproducible between machines and tamper-evident on disk, and proves nothing about the
  publisher** — it is trust-on-fetch, and the distinction is stated in the command's own output so
  nobody reads the digest as a verification it is not. The transport is HTTPS to a single pinned
  origin; a repository that cannot accept that trust model can build a snapshot elsewhere and point
  `SLOP_GATE_ADVISORIES_PATH` at it.
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
  | { kind: 'disable-concept'; concept: ConceptId; reason: string; paths?: readonly string[] }
  | { kind: 'enable-concept'; concept: ConceptId; level: EnabledLevel; reason: string; measured: FrameworkMeasurement; paths?: readonly string[] }
  | { kind: 'engine-setting'; engine: EngineId; key: string; values: readonly string[]; reason: string }
```

Three adjustment kinds across two consumers. All carry a `reason` written for a human, because all end
up in `sgate rules why` (§23.4).

**Consumer 1 — the ruleset.** `disable-concept` and `enable-concept` enter the §6.2 cascade as their
own layer, above the presets and below the user's own `rules`. Above the presets because correcting a
preset that is wrong for *this* repository is the entire point; below the user because **a human who
writes `'suspicious.no-extraneous-class': 'error'` in a NestJS repository means it**. The framework
layer never wins an argument with a person.

**The precedence rule, in one sentence: your config beats every profile; among profiles `off` beats
everything and otherwise the strictest wins.** Nothing else arbitrates, there is no profile ranking,
and no outcome depends on the order profiles ran in.

**A profile may add, but the two directions are not symmetric, and the asymmetry is structural rather
than advisory.** Three properties hold it in place:

1. **`off` absorbs.** A subtraction beats any addition, from any profile, in either order. A profile
   subtracts because a rule is *wrong* about this framework's code, and no second profile asking for
   it louder can make it right. So the worst a wrong addition can do is lose to a subtraction, while
   the worst a wrong subtraction can do is what it always could: cost coverage a user restores in one
   line.
2. **A level is a floor, never a ceiling.** The cascade drops a framework layer's setting that would
   *lower* what an earlier layer already holds (`materialize`). Without this, an author writing
   `'x': 'warn'` to mean "make sure this is on" would silently downgrade a preset holding it at
   `error` — a coverage loss wearing the vocabulary of an addition. `off` is exempt, because that is
   the layer's original and best-warranted power.
3. **An addition must carry a measurement, and the bar scales with the level** (§23.5). The type has
   no shape for an unmeasured addition, and `refuseEnable` is the arithmetic.

`extends` remains the mechanism a *user* adds with, and it is still the right one for a taste: §6.1's
domain packs are opted into by name. What `enable-concept` exists for is the case `extends` cannot
reach — a rule that is right *because of* what the repository already declares, where making the user
name it means the tool knew and did not say.

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

The seven profiles, and what each is for:

| Profile | Detected by | Parameter | Consequence |
|---|---|---|---|
| `nestjs` | `@nestjs/core` (`dependency`) | — | disable `suspicious.no-extraneous-class` |
| `angular` | `@angular/core` (`dependency`) | — | disable `suspicious.no-extraneous-class` (see §23.5 on its narrower warrant) |
| `nestjs-express` | `@nestjs/platform-express` (`dependency`) | — | knip `ignoreDependencies += express` |
| `mikro-orm` | `@mikro-orm/core` (`dependency`) | migrations directory, via `literal` on the ORM config then `path` on the inventory | knip `entry += <dir>/*.ts` in the owning workspace |
| `vitepress` | `vitepress` (`dependency`) + a `.vitepress/` directory (`path`) | the site root that directory sits in | knip `workspaces[ws].vitepress.entry += <root>/.vitepress/config.*` |
| `test-framework` | `jest` and/or `vitest` (`dependency`) | which of the two are present | disable the **shared** concepts of every scope that is not the unique installed one |
| `nextjs` | `next` (`dependency`) + a `next.config.*` beside it (`path`) | the app roots, and the workspaces declaring no `next` | disable all 21 `nextjs` concepts **under the non-Next workspaces' globs only** (§23.6) |

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

### 23.3 Why there are still no conflicts to resolve

The loudest failure mode this whole product exists to prevent is rules that overwrite each other —
§5.3 answers it for arbitration by making double-reporting *structurally impossible* rather than
merely unlikely. **This section used to take the same move one step earlier: rather than resolving
framework conflicts, the adjustment vocabulary made them inexpressible.** `enable-concept` gave that
up, and it is worth being exact about what was given up and what was kept, because the two are easy to
confuse.

**What was given up: inexpressibility.** `disable-concept` and `engine-setting` are set contributions
— a concept removed, or patterns/names added to a list — and neither can express a disagreement. A
level is a scalar. Two profiles *can* now name one concept at two levels, and a union has no meaning
for that.

**What was kept: the algebra.** The merge did not stop being a join, it changed lattice. Where the
union joined over a powerset, `joinLevels` joins over the level chain with `off` as its absorbing
element: **`off` from any profile wins; otherwise the strictest wins.** Commutative, associative and
idempotent exactly as the union was, so the result still does not depend on detection order, profile
order, or how many profiles said the same thing. There is no precedence table, no profile ranking, and
nothing for a reader to memorise — which was always the property that mattered. Inexpressibility was
how it was achieved, not the point of it.

`off` absorbing is not a coin-flip about direction. It is the design's asymmetry made algebraic: a
subtraction says a rule is *wrong* here, and no second profile wanting it louder can make it right.
And the layer that carries the join is emitted per profile with **only** the settings that won, so no
layer ever hands the last-wins cascade a value a later layer must undo. The join decides; the cascade
transports.

The remaining scalar shape is still refused, for the reason it always was: **`{ key: 'entry', value:
'docs' }` does not get built.** Every engine-setting key holds a list, a pattern that matches nothing
costs nothing, and two profiles contributing `docs/.vitepress/config.*` and `site/.vitepress/config.*`
produce a knip config that looks in both places and finds one. A consequence that genuinely needs a
last-writer-wins scalar belongs in a preset or in the engine adapter's own logic. The difference
between that and a rule level is that a level is *ordered* — which is the entire reason one of them
can have a join and the other cannot.

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
- **Additions whose measurement does not clear the level's bar.** The bar for a subtraction is the
  one below: a measured false-positive count. An addition's is higher, because the two fail in
  opposite directions and the costs are not comparable — a wrong subtraction loses one rule's
  coverage, restorable in a line, while a wrong addition produces findings on code that passed
  yesterday because somebody installed a package. `refuseEnable` encodes it, and the type has no
  shape for an unmeasured addition at all:

  | Requirement | Why that number |
  |---|---|
  | at least one piece of detection evidence | `test-framework` applies on *absence*, which §23.2 licenses only because it disables; a rule switched on because a repository failed to mention something is the one detection shape with no safe failure direction |
  | at least one measured finding | zero findings measured nothing, and a profile whose addition never fires should not exist |
  | a majority of findings correct | the `no-conditional-expect` retraction judged 4-wrong-of-8 not enough to take a rule *out*, so it cannot be enough to put one *in* |
  | **at `error`: no false positive at all** | the only derived number here. `resolveExitCode` fails a run on a single `error` with no opt-in anywhere, where a `warn` costs nothing unless the user asked for `--max-warnings` — so `error` is exactly the level at which installing a package can stop a build, and the bar is the one `slop.narrative-comment` and `slop.stub-implementation` cleared before entering `recommended` |

  **Enabling a concept the preset omitted and raising one it already set are deliberately *not*
  separated.** They are one operation on the layer, and a profile author cannot tell which one they
  are performing — it depends on the user's `extends`, which the profile never sees. What the author
  does control is the level, and that is where the real discontinuity is: `error` fails a build and
  `warn` does not. So the two additive operations this section governs are `enable-at-warn` and
  `enable-at-error`, and the warrant keys off the level rather than off a distinction nobody at the
  keyboard can observe.

- **Profiles whose *effect* is unmeasured**, with one explicitly narrower warrant that is worth
  stating precisely, because the distinction is easy to collapse and the rule is easy to hollow out.

  The bar is a measured false-positive count against a real repository. Six of the seven profiles
  clear it. `angular` does not: no Angular codebase was checked. It ships on **mechanism identity
  with an already-measured framework** — `@NgModule({...}) export class AppModule {}` is not similar
  to the NestJS case that was measured 11/11 false, it is the same construct, empty for the same
  reason, and `no-extraneous-class` is wrong about it for the same reason. What transfers is the
  mechanical claim; what does not transfer is a fresh count, and the profile's own comment says so.

  That warrant is available only when the construct is *demonstrably the same one*, and it is not a
  general licence to reason from resemblance. The asymmetry is what makes it acceptable here, and it
  is the same asymmetry behind the addition bar above: shipping `angular` wrongly costs one
  rule's coverage on Angular repositories, restorable in a single config line, while omitting it
  leaves a rule in `recommended` — the *default* — that there is concrete mechanical reason to expect
  fires 100% falsely on every Angular repository that contains an NgModule. A profile that cannot
  point to either a measurement or an identity this specific does not ship.
- **Executing any repository code**, including a framework's own config file. See §23.1.
- **Per-file profiles.** A *level* may now name globs (§23.6), because a level is re-graded per file
  after the run. An *engine setting* still may not: it is workspace-scoped where the engine supports
  it, and that is as fine-grained as it gets, because an engine is configured once.
- **Framework versions.** No profile branches on NestJS 9 versus 11. No measured case needs it, and
  the version is already in the evidence for whoever finds one that does.
- **Choosing engines, or writing a user's config for them.** Those are `extends` and `engines`
  respectively, and both are things a user says out loud. Adding *rules* is no longer on this list —
  see `enable-concept` in §23.2 and its bar above.
- **Borrowing the React rules `eslint-config-next` ships that `recommended` does not.** Vercel's own
  config is `eslint-plugin-react`'s `recommended` plus `eslint-plugin-react-hooks`'s `recommended` plus
  `@next/next`'s, minus four rules it explicitly turns *off*. Subtracting what slop-gate already ships
  leaves five candidates, and **all five were measured and refused** (oxlint 1.76.0, the five
  repositories named in §23.6):

  | Candidate | Vercel's level | Measured | Refused because |
  |---|---|---|---|
  | `react/rules-of-hooks` | `error` | 24 findings, 15 false | all 15 are `await use(fixture)` inside Playwright/Vitest `test.extend` callbacks — `use` is a fixture provider, not React 19's hook |
  | `react/display-name` | `error` | 43 findings, 43 false | every one is `const X = memo(({…}) => …)`, the exact form React's own `memo` documentation uses |
  | `react/no-unescaped-entities` | `error` | 429 findings | 183 of one repository's 203 are apostrophes in English prose, which JSX permits and React's docs use |
  | `react/require-render-return` | `error` | 0 findings | nothing was measured; also `nursery` in oxlint |
  | `import/no-anonymous-default-export` | `warn` | 21 findings, 21 false | every one is a config file (`tailwind.config.*`, `postcss.config.mjs`, `next.config.ts`) or a k6 script whose own tooling requires the anonymous default |

  The three highest-volume rules *not* in Vercel's config were refused on the same criterion and are
  worth naming, because volume is what would otherwise have argued for them: `react-perf/*` (four
  rules, **14,325 findings**) fires on the inline props React's documentation uses throughout;
  `react/only-export-components` (1,333) fires on the `metadata` and `generateStaticParams` exports the
  App Router mandates beside a `page.tsx` component; `react/no-unknown-property` (202) and
  `react/jsx-no-target-blank` (66) are both set to `'off'` by `eslint-config-next` itself.

  **A corpus measures conformance, not correctness.** "Fires a lot on real code" is equally consistent
  with the real code being wrong and with the rule being wrong, and the only thing that separates them
  is whether the framework's own documentation endorses what fired.
- **A `sgate frameworks` command.** Detection surfaces through `rules why`, where the question is
  already being asked. A standalone listing is easy to add later and answers nothing yet.

---

### 23.6 Path-scoped levels

**A level can be path-scoped; options and engine settings cannot.** This is not a policy choice, it
falls out of when each one is consumed. A level is re-graded per file *after* the run — the engine is
configured at the strongest level any scope asks for, and `forFile` narrows each finding against its
own file during normalization. Options decide whether the engine reports the finding at all, and an
engine is configured once for the whole run, so a path-scoped option would have to apply everywhere or
nowhere; §6.2 already says this about a user's own `overrides` (`ignoredOverrideOptions`) and the same
sentence decides it here. So `paths` exists on `disable-concept` and `enable-concept` and is
*unspeakable* on `engine-setting` — a type error rather than a runtime refusal nobody reads. An
engine setting that needs narrowing already carries `workspace`, which is the granularity an engine can
actually honour.

**One path matcher, not two.** A `paths`-carrying adjustment becomes another entry in the very
`overrides` list a user's blocks go into, compiled by the same `picomatch` pass, with its own `source`
label (`framework nextjs (packages/ui/**)`) — so `sgate rules why` prints it as a `path-scoped
framework` step next to the preset that set the base level.

**It is spliced in at the framework position, not appended after the user's overrides.** A user's
`overrides` block exists to beat their own base `rules`, so it comes last. A profile that came last
would beat the user, which is the one thing §23.2's precedence rule forbids. Above the presets, below
`rules`: identical placement to the unscoped framework layer, and both are held to the floor-never-a-
ceiling rule, so confining `warn` to a glob cannot lower an `error` a preset already set there.

**Inclusion globs only, with no negation semantics — verified rather than assumed.** The natural way to
write "everywhere except the application" is `['**', '!apps/web/**']`, and in picomatch 4.0.5's array
form a negated pattern does not subtract from its siblings: that list matches `apps/web/x.tsx`. A
profile that wants a complement therefore enumerates it. `nextjs` does exactly that from
`DetectionContext.manifests`, the list detection already read, and drops any workspace with a nested
one that *does* declare `next` rather than trying to carve a glob around it — files directly in the
parent keep the rules on, which is the safe direction to be wrong in.

**Why `nextjs` needed it.** All 21 rules in oxlint's `nextjs` scope are `correctness`, so `recommended`
already holds every one at `error`; there was nothing for an addition to add, and Vercel's own
`eslint-config-next` is in fact milder (15 of the 21 at `warn`). What the plugin lacked was a scope.
Measured with oxlint 1.76.0 across `shadcn-ui/ui`, `dubinc/dub`, `documenso/documenso`, `unkeyed/unkey`
and `calcom/cal.com`: **389 findings, 67 in workspaces declaring no `next` dependency at all** — 8 of
them in `calcom/cal.com`'s `packages/emails`, where `<img>` is the only thing an email client renders,
and 6 in `apps/api/v2`, a NestJS service with no Next.js bundler for `no-assign-module-variable` to
protect. Every one of the 21 resolves to *import from `next/…` instead*, which a workspace that does
not declare `next` cannot do without trading the finding for an unlisted-dependency one.

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
