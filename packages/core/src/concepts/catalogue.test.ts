import { expect, test } from 'vitest'
import { CONCEPTS, conceptById, GENERATED_CONCEPT_IDS, HAND_WRITTEN_CONCEPTS, isConceptId } from './catalogue.ts'
import { validateCatalogue } from './validate.ts'

test('the catalogue satisfies its invariants', () => {
  expect(validateCatalogue(CONCEPTS)).toEqual([])
})

test('every id is dot-separated lower kebab case', () => {
  for (const concept of CONCEPTS) {
    expect(concept.id).toMatch(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/)
  }
})

test('every id starts with its declared group', () => {
  for (const concept of CONCEPTS) {
    expect(concept.id.split('.')[0]).toBe(concept.group)
  }
})

test('recognises a known id and rejects an unknown one', () => {
  expect(isConceptId('dead-code.unused-import')).toBe(true)
  expect(isConceptId('dead-code.does-not-exist')).toBe(false)
})

test('looks a concept up by id', () => {
  expect(conceptById('dead-code.unused-import').group).toBe('dead-code')
})

test('separates generated descriptions from hand-written ones', () => {
  // The property consumers actually rely on: a generated description restates the rule's name and a
  // hand-written one states the consequence, so anything presenting a description as rationale has
  // to be able to tell them apart. Asserted on both sides — a set that quietly went empty, or one
  // that swallowed the curated half, would pass a membership check written only one way.
  expect(GENERATED_CONCEPT_IDS.has('correctness.no-useless-spread')).toBe(true)
  expect(GENERATED_CONCEPT_IDS.has('correctness.no-debugger')).toBe(false)
  for (const concept of HAND_WRITTEN_CONCEPTS) expect(GENERATED_CONCEPT_IDS.has(concept.id)).toBe(false)
  expect(GENERATED_CONCEPT_IDS.size).toBe(CONCEPTS.length - HAND_WRITTEN_CONCEPTS.length)
})

test('reports duplicate ids', () => {
  const duplicated = [
    { id: 'style.a', group: 'style', title: 'A', description: 'a' },
    { id: 'style.a', group: 'style', title: 'A again', description: 'a' },
  ] as const
  expect(validateCatalogue(duplicated)).toContain('duplicate concept id: style.a')
})

test('reports a group that does not match the id prefix', () => {
  const mismatched = [{ id: 'style.a', group: 'perf', title: 'A', description: 'a' }] as const
  expect(validateCatalogue(mismatched)).toContain('concept style.a declares group perf')
})

test('reports a deprecated concept pointing at a missing replacement', () => {
  const dangling = [
    {
      id: 'style.a',
      group: 'style',
      title: 'A',
      description: 'a',
      deprecated: { since: '0.1.0', replacedBy: 'style.gone' },
    },
  ] as const
  expect(validateCatalogue(dangling)).toContain('style.a is replaced by unknown concept style.gone')
})
