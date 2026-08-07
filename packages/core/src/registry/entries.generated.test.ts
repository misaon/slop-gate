import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { CURATED_CONCEPTS, HAND_WRITTEN_CONCEPTS, isConceptId } from '../concepts/catalogue.ts'
import { LANGUAGES } from '../languages.ts'
import { GENERATED_CONCEPTS } from '../concepts/concepts.generated.ts'
import { GENERATED_RECOMMENDED_RULES, GENERATED_RULE_ENTRIES } from './entries.generated.ts'
import { ENGINE_PREFERENCE, ruleRefKey, type RuleEntry } from './types.ts'

const WIDENED_ENTRIES: readonly RuleEntry[] = GENERATED_RULE_ENTRIES

test('there is exactly one entry per catalogue rule (847 at generation time)', () => {
  expect(GENERATED_RULE_ENTRIES.length).toBeGreaterThan(800)
})

test('every referenced concept exists in the catalogue', () => {
  const unknown = GENERATED_RULE_ENTRIES.flatMap((e) => e.concepts.filter((c) => !isConceptId(c)))
  expect(unknown).toEqual([])
})

test('every entry declares at least one concept and one language', () => {
  for (const entry of GENERATED_RULE_ENTRIES) {
    expect(entry.concepts.length, ruleRefKey(entry)).toBeGreaterThan(0)
    expect(entry.languages.length, ruleRefKey(entry)).toBeGreaterThan(0)
  }
})

test('every declared language is known', () => {
  const unknown = GENERATED_RULE_ENTRIES.flatMap((e) => e.languages.filter((l) => !LANGUAGES.includes(l)))
  expect(unknown).toEqual([])
})

test('every entry has an absolute documentation url', () => {
  for (const entry of GENERATED_RULE_ENTRIES) {
    expect(entry.docsUrl, ruleRefKey(entry)).toMatch(/^https:\/\//)
  }
})

test('every engine is listed in the preference order', () => {
  const missing = GENERATED_RULE_ENTRIES.map((e) => e.engine).filter((e) => !ENGINE_PREFERENCE.includes(e))
  expect(missing).toEqual([])
})

test('an entry that declares a fix also declares what the fix touches', () => {
  const offenders = GENERATED_RULE_ENTRIES.filter((e) =>
    e.fixKind === 'none' ? e.fixTouches.length > 0 : e.fixTouches.length === 0,
  )
  expect(offenders.map(ruleRefKey)).toEqual([])
})

test('no rule entry claims a formatting concept', () => {
  const offenders = WIDENED_ENTRIES.filter((e) => e.concepts.some((c) => c.startsWith('formatting.')))
  expect(offenders.map(ruleRefKey)).toEqual([])
})

test('every rule covering more than one concept can attribute a finding to one of them', () => {
  const multiConcept = WIDENED_ENTRIES.filter((e) => e.concepts.length > 1)
  expect(multiConcept.length, 'no multi-concept entry is left for this test to assert against').toBeGreaterThan(0)
  expect(multiConcept.filter((e) => (e.classify?.length ?? 0) === 0).map(ruleRefKey)).toEqual([])
})

test('every classify target is one of the concepts the rule claims', () => {
  for (const entry of WIDENED_ENTRIES) {
    for (const rule of entry.classify ?? []) {
      expect(entry.concepts as readonly string[], ruleRefKey(entry)).toContain(rule.concept)
    }
  }
})

test('every classify pattern is a valid regular expression', () => {
  for (const entry of WIDENED_ENTRIES) {
    for (const rule of entry.classify ?? []) {
      expect(() => new RegExp(rule.messagePattern), `${ruleRefKey(entry)}: ${rule.messagePattern}`).not.toThrow()
    }
  }
})

test('no two entries share an engine and rule id', () => {
  const keys = GENERATED_RULE_ENTRIES.map(ruleRefKey)
  expect(keys).toEqual([...new Set(keys)])
})

test('the generated file is sorted, deterministic output — same input, byte-identical file', () => {
  const ids = GENERATED_RULE_ENTRIES.map((e) => e.engineRuleId)
  expect(ids).toEqual([...ids].sort())
})

test('every generated concept id starts with its own declared group', () => {
  for (const concept of GENERATED_CONCEPTS) {
    expect(concept.id.split('.')[0]).toBe(concept.group)
  }
})

test('every generated concept has a non-empty title and description', () => {
  for (const concept of GENERATED_CONCEPTS) {
    expect(concept.title.trim().length, concept.id).toBeGreaterThan(0)
    expect(concept.description.trim().length, concept.id).toBeGreaterThan(0)
  }
})

test('no generated concept duplicates a written one', () => {
  const written = new Set<string>([...HAND_WRITTEN_CONCEPTS, ...CURATED_CONCEPTS].map((c) => c.id))
  expect(GENERATED_CONCEPTS.filter((c) => written.has(c.id)).map((c) => c.id)).toEqual([])
  // A floor, not a target, and it falls as concepts are written up: every rule `recommended` enables now
  // carries a curated description, which moved 218 of these into `curated.ts`. Lower it when that
  // continues; a sudden jump the other way means the generator stopped seeing the written ones.
  expect(GENERATED_CONCEPTS.length).toBeGreaterThan(300)
})

test('every generated-recommended concept exists in the catalogue and is at error or warn', () => {
  for (const [concept, level] of Object.entries(GENERATED_RECOMMENDED_RULES)) {
    expect(isConceptId(concept), concept).toBe(true)
    expect(['error', 'warn']).toContain(level)
  }
})

test('every generated-recommended concept is actually claimed by some generated entry', () => {
  const claimed = new Set(GENERATED_RULE_ENTRIES.flatMap((e) => e.concepts as readonly string[]))
  for (const concept of Object.keys(GENERATED_RECOMMENDED_RULES)) {
    expect(claimed.has(concept), concept).toBe(true)
  }
})

const CORE_ROOT = join(import.meta.dirname, '../..')

test('regenerating from the live oxlint catalogue produces no drift (the CI freshness check)', () => {
  const output = execFileSync('node', ['scripts/generate-registry.ts', '--check'], {
    cwd: CORE_ROOT,
    encoding: 'utf8',
  })
  expect(output).toContain('up to date')
}, 60_000)
