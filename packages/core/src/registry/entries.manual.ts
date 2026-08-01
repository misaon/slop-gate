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
] as const satisfies readonly RuleEntry[]
