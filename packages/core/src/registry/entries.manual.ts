import type { RuleEntry } from './types.ts'

/**
 * knip (`packages/engine-knip`), the third engine and the second with `granularity: 'project'`.
 *
 * **`engineRuleId` is a knip *issue type*, not a rule.** knip has no per-rule catalogue at all — no
 * `--rules` to introspect the way oxlint has, and unlike `tsc` (whose entire domain collapses into one
 * synthetic `type-error`) knip does publish a real, finite selection vocabulary: the seventeen names
 * its own `--include`/`--exclude` accept. Ten of them are surfaced here, one entry each, so a user can
 * disable exactly the category they distrust (`'dead-code.unused-file': 'off'`) without losing the
 * rest. The other seven are excluded as first-class data, each with a written reason, in
 * `packages/engine-knip/src/issue-types.ts` — that file and this list are asserted to partition knip's
 * full vocabulary between them, so no category can be dropped silently.
 *
 * **`tier: 2`** (JavaScript/WebAssembly). knip parses with `oxc-parser`, but tier expresses what the
 * engine *is* and knip's analysis — the module graph, the workspace resolution, the plugin catalogue —
 * is JavaScript. Inert in practice: no other engine contests any of these concepts today.
 *
 * **`requires: []`, `provides: []`.** `workspace-graph` would read as the apt `requires` value, but
 * `requires`/`provides` is a pool populated by engines' own `provides` declarations, and nothing
 * provides `workspace-graph` — declaring it would make every entry here permanently unelectable. And
 * knip *consuming* a workspace graph does not make one available to another engine's rules, which is
 * what `provides` means (see the `tsc` entry below for the same argument at length).
 *
 * **None of these are in `recommended`,** and that is a measurement, not caution. Two independent
 * repositories were checked (a NestJS-shaped fixture reproducing the srvc-bat grounding run, and this
 * repository): `files` was **13/13 false positives** across both, `dependencies` **3/3**. Every entry
 * below records what was actually measured for it. Cost is not the reason — knip runs this repository
 * (153 JS/TS files) in ~0.31s, a genuinely cheap project engine — accuracy is. Opt in by concept, the
 * same way `types.type-error` is opted into today.
 *
 * **`severityDefault` is the deliberate level choice**, since it is what applies when a user enables a
 * concept without naming a level. It is `warn` for everything except `deps.unresolved-import`: the
 * whole group is judgement, reported for review, except the one case where the module genuinely
 * cannot load.
 *
 * `docsUrl` is knip's own issue-type reference for every entry — that page documents the ten in one
 * table and publishes no per-type anchors (checked directly), so a fabricated fragment would be worse
 * than the honest one.
 */
const KNIP_DOCS = 'https://knip.dev/reference/issue-types'

