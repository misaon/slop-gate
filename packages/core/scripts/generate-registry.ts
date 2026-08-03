#!/usr/bin/env node
/**
 * Regenerates the two files the design plan's Task 1 asks for:
 *
 *   - packages/core/src/registry/entries.generated.ts   (a `RuleEntry` per oxlint rule)
 *   - packages/core/src/concepts/concepts.generated.ts  (a `ConceptDefinition` for every mechanically
 *                                                         named concept the entries above invent)
 *
 * Source of truth is the *live* installed oxlint binary's `oxlint --rules --format json` — not a
 * committed snapshot (see docs/superpowers/plans/2026-07-31-registry-generation.md, "Working
 * notes"). Re-run this whenever oxlint is upgraded; CI's freshness check
 * (`pnpm --filter @misaon/slop-gate-core generate:registry:check`) fails the build if the live
 * catalogue would produce a different file than what is committed.
 *
 * Usage:
 *   node scripts/generate-registry.ts          # regenerate and write
 *   node scripts/generate-registry.ts --check  # regenerate in memory, diff against disk, exit 1 on drift
 *
 * Design decisions this script encodes (see the plan for the full reasoning):
 *
 *   1. Every rule oxlint reports gets an entry, unconditionally — registry breadth is availability,
 *      not endorsement. `packages/core/src/config/presets.ts` decides what's actually recommended.
 *   2. Concepts are mechanical (`<oxlint category>.<kebab value>`) by default, and overridden where
 *      a human has already decided a rule shares a concept with something else, or deserves a
 *      better name (`registry/overrides.ts`). Two rules that would otherwise mechanically collide
 *      on the same id (e.g. `eslint/no-dupe-keys` and `vue/no-dupe-keys`, both `correctness`) are
 *      disambiguated by scope instead of silently shadowing one another — see `disambiguate` below.
 *   3. Some rules are excluded from `recommended` with a stated reason (`registry/not-recommended.ts`)
 *      but still get a full entry.
 *   4. Type-aware rules (`type_aware: true`) get `tier: 1` and `requires: ['types']`. Nothing in
 *      slop-gate today provides the `types` capability, so arbitration can never elect one — see
 *      docs/superpowers/specs/2026-07-31-m0-followups.md, "Blocks M2".
 *   5. This output is committed, reviewable, and diffable — not regenerated silently at runtime.
 *   6. `severityDefault` follows the rule's own authors where they are milder than the category
 *      mapping (`registry/upstream-severity.ts`) — `error` fails a build with no opt-in, so being
 *      stricter than the people who wrote the rule needs its own reason.
 *
 * Resolving the oxlint binary itself (`resolveOxlintBinary`, below) is imported from
 * `@misaon/slop-gate-engine-oxlint` rather than duplicated here — the adapter owns oxlint-specific
 * packaging knowledge (see its doc comment for the Windows-specific reasoning). That makes this
 * package.json's dependency graph read oddly at first: `@misaon/slop-gate-engine-oxlint` is declared
 * as a devDependency of the *workspace root* (../../package.json), not of `@misaon/slop-gate-core`
 * itself. That is deliberate, not an oversight — `engine-oxlint` already depends on `core`, so adding
 * the reverse edge here too (even as a devDependency) creates a cycle Turborepo's `build` task cannot
 * schedule (`core#build -> engine-oxlint#build -> core#build`; confirmed with `turbo run build` before
 * settling on this arrangement, real exit code 1, not just the graph's `--dry` warning). Node's own
 * module resolution still finds `@misaon/slop-gate-engine-oxlint` from here by walking up to the
 * workspace root's `node_modules` — the same mechanism already relied on for `typescript`/`tsdown`,
 * which are likewise only declared as root devDependencies, never per-package ones. Consequence: this
 * script requires `@misaon/slop-gate-engine-oxlint` to have been *built* first (its `package.json`
 * `exports` resolve to `dist/`, not `src/`) — see `generate:registry` / `generate:registry:check` in
 * this package's package.json and the CI workflow, which now build before running either.
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolveOxlintBinary } from '@misaon/slop-gate-engine-oxlint'
import type { ConceptDefinition, ConceptGroup, ConceptId } from '../src/concepts/catalogue.ts'
import { CURATED_CONCEPTS, HAND_WRITTEN_CONCEPTS } from '../src/concepts/catalogue.ts'
import { compareStrings } from '../src/ordering.ts'
import { NOT_RECOMMENDED_GENERATED } from '../src/registry/not-recommended.ts'
import { RULE_OVERRIDES } from '../src/registry/overrides.ts'
import type { FixDomain, RuleEntry } from '../src/registry/types.ts'
import { capToUpstream } from '../src/registry/upstream-severity.ts'
import type { LanguageId } from '../src/languages.ts'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ENTRIES_OUT = join(SCRIPT_DIR, '../src/registry/entries.generated.ts')
const CONCEPTS_OUT = join(SCRIPT_DIR, '../src/concepts/concepts.generated.ts')

/** Bumped once, for everything this generator produces — see `RuleEntry.since`. */
const GENERATED_SINCE = '0.2.0'

