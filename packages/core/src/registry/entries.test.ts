import { expect, test } from 'vitest'
import { isConceptId } from '../concepts/catalogue.ts'
import { LANGUAGES } from '../languages.ts'
import { electOwners } from './elect.ts'
import { RULE_ENTRIES } from './entries.ts'
import { ENGINE_PREFERENCE, ruleRefKey, type RuleEntry } from './types.ts'

// `RULE_ENTRIES` is deliberately `as const satisfies readonly RuleEntry[]` so each entry keeps
// its narrow literal type (see registry/entries.ts). That means entries which omit an optional
// field, like `classify`, don't structurally have that key, and the union's `engine` type only
// includes the literals actually present. The checks below need the declared `RuleEntry` shape
// instead, so they read through this widened view rather than `RULE_ENTRIES` directly.
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
  for (const entry of RULE_ENTRIES) {
    if (entry.fixKind === 'none') expect(entry.fixTouches, ruleRefKey(entry)).toEqual([])
    else expect(entry.fixTouches.length, ruleRefKey(entry)).toBeGreaterThan(0)
  }
})

test('no rule entry claims a formatting concept', () => {
  // The formatter is the permanent owner of `formatting.*` (spec 5.3).
  const offenders = WIDENED_ENTRIES.filter(
    (e) => e.engine !== 'oxfmt' && e.concepts.some((c) => c.startsWith('formatting.')),
  )
  expect(offenders.map(ruleRefKey)).toEqual([])
})

test('every rule covering more than one concept can attribute a finding to one of them', () => {
  for (const entry of WIDENED_ENTRIES) {
    if (entry.concepts.length > 1) {
      expect(entry.classify, ruleRefKey(entry)).toBeDefined()
      expect(entry.classify!.length, ruleRefKey(entry)).toBeGreaterThan(0)
    }
  }
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
  })

  expect(result.suppressed).toHaveLength(1)
  expect(result.owners.get('dead-code.unused-variable')?.engine).toBe('oxlint')
  expect(result.suppressed[0]?.reason).toBe('lower-tier')
})