const KNIP_RULE_ENTRIES = [
  {
    engine: 'knip',
    // Measured: 13/13 false positives across two repositories. On the NestJS-shaped fixture, six of
    // six — three MikroORM migrations (discovered by the ORM at runtime, never imported), a
    // `mikro-orm.config.ts` read by path, and two VitePress convention-loaded files. On this
    // repository, seven of seven — six committed e2e fixture sources plus `slop-gate.config.ts`
    // itself. Every one is a file that is loaded, but not *imported*, which is the only kind of
    // reachability a static analyser has. `engine-knip` removes the last of those (it ignores our own
    // config file, which it knows the path of); the rest are the concept's irreducible failure mode,
    // documented on the concept itself.
    engineRuleId: 'files',
    concepts: ['dead-code.unused-file'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Measured: 3/3 false positives. `@mikro-orm/core` and `@mikro-orm/migrations` on the fixture
    // (both imported only from files knip had already — wrongly — decided were unreachable, so this
    // category compounds `files`' errors rather than failing independently), and `oxlint` on this
    // repository, which `packages/engine-oxlint` spawns via `require.resolve` rather than importing.
    // Two different causes, one shared shape: a dependency used in a way no import graph can see.
    engineRuleId: 'dependencies',
    concepts: ['deps.unused-dependency'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // The best-performing category measured: four true positives out of four on the fixture — the
    // `@typescript-eslint/*`, `eslint-config-prettier` and `eslint-plugin-prettier` packages left
    // behind after eslint itself was removed, which is exactly the defect this category exists for.
    // Not promoted to `recommended` on that alone: the one false positive seen (`vitepress`, reported
    // unused in a workspace whose only consumer is a convention-loaded config knip's own plugin failed
    // to locate) shows it inherits reachability's failure mode too, and four findings is not a sample.
    engineRuleId: 'devDependencies',
    concepts: ['deps.unused-dev-dependency'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Measured: 3/3 false positives, all three the *same* logical finding — `express`, reported once
    // per importing file, on a project that gets it transitively through `@nestjs/platform-express`.
    // The duplication is deliberate and kept (see `parseKnipOutput`); the false positive is not
    // fixable here, because "a framework meta-package re-exports this" is exactly the framework
    // awareness the M0 follow-ups record the registry as lacking.
    engineRuleId: 'unlisted',
    concepts: ['deps.unlisted-dependency'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Measured: 1 true positive (`nest`, a script calling a CLI the fixture never declares) and 1
    // false positive (`vitepress`, provided by a workspace devDependency knip could not see for the
    // same plugin-path reason as above). Small sample, both directions represented.
    engineRuleId: 'binaries',
    concepts: ['deps.unlisted-binary'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Zero findings across both repositories, so no accuracy claim is made — but this is the one
    // entry whose `severityDefault` is `error`, and the reason is categorical rather than measured:
    // every other concept in this group asks "is this still needed?", which is a judgement. An import
    // specifier that resolves to nothing is not a judgement — the module cannot load and the code
    // cannot run, which is `correctness`-grade even though it is filed under `deps` for provenance.
    engineRuleId: 'unresolved',
    concepts: ['deps.unresolved-import'],
    tier: 2,
    priority: 50,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // 1 true positive, 0 false positives — the cleanest measured rate here, and also the smallest
    // sample in the set, which is why it is not in `recommended` either. Structurally the most
    // trustworthy of the ten: it is computed *within* files knip already reached, so it only fails
    // when reachability errs in the rarer direction (a file wrongly considered reached), not the
    // common one.
    engineRuleId: 'exports',
    concepts: ['dead-code.unused-export'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Zero findings measured. Kept separate from `exports` rather than folded into it because the
    // right answer differs systematically: an exported type is part of a package's published surface
    // far more often than an exported value is, so a user will plausibly want one on and the other off.
    engineRuleId: 'types',
    concepts: ['dead-code.unused-exported-type'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Zero findings measured on real code; exercised against a purpose-built fixture only
    // (packages/engine-knip/src/parse.test.ts), which is what confirmed knip qualifies the member with
    // its parent enum via the JSON reporter's `namespace` field rather than a bare member name.
    engineRuleId: 'enumMembers',
    concepts: ['dead-code.unused-enum-member'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Zero findings on real code; reproduced deliberately in a fixture (`export function duped` plus
    // `export default duped`), which is what surfaced that `duplicates` is one of only two issue types
    // knip's JSON reporter emits as an array *of arrays* — one inner array per group of names that
    // duplicate each other. Each name in a group becomes its own diagnostic, at its own position.
    engineRuleId: 'duplicates',
    concepts: ['dead-code.duplicate-export'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
] as const satisfies readonly RuleEntry[]

/**
 * Entries the registry generator (packages/core/scripts/generate-registry.ts) cannot produce,
 * because neither one is a real row in `oxlint --rules --format json` — merged with
 * `GENERATED_RULE_ENTRIES` into `RULE_ENTRIES` below. Kept hand-written deliberately; see each
 * entry's own comment for why it exists at all.
 */
export const MANUAL_RULE_ENTRIES = [
  {
    engine: 'oxlint',
    // Synthetic: not a real `--rules`-listed oxlint rule, but the id oxlint's own adapter assigns
    // a parse failure (see packages/engine-oxlint/src/parse.ts) so it can flow through the same
    // ownership/severity/caching pipeline as every other finding. It must never reach oxlint's own
    // `--config` (parsing isn't a rule that can be toggled, and oxlint's config parser hard-rejects
    // an unrecognised rule id) — `materializeOxlintConfig` filters it out before writing rules.
    engineRuleId: 'parse-error',
    concepts: ['correctness.parse-error'],
    tier: 0,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'astro'],
    docsUrl: 'https://oxc.rs/docs/guide/usage/linter.html',
    since: '0.1.0',
  },
  // Deliberately kept from M0: the registry's only `eslint`-engine entry, and the only entry whose
  // engine is not `oxlint` at all. It exists so `entries.test.ts` ("the shipped registry contains a
  // real overlap and resolves it to oxlint") can prove tier-based arbitration on a genuine overlap —
  // both this and the generated `oxlint/no-unused-vars` claim `dead-code.unused-variable` — without
  // depending on a second engine actually being implemented yet. A real `sgate check` never
  // instantiates the `eslint` engine (packages/cli/src/commands/check.ts registers only oxlint), so
  // `electOwners`'s `participatingEngines` filter keeps this from ever contesting a real run
  // (see `elect.ts`'s comment on that field) — it only contests arbitration in a test that names
  // `eslint` as participating on purpose.
  {
    engine: 'eslint',
    engineRuleId: '@typescript-eslint/no-unused-vars',
    concepts: ['dead-code.unused-variable'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'suggested',
    fixTouches: ['imports', 'statements'],
    requires: [],
    languages: ['ts', 'tsx'],
    docsUrl: 'https://typescript-eslint.io/rules/no-unused-vars/',
    since: '0.1.0',
  },
  // `tsc` (packages/engine-tsc): the second engine, and the first with `granularity: 'project'`
  // (spec §8.1) rather than `'file'`. Like `oxlint/parse-error` above, this is synthetic — not a row
  // any `--rules`-style catalogue lists, because `tsc` has no such catalogue at all: it reports a few
  // hundred numbered diagnostic codes (TS2307, TS2322, ...) as free text, not a queryable, individually
  // electable rule set. One concept for the whole domain (see `types.type-error` in
  // concepts/catalogue.ts for the full defence) is what makes `'types.type-error': 'off'` able to
  // disable typechecking wholesale without inventing group-wildcard config syntax nothing else needs.
  //
  // `tier: 1` ("native with type information"): `tsc` is the authoritative source of TypeScript's own
  // type information, the same tier tsgolint's type-aware rules occupy — not `0`, which the registry
  // reserves for oxc/Rust-native syntax-only rules, and not `2` (JS/WASM engines), even though today's
  // resolved `tsc` happens to be JS-implemented pre-TS-7 (see the ecosystem table, §3): tier expresses
  // what the engine *is*, not which binary a given repository's `typescript` version happens to ship.
  // Inert in practice either way — no other engine will ever contest `types.type-error`.
  //
  // `provides: []`, deliberately, not `['types']`: `provides`/`requires` (registry/types.ts) is a
  // *global* capability pool arbitration checks before electing any rule that declares
  // `requires: ['types']` — e.g. a future tsgolint-owned `types.floating-promise` entry. `tsc` shelling
  // out and parsing text does not make TypeScript's resolved type graph available to *other* engines'
  // rules; tsgolint gets its own type information from its own separate wiring (see the M0 follow-ups'
  // "Blocks M2" entry on the type-aware capability probe that still needs to land there). Declaring
  // `provides: ['types']` here would let arbitration elect a type-aware rule the moment `tsc` is merely
  // *registered*, regardless of whether that rule's own engine can actually run it yet — reintroducing
  // the exact `EngineError: the materialised config is not selecting exactly the elected ruleset`
  // failure mode the same follow-up entry describes, just triggered by this change instead.
  {
    engine: 'tsc',
    engineRuleId: 'type-error',
    concepts: ['types.type-error'],
    tier: 1,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx'],
    docsUrl: 'https://www.typescriptlang.org/docs/',
    since: '0.1.0',
  },
  ...KNIP_RULE_ENTRIES,
] as const satisfies readonly RuleEntry[]
