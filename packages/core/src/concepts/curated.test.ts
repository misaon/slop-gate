import { expect, test } from 'vitest'
import { compareStrings } from '../ordering.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { GENERATED_RECOMMENDED_RULES } from '../registry/entries.generated.ts'
import { CONCEPTS, CURATED_CONCEPTS, GENERATED_CONCEPT_IDS, HAND_WRITTEN_CONCEPTS } from './catalogue.ts'
import { validateCatalogue } from './validate.ts'

test('the curated concepts satisfy the catalogue invariants', () => {
  expect(validateCatalogue(CURATED_CONCEPTS)).toEqual([])
})

test('a curated concept is not also a generated one', () => {
  for (const concept of CURATED_CONCEPTS) expect(GENERATED_CONCEPT_IDS.has(concept.id), concept.id).toBe(false)
})

test('no curated description is generator boilerplate', () => {
  for (const concept of CURATED_CONCEPTS) {
    expect(concept.description, concept.id).not.toContain('Generated from')
    expect(concept.title, concept.id).not.toContain('/')
  }
})

test('no curated description merely restates the rule name', () => {
  for (const concept of CURATED_CONCEPTS) {
    const idWords = new Set(concept.id.split(/[.-]/))
    const words = concept.description.toLowerCase().match(/[a-z]+/g) ?? []
    expect(words.some((word) => !idWords.has(word)), concept.id).toBe(true)
  }
})

test('every curated concept is still claimed by a rule', () => {
  const claimed = new Set(RULE_ENTRIES.flatMap((entry) => entry.concepts))
  const orphans = CURATED_CONCEPTS.filter((concept) => !claimed.has(concept.id)).map((concept) => concept.id)
  expect(orphans).toEqual([])
})

test('every concept `recommended` enables at `error` has a curated rationale', () => {
  const curated = new Set([...HAND_WRITTEN_CONCEPTS, ...CURATED_CONCEPTS].map((concept) => concept.id as string))
  const missing = Object.entries(GENERATED_RECOMMENDED_RULES)
    .filter(([concept, level]) => level === 'error' && !curated.has(concept))
    .map(([concept]) => concept)
    .sort(compareStrings)
  expect(missing).toEqual([])
})

test('the curated concepts are sorted by id', () => {
  const ids = CURATED_CONCEPTS.map((concept) => concept.id)
  expect(ids).toEqual([...ids].sort(compareStrings))
})

test('the merged catalogue is the three halves and nothing else', () => {
  expect(CONCEPTS.length).toBe(HAND_WRITTEN_CONCEPTS.length + CURATED_CONCEPTS.length + GENERATED_CONCEPT_IDS.size)
})
