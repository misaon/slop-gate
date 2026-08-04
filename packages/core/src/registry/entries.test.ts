import { expect, test } from 'vitest'
import { isConceptId } from '../concepts/catalogue.ts'
import { PRESETS } from '../config/presets.ts'
import { NOT_RECOMMENDED_UNCATALOGUED } from './not-recommended.ts'
import { LANGUAGES } from '../languages.ts'
import { electOwners } from './elect.ts'
import { RULE_ENTRIES } from './entries.ts'
import { ENGINE_PREFERENCE, ruleRefKey, type RuleEntry } from './types.ts'

const WIDENED_ENTRIES: readonly RuleEntry[] = RULE_ENTRIES

test('every referenced concept exists in the catalogue', () => {
  const unknown = RULE_ENTRIES.flatMap((e) => e.concepts.filter((c) => !isConceptId(c)))
  expect(unknown).toEqual([])
})

test('every entry declares at least one concept and one language', () => {
  for (const entry of RULE_ENTRIES) {
    expect(entry.concepts.length, ruleRefKey(entry)).toBeGreaterThan(0)
    expect(entry.languages.length, ruleRefKey(entry)).toBeGreaterThan(0)
  }
})

test('every declared language is known', () => {
  const unknown = RULE_ENTRIES.flatMap((e) => e.languages.filter((l) => !LANGUAGES.includes(l)))
  expect(unknown).toEqual([])
})

test('every entry has an absolute documentation url', () => {
  for (const entry of RULE_ENTRIES) {
    expect(entry.docsUrl, ruleRefKey(entry)).toMatch(/^https:\/\//)
  }
})

test('every engine is listed in the preference order', () => {
  const missing = RULE_ENTRIES.map((e) => e.engine).filter((e) => !ENGINE_PREFERENCE.includes(e))
  expect(missing).toEqual([])
})

test('an entry that declares a fix also declares what the fix touches', () => {
  const offenders = RULE_ENTRIES.filter((e) =>
    e.fixKind === 'none' ? e.fixTouches.length > 0 : e.fixTouches.length === 0,
  )
  expect(offenders.map(ruleRefKey)).toEqual([])
})

test('no rule entry claims a formatting concept', () => {
  const offenders = WIDENED_ENTRIES.filter(
    (e) => e.engine !== 'oxfmt' && e.concepts.some((c) => c.startsWith('formatting.')),
  )
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

test('the shipped registry contains a real overlap and resolves it to oxlint', () => {
  const result = electOwners({
    entries: RULE_ENTRIES,
    enabledConcepts: new Set(['dead-code.unused-variable']),
    capabilities: new Set(),
    languages: new Set(['ts']),
    participatingEngines: new Set(['oxlint', 'eslint']),
  })

  expect(result.overlaps).toHaveLength(1)
  expect(result.owners.get('dead-code.unused-variable')?.[0]?.owner.engine).toBe('oxlint')
  expect(result.overlaps[0]?.reason).toBe('lower-tier')
})

test('no two entries share an engine and rule id', () => {
  const keys = WIDENED_ENTRIES.map(ruleRefKey)
  expect(keys).toEqual([...new Set(keys)])
})

test('every manually excluded rule exists, and none of its concepts reaches `recommended`', () => {
  const recommended = PRESETS.recommended
  for (const [key, exclusion] of Object.entries(NOT_RECOMMENDED_UNCATALOGUED)) {
    const entry = WIDENED_ENTRIES.find((candidate) => ruleRefKey(candidate) === key)
    expect(entry, `${key} is excluded but has no registry entry`).toBeDefined()
    expect(exclusion.reason.length, `${key} needs a real reason`).toBeGreaterThan(80)
    for (const concept of entry!.concepts) {
      expect(recommended[concept], `${key} is excluded but ${concept} is in \`recommended\``).toBeUndefined()
    }
  }
})

test('actionlint claims neither parse errors nor duplicate keys, which stay with the schema engine', () => {
  const owned = WIDENED_ENTRIES.filter((entry) => entry.engine === 'actionlint').flatMap((entry) => entry.concepts)
  expect(owned).not.toContain('correctness.parse-error')
  expect(owned).not.toContain('correctness.no-duplicate-object-key')

  const schema = WIDENED_ENTRIES.filter(
    (entry) => entry.engine === 'schema' && entry.languages.includes('github-workflow'),
  ).flatMap((entry) => entry.concepts)
  expect(schema).toContain('correctness.parse-error')
  expect(schema).toContain('correctness.no-duplicate-object-key')
})
