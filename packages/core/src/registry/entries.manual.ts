import type { RuleEntry } from './types.ts'

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
] as const satisfies readonly RuleEntry[]
