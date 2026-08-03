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
  // The property the `agent` reporter depends on: `GENERATED_CONCEPT_IDS` is membership in
  // `concepts.generated.ts`, and the reporter omits its `why:` line for exactly that set. Writing a
  // rationale is therefore only half the job — the generator has to stop re-emitting the concept
  // with its boilerplate description, which it does by treating this array as already-known
  // vocabulary (scripts/generate-registry.ts). If that link ever broke, every rationale below would
  // be written, committed, and never shown.
  for (const concept of CURATED_CONCEPTS) expect(GENERATED_CONCEPT_IDS.has(concept.id), concept.id).toBe(false)
})

test('no curated description is generator boilerplate', () => {
  for (const concept of CURATED_CONCEPTS) {
    expect(concept.description, concept.id).not.toContain('Generated from')
    expect(concept.title, concept.id).not.toContain('/')
  }
})

test('no curated description merely restates the rule name', () => {
  // The failure mode these rationales exist to fix is a description that spells the rule id back at
  // the reader. A rationale has to say something the id does not, so require at least one word that
  // is not in the concept id itself.
  for (const concept of CURATED_CONCEPTS) {
    const idWords = new Set(concept.id.split(/[.-]/))
    const words = concept.description.toLowerCase().match(/[a-z]+/g) ?? []
    expect(words.some((word) => !idWords.has(word)), concept.id).toBe(true)
  }
})

test('every curated concept is still claimed by a rule', () => {
  // A curated concept is named the way the generator would have named it, but lives in a
  // hand-maintained file — so an oxlint rename or removal leaves the rationale behind pointing at a
  // concept nothing can ever report. `HAND_WRITTEN_CONCEPTS` cannot drift this way (the override
  // table names those ids in type-checked code); these can, so the drift is asserted instead.
  const claimed = new Set(RULE_ENTRIES.flatMap((entry) => entry.concepts))
  const orphans = CURATED_CONCEPTS.filter((concept) => !claimed.has(concept.id)).map((concept) => concept.id)
  expect(orphans).toEqual([])
})

test('every concept `recommended` enables at `error` has a curated rationale', () => {
  // The scope line for this curation, kept as a guard rather than a one-off count. An `error` in the
  // default preset fails a build with no opt-in, so it is the set a user is guaranteed to meet — and
  // the set where "why does this matter" has to be answerable. A new oxlint `correctness` rule
  // arrives at `error` through the generator; this fails until someone writes its rationale, in the
  // same way `generate:registry:check` fails until someone regenerates.
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