/**
 * `priority` is a reserved fix-conflict tiebreaker the arbitrator does not consult yet (see
 * `RuleEntry.priority` and `registry/elect.ts`'s `compare`, which never reads it) — a fixed value
 * for every generated entry is honest about that; it is not standing in for real per-rule judgement
 * the way the hand-written registry's 100/90/85/80 tiers looked like they might.
 */
const GENERATED_PRIORITY = 50

type OxlintCategory = 'correctness' | 'style' | 'pedantic' | 'restriction' | 'suspicious' | 'perf' | 'nursery'

type CatalogueRule = {
  readonly scope: string
  readonly value: string
  readonly category: OxlintCategory
  readonly type_aware: boolean
  readonly fix: string
  readonly default: boolean
  readonly docs_url: string
}

function readCatalogue(): readonly CatalogueRule[] {
  const invocation = resolveOxlintBinary()
  if (invocation === undefined) {
    throw new Error(
      "the bundled `oxlint` could not be resolved, so there is no catalogue to generate from. Run `pnpm install`. " +
        '(It deliberately does not fall back to an `oxlint` on PATH — the committed registry would then ' +
        'describe whichever version that machine happens to have.)',
    )
  }
  const stdout = execFileSync(invocation.command, [...invocation.prefixArgs, '--rules', '--format', 'json'], {
    encoding: 'utf8',
  })
  const rules = JSON.parse(stdout) as CatalogueRule[]
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error(`expected a non-empty array from 'oxlint --rules --format json', got: ${stdout.slice(0, 200)}`)
  }
  return rules
}

/**
 * oxlint's own `--rules` catalogue and its config format (`materializeOxlintConfig`) spell these two
 * scopes with underscores, but the `code` field of a *real diagnostic* hyphenates them —
 * `"jsx-a11y(alt-text)"`, not `"jsx_a11y(alt-text)"` — confirmed directly against oxlint 1.76.0
 * (see the registry-generation report). `packages/engine-oxlint/src/parse.ts`'s `toEngineRuleId`
 * parses that `code` field verbatim and does not renormalize it, so a `RuleEntry.engineRuleId` for
 * either scope must already be spelled the way `toEngineRuleId` will produce it, or every finding
 * these ~40 rules produce is silently unattributable (`normalizeDiagnostics` looks entries up by
 * exact `engineRuleId` string and drops anything it can't find — no error, no warning, just a
 * finding that never surfaces). Verified separately that oxlint's config accepts *either* spelling
 * for `plugins`/`rules` keys, so fixing this on the generator side (rather than patching the parser)
 * touches no already-tested code in `packages/engine-oxlint`.
 */
const HYPHENATED_SCOPE: Readonly<Record<string, string>> = {
  jsx_a11y: 'jsx-a11y',
  react_perf: 'react-perf',
}

function configScope(scope: string): string {
  return HYPHENATED_SCOPE[scope] ?? scope
}

/** oxlint's core rules are configured bare; every other scope is configured as `plugin/rule`. */
function engineRuleIdOf(rule: CatalogueRule): string {
  return rule.scope === 'eslint' ? rule.value : `${configScope(rule.scope)}/${rule.value}`
}

