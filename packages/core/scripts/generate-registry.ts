#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolveOxlintBinary, resolveOxlintSchemaPath } from '@misaon/slop-gate-engine-oxlint'
import type { ConceptDefinition, ConceptId } from '../src/concepts/catalogue.ts'
import { CURATED_CONCEPTS, HAND_WRITTEN_CONCEPTS } from '../src/concepts/catalogue.ts'
import { compareStrings } from '../src/ordering.ts'
import { NOT_RECOMMENDED_GENERATED } from '../src/registry/not-recommended.ts'
import { RULE_OVERRIDES } from '../src/registry/overrides.ts'
import type { FixDomain, RuleEntry } from '../src/registry/types.ts'
import { capToUpstream } from '../src/registry/upstream-severity.ts'
import type { LanguageId } from '../src/languages.ts'

const SCRIPT_DIR = import.meta.dirname
const ENTRIES_OUT = join(SCRIPT_DIR, '../src/registry/entries.generated.ts')
const CONCEPTS_OUT = join(SCRIPT_DIR, '../src/concepts/concepts.generated.ts')

const GENERATED_SINCE = '0.2.0'

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

const HYPHENATED_SCOPE: Readonly<Record<string, string>> = {
  jsx_a11y: 'jsx-a11y',
  react_perf: 'react-perf',
}

function configScope(scope: string): string {
  return HYPHENATED_SCOPE[scope] ?? scope
}

function engineRuleIdOf(rule: CatalogueRule): string {
  return rule.scope === 'eslint' ? rule.value : `${configScope(rule.scope)}/${rule.value}`
}

const JSX_SCOPES = new Set(['react', 'jsx_a11y', 'react_perf', 'nextjs'])

const GENERIC_LANGUAGES: readonly LanguageId[] = ['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'astro']

function languagesFor(scope: string): readonly LanguageId[] {
  if (JSX_SCOPES.has(scope)) return ['jsx', 'tsx']
  if (scope === 'vue') return ['vue']
  if (scope === 'typescript') return ['ts', 'tsx', 'vue', 'svelte', 'astro']
  return GENERIC_LANGUAGES
}

function fixKindOf(fix: string): RuleEntry['fixKind'] {
  if (fix === 'none' || fix === 'pending') return 'none'
  if (fix.includes('dangerous')) return 'unsafe'
  if (fix.includes('suggestion')) return 'suggested'
  return 'safe'
}

function fixTouchesFor(fixKind: RuleEntry['fixKind']): readonly FixDomain[] {
  return fixKind === 'none' ? [] : ['statements']
}

function kebabToWords(value: string): string {
  return value
    .split('-')
    .map((word) => (word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ')
}

function naiveConceptId(rule: CatalogueRule): string {
  return `${rule.category}.${rule.value}`
}

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
  readonly recommendedEligible: boolean
}

/**
 * Which rules accept options, read from the schema oxlint ships rather than guessed. A rule whose
 * only shape is a severity cannot be tuned, so `sgate rules` can say "this one is upstream's default
 * because there is nothing to change" separately from "we chose the default".
 */
function readOptionedRules(): ReadonlySet<string> {
  const schemaPath = resolveOxlintSchemaPath()
  if (schemaPath === undefined) throw new Error('oxlint could not be resolved, so its option schema cannot be read')
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as {
    definitions?: { DummyRuleMap?: { properties?: Record<string, { anyOf?: { type?: string; items?: unknown }[] }> } }
  }
  const properties = schema.definitions?.DummyRuleMap?.properties
  if (properties === undefined) throw new Error(`${schemaPath} has no DummyRuleMap.properties to read options from`)

  const optioned = new Set<string>()
  for (const [name, spec] of Object.entries(properties)) {
    // The array form is [severity] with no options, and [severity, config] with them.
    const asArray = spec.anyOf?.find((branch) => branch.type === 'array')
    if (Array.isArray(asArray?.items) && asArray.items.length > 1) optioned.add(name)
  }
  if (optioned.size === 0) throw new Error(`${schemaPath} declared no rule as taking options, which cannot be right`)
  return optioned
}

function buildEntries(catalogue: readonly CatalogueRule[]): readonly GeneratedEntry[] {
  const mechanicalId = disambiguate(catalogue)
  const optioned = readOptionedRules()
  const RECOMMENDED_CATEGORIES = new Set<OxlintCategory>(['correctness', 'suspicious'])

  return catalogue.map((rule) => {
    const engineRuleId = engineRuleIdOf(rule)
    const override = RULE_OVERRIDES[engineRuleId]
    const concepts = override?.concepts ?? [mechanicalId.get(rule)! as ConceptId]
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
      ...(optioned.has(engineRuleId) ? { hasOptions: true as const } : {}),
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
  const known = new Set([...HAND_WRITTEN_CONCEPTS, ...CURATED_CONCEPTS].map((c) => c.id as string))
  const byId = new Map<string, ConceptDefinition>()

  for (const { rule, engineRuleId, entry } of generated) {
    if (RULE_OVERRIDES[engineRuleId]?.concepts !== undefined) continue

    const conceptId = entry.concepts[0]
    if (known.has(conceptId) || byId.has(conceptId)) continue

    byId.set(conceptId, {
      id: conceptId,
      group: rule.category,
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
  if (entry.hasOptions === true) lines.push('    hasOptions: true,')
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

/** Keyed by \`ConceptId\` rather than \`string\`, so a hand-edited typo is a compile error and not a preset that enables nothing. */
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
 * One entry per mechanically-named concept a generated rule entry invents; \`title\` and
 * \`description\` are factual passthroughs of the source rule, not curated prose.
 *
 * \`as const satisfies\` and never a type annotation: \`ConceptId\` is \`(typeof CONCEPTS)[number]['id']\`,
 * so an annotation widens every id to \`string\` and collapses the union, erasing concept-id checking
 * everywhere it is used.
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