const JSX_SCOPES = new Set(['react', 'jsx_a11y', 'react_perf', 'nextjs'])

/**
 * The plan's mapping table says the "otherwise" bucket is "all script languages" — literally just
 * `SCRIPT_LANGUAGES` (ts/tsx/js/jsx) — but that is narrower than what oxlint itself, and every
 * already-shipped bare-`eslint`-scope entry in the hand-written registry, actually claim:
 * `createOxlintEngine()` (packages/engine-oxlint/src/index.ts) declares
 * `[...SCRIPT_LANGUAGES, 'vue', 'svelte', 'astro']`, and every one of today's 46 hand-written oxlint
 * entries lists all seven. Following the plan literally here would silently stop checking `.vue`,
 * `.svelte` and `.astro` files' `<script>` blocks for every generic rule (no-debugger included) the
 * moment this generated file replaced the hand-written one — a real regression, not a neutral
 * rewording. This constant is that corrected "otherwise" bucket; see the registry-generation report.
 */
const GENERIC_LANGUAGES: readonly LanguageId[] = ['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'astro']

function languagesFor(scope: string): readonly LanguageId[] {
  if (JSX_SCOPES.has(scope)) return ['jsx', 'tsx']
  if (scope === 'vue') return ['vue']
  if (scope === 'typescript') return ['ts', 'tsx', 'vue', 'svelte', 'astro']
  return GENERIC_LANGUAGES
}

/** Covers all 13 `fix` values the live catalogue reports — verified exhaustively, see the report. */
function fixKindOf(fix: string): RuleEntry['fixKind'] {
  if (fix === 'none' || fix === 'pending') return 'none'
  if (fix.includes('dangerous')) return 'unsafe'
  if (fix.includes('suggestion')) return 'suggested'
  return 'safe'
}

/**
 * Not derivable from the catalogue at all (no field describes *what kind* of edit a fix makes) —
 * the plan calls this out as the field most likely to not survive contact with reality, and it
 * didn't. `fixTouches` has no consumer yet (grep confirms: only `entries.test.ts`'s "non-empty iff
 * fixable" invariant and this generator read it), so the cost of guessing wrong today is zero and
 * the cost of a future fix-conflict arbiter under-detecting a real conflict is not — but claiming
 * every one of `FixDomain`'s five values for every fixable rule would say something false often
 * enough (an `import/*` rule's fix does not plausibly touch `jsx`) to be worse than a single
 * modest, mostly-true claim. `'statements'` is that claim: it is the domain the hand-written
 * registry already reached for whenever a fix's specifics weren't worth tracking precisely
 * (`no-debugger`, `no-var`), and it is true of nearly every oxlint autofix in practice. Revisit
 * this once M3's fix arbiter defines what it actually needs from the field.
 */
function fixTouchesFor(fixKind: RuleEntry['fixKind']): readonly FixDomain[] {
  return fixKind === 'none' ? [] : ['statements']
}

function kebabToWords(value: string): string {
  return value
    .split('-')
    .map((word) => (word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ')
}

/** `<category>.<value>`, before collision disambiguation — see `disambiguate`. */
function naiveConceptId(rule: CatalogueRule): string {
  return `${rule.category}.${rule.value}`
}

/**
 * Grouping rules by their naive mechanical id surfaces every case where two *different* rules
 * would otherwise silently collide on one concept — 55 such pairs in the live catalogue today, the
 * overwhelming majority `jest`/`vitest` pairs that mirror each other rule-for-rule (vitest's plugin
 * is a near-literal port of eslint-plugin-jest). Left alone, arbitration's alphabetical tiebreak
 * would deterministically prefer the `jest` half of every pair over the `vitest` half regardless of
 * which test framework the target repository actually uses — on a vitest-only project (this one
 * included), the `vitest` rule would never be elected at all. Disambiguating by scope keeps both
 * sides independently electable; a human can still unify a specific pair later via
 * `registry/overrides.ts` once someone has actually checked they detect the same thing.
 */
function disambiguate(rules: readonly CatalogueRule[]): ReadonlyMap<CatalogueRule, string> {
  const byNaiveId = new Map<string, CatalogueRule[]>()
  for (const rule of rules) {
    const id = naiveConceptId(rule)
    const group = byNaiveId.get(id)
    if (group === undefined) byNaiveId.set(id, [rule])
    else group.push(rule)
  }

  const idOf = new Map<CatalogueRule, string>()
  for (const rule of rules) {
    const group = byNaiveId.get(naiveConceptId(rule))!
    idOf.set(rule, group.length > 1 ? `${rule.category}.${configScope(rule.scope)}-${rule.value}` : naiveConceptId(rule))
  }
  return idOf
}

type GeneratedEntry = {
  readonly rule: CatalogueRule
  readonly engineRuleId: string
  readonly entry: RuleEntry
  /** Whether this entry's rule is eligible for `presets.ts`'s `recommended` policy. */
  readonly recommendedEligible: boolean
}

function buildEntries(catalogue: readonly CatalogueRule[]): readonly GeneratedEntry[] {
  const mechanicalId = disambiguate(catalogue)
  const RECOMMENDED_CATEGORIES = new Set<OxlintCategory>(['correctness', 'suspicious'])

  return catalogue.map((rule) => {
    const engineRuleId = engineRuleIdOf(rule)
    const override = RULE_OVERRIDES[engineRuleId]
    const concepts = override?.concepts ?? [mechanicalId.get(rule)! as ConceptId]
    // The category mapping is a floor on nothing and a ceiling on nothing — it just says `correctness`
    // is serious. Where the rule's own authors publish a milder level, theirs wins (see
    // `registry/upstream-severity.ts`); an explicit override still beats both, because that is where a
    // measurement lives.
    const severityDefault =
      override?.severityDefault ?? capToUpstream(rule.category === 'correctness' ? 'error' : 'warn', engineRuleId)
    const fixKind = fixKindOf(rule.fix)
    const excluded = NOT_RECOMMENDED_GENERATED[engineRuleId] !== undefined

    const entry: RuleEntry = {
      engine: 'oxlint',
      engineRuleId,
      concepts,
      ...(override?.classify === undefined ? {} : { classify: override.classify }),
      tier: rule.type_aware ? 1 : 0,
      priority: GENERATED_PRIORITY,
      severityDefault,
      fixKind,
      fixTouches: fixTouchesFor(fixKind),
      requires: rule.type_aware ? ['types'] : [],
      languages: languagesFor(rule.scope),
      docsUrl: rule.docs_url,
      since: GENERATED_SINCE,
    }

    return {
      rule,
      engineRuleId,
      entry,
      recommendedEligible: RECOMMENDED_CATEGORIES.has(rule.category) && !rule.type_aware && !excluded,
    }
  })
}

function buildGeneratedConcepts(generated: readonly GeneratedEntry[]): readonly ConceptDefinition[] {
  // Deliberately the two human-maintained halves of the vocabulary, not the merged `CONCEPTS`
  // export: the merged export already includes whatever `GENERATED_CONCEPTS` a *previous* run
  // produced, so checking against it would make every concept this generator has ever produced look
  // "already known" on every subsequent run, and `concepts.generated.ts` would regenerate empty. See
  // the comment on `HAND_WRITTEN_CONCEPTS` in catalogue.ts.
  //
  // `CURATED_CONCEPTS` (concepts/curated.ts) is here because that is the whole mechanism by which a
  // rationale replaces the boilerplate description below: the concept keeps its mechanical id, but
  // once a human has written prose for it, it is no longer this script's to describe. Dropping it
  // from this set would silently re-emit the generated description alongside the curated one and
  // duplicate the id in `CONCEPTS`.
  const known = new Set([...HAND_WRITTEN_CONCEPTS, ...CURATED_CONCEPTS].map((c) => c.id as string))
  const byId = new Map<string, ConceptDefinition>()

  for (const { rule, engineRuleId, entry } of generated) {
    // Only the mechanical path can introduce a concept nobody has defined yet — an override's
    // `concepts` field is typed as `readonly ConceptId[]`, a union derived from the hand-written
    // `CONCEPTS` array, so it can only ever name a concept that already exists (a bad id there is a
    // compile error in `overrides.ts`, not a runtime gap here). A mechanically-generated entry
    // always has exactly one concept (only an override can populate `classify`/multiple concepts).
    if (RULE_OVERRIDES[engineRuleId]?.concepts !== undefined) continue

    const conceptId = entry.concepts[0]
    if (known.has(conceptId) || byId.has(conceptId)) continue

    byId.set(conceptId, {
      id: conceptId,
      group: rule.category as ConceptGroup,
      title: engineRuleId,
      description:
        `Generated from oxlint's \`${rule.scope}/${rule.value}\` rule ` +
        `(category: ${rule.category}). ${kebabToWords(rule.value)}.`,
    })
  }

  return [...byId.values()].sort((a, b) => compareStrings(a.id, b.id))
}

function buildGeneratedRecommended(generated: readonly GeneratedEntry[]): Readonly<Record<string, 'error' | 'warn'>> {
  const out: Record<string, 'error' | 'warn'> = {}
  for (const { entry, recommendedEligible } of generated) {
    if (!recommendedEligible) continue
    for (const concept of entry.concepts) out[concept] = entry.severityDefault as 'error' | 'warn'
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => compareStrings(a, b)))
}

function quote(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

function formatStringArray(values: readonly string[]): string {
  return `[${values.map(quote).join(', ')}]`
}

function formatRuleEntry(entry: RuleEntry): string {
  const lines: string[] = []
  lines.push('  {')
  lines.push(`    engine: ${quote(entry.engine)},`)
  lines.push(`    engineRuleId: ${quote(entry.engineRuleId)},`)
  lines.push(`    concepts: ${formatStringArray(entry.concepts)},`)
  if (entry.classify !== undefined) {
    const rules = entry.classify
      .map((rule) => `{ messagePattern: ${quote(rule.messagePattern)}, concept: ${quote(rule.concept)} }`)
      .join(', ')
    lines.push(`    classify: [${rules}],`)
  }
  lines.push(`    tier: ${entry.tier},`)
  lines.push(`    priority: ${entry.priority},`)
  lines.push(`    severityDefault: ${quote(entry.severityDefault)},`)
  lines.push(`    fixKind: ${quote(entry.fixKind)},`)
  lines.push(`    fixTouches: ${formatStringArray(entry.fixTouches)},`)
  lines.push(`    requires: ${formatStringArray(entry.requires)},`)
  lines.push(`    languages: ${formatStringArray(entry.languages)},`)
  lines.push(`    docsUrl: ${quote(entry.docsUrl)},`)
  lines.push(`    since: ${quote(entry.since)},`)
  lines.push('  },')
  return lines.join('\n')
}

function formatConcept(concept: ConceptDefinition): string {
  return [
    '  {',
    `    id: ${quote(concept.id)},`,
    `    group: ${quote(concept.group)},`,
    `    title: ${quote(concept.title)},`,
    `    description: ${quote(concept.description)},`,
    '  },',
  ].join('\n')
}

const GENERATED_FILE_NOTICE = (script: string): string =>
  [
    `// GENERATED FILE — do not edit by hand.`,
    `// Produced by ${script} from the live oxlint rule catalogue (\`oxlint --rules --format json\`).`,
    `// Regenerate: pnpm --filter @misaon/slop-gate-core generate:registry`,
    `// CI fails if this file would differ from a fresh regeneration (generate:registry:check).`,
  ].join('\n')

function renderEntriesFile(generated: readonly GeneratedEntry[]): string {
  const sorted = [...generated].sort((a, b) => compareStrings(a.engineRuleId, b.engineRuleId))
  const recommended = buildGeneratedRecommended(generated)

  const body = sorted.map((g) => formatRuleEntry(g.entry)).join('\n')
  const recommendedBody = Object.entries(recommended)
    .map(([concept, level]) => `  ${quote(concept)}: ${quote(level)},`)
    .join('\n')

  return `${GENERATED_FILE_NOTICE('scripts/generate-registry.ts')}
import type { ConceptId } from '../concepts/catalogue.ts'
import type { RuleEntry } from './types.ts'

/** One entry per rule in \`oxlint --rules --format json\` (${sorted.length} today) — see the registry-generation report for the field mapping. */
export const GENERATED_RULE_ENTRIES: readonly RuleEntry[] = [
${body}
]

/**
 * \`concept -> level\` for every generated entry whose source rule is \`correctness\` or \`suspicious\`
 * category, not type-aware, and not in \`registry/not-recommended.ts\` — the policy
 * \`packages/core/src/config/presets.ts\` reads to build \`recommended\`. Committed and diffable like
 * everything else this script produces, per decision 5: a rule that starts, stops, or changes
 * category on an oxlint upgrade is a reviewable diff here, not a silent behaviour change.
 *
 * Typed against \`ConceptId\`, not a plain string index, so a key here that is not a real concept —
 * impossible today since every key comes straight off a generated entry's own \`concepts\`, but not
 * impossible for a hand-edit — is a compile error instead of a preset that silently enables nothing.
 */
export const GENERATED_RECOMMENDED_RULES: Readonly<Partial<Record<ConceptId, 'error' | 'warn'>>> = {
${recommendedBody}
}
`
}

function renderConceptsFile(concepts: readonly ConceptDefinition[]): string {
  const body = concepts.map(formatConcept).join('\n')
  return `${GENERATED_FILE_NOTICE('scripts/generate-registry.ts')}
import type { ConceptDefinition } from './catalogue.ts'

/**
 * One entry per mechanically-named concept a generated rule entry invents — i.e. every concept
 * \`registry/overrides.ts\` did not already redirect onto an existing hand-written concept.
 * \`title\`/\`description\` are plain factual passthroughs of the source rule (scope, value,
 * category), not curated prose: nobody has read all ${concepts.length} of these, and pretending
 * otherwise would be worse than an honest "this is generated" label.
 *
 * \`as const satisfies\`, not a plain \`readonly ConceptDefinition[]\` annotation, deliberately — see
 * \`entries.ts\`'s comment on \`RULE_ENTRIES\` for the general reason, and note the sharper one here:
 * \`catalogue.ts\`'s \`ConceptId\` is \`(typeof CONCEPTS)[number]['id']\`, a closed union of every
 * concept's *literal* id string. A plain type annotation would widen every id below to \`string\`
 * before it ever reached \`CONCEPTS\`, collapsing \`ConceptId\` itself to \`string\` and silently
 * erasing concept-id type-checking everywhere it is used — \`registry/overrides.ts\`'s \`concepts?:
 * readonly ConceptId[]\` included, which is the one place a typo here is supposed to be a compile
 * error rather than a rule that silently never joins the concept it was meant to.
 */
export const GENERATED_CONCEPTS = [
${body}
] as const satisfies readonly ConceptDefinition[]
`
}

function main(): void {
  const checkOnly = process.argv.includes('--check')

  const catalogue = [...readCatalogue()].sort((a, b) => compareStrings(`${a.scope}/${a.value}`, `${b.scope}/${b.value}`))
  const generated = buildEntries(catalogue)
  const generatedConcepts = buildGeneratedConcepts(generated)

  const entriesSource = renderEntriesFile(generated)
  const conceptsSource = renderConceptsFile(generatedConcepts)

  if (checkOnly) {
    const drift: string[] = []
    for (const [path, fresh] of [
      [ENTRIES_OUT, entriesSource],
      [CONCEPTS_OUT, conceptsSource],
    ] as const) {
      const onDisk = safeRead(path)
      if (onDisk !== fresh) drift.push(path)
    }
    if (drift.length > 0) {
      process.stderr.write(
        `Registry is stale — regenerating from the live oxlint catalogue produced a different file ` +
          `than what is committed:\n${drift.map((p) => `  ${p}`).join('\n')}\n` +
          `Run: pnpm --filter @misaon/slop-gate-core generate:registry\n`,
      )
      process.exitCode = 1
      return
    }
    process.stdout.write('Registry is up to date with the live oxlint catalogue.\n')
    return
  }

  writeFileSync(ENTRIES_OUT, entriesSource, 'utf8')
  writeFileSync(CONCEPTS_OUT, conceptsSource, 'utf8')
  process.stdout.write(
    `Wrote ${generated.length} rule entries (${ENTRIES_OUT}) and ${generatedConcepts.length} generated concepts (${CONCEPTS_OUT}).\n`,
  )
}

function safeRead(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

main()
