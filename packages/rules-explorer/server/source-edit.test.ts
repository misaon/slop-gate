import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { editObjectLiteral, quote, readObjectEntry, wrapLiteral } from './source-edit.ts'

const FILE = 'impact.ts'
const SOURCE = `import type { ConceptGroup } from '../concepts/catalogue.ts'

const GROUP_IMPACT: Readonly<Record<ConceptGroup, Impact>> = {
  security: 3,
}

// Only concepts their group is wrong about.
const CONCEPT_IMPACT: Readonly<Record<string, Impact>> = {
  // The file did not parse, so nothing else about it was checked.
  'correctness.parse-error': 3,
  // A comment narrating the code beneath it is noise, not a defect.
  'slop.narrative-comment': 1,
}
`

test('a property is replaced together with the comment that explains it', () => {
  const next = editObjectLiteral(FILE, SOURCE, 'CONCEPT_IMPACT', 'slop.narrative-comment', "  // Reconsidered.\n  'slop.narrative-comment': 2,")

  expect(next).toContain("  // Reconsidered.\n  'slop.narrative-comment': 2,\n}")
  expect(next).not.toContain('is noise, not a defect')
  // The record above it, and the comment introducing this one, are untouched.
  expect(next).toContain('  security: 3,')
  expect(next).toContain('// Only concepts their group is wrong about.')
})

test('removing a property takes its comment with it and leaves the rest alone', () => {
  const next = editObjectLiteral(FILE, SOURCE, 'CONCEPT_IMPACT', 'correctness.parse-error', null)

  expect(next).not.toContain('correctness.parse-error')
  expect(next).not.toContain('did not parse')
  expect(next).toContain("  // A comment narrating the code beneath it is noise, not a defect.\n  'slop.narrative-comment': 1,")
})

test('an unknown key is appended after the last property', () => {
  const next = editObjectLiteral(FILE, SOURCE, 'CONCEPT_IMPACT', 'deps.unresolved-import', "  // It throws the moment that line runs.\n  'deps.unresolved-import': 3,")

  expect(next).toContain("  'slop.narrative-comment': 1,\n  // It throws the moment that line runs.\n  'deps.unresolved-import': 3,\n}")
})

test('removing a key that is not there changes nothing', () => {
  expect(editObjectLiteral(FILE, SOURCE, 'CONCEPT_IMPACT', 'nothing.at-all', null)).toBe(SOURCE)
})

test('an entry reads back with the comment above it', () => {
  expect(readObjectEntry(FILE, SOURCE, 'CONCEPT_IMPACT', 'correctness.parse-error')).toMatchObject({
    comment: 'The file did not parse, so nothing else about it was checked.',
    value: '3',
  })
  expect(readObjectEntry(FILE, SOURCE, 'CONCEPT_IMPACT', 'absent')).toBeNull()
})

test('the record has to exist, and has to be an object literal', () => {
  expect(() => editObjectLiteral(FILE, SOURCE, 'NO_SUCH_RECORD', 'a', null)).toThrow('declares no NO_SUCH_RECORD')
})

// The registry files are UTF-8 prose full of typographic dashes; a span read as bytes lands mid-word.
test('offsets survive the non-ASCII the registry is written in', () => {
  const source = "const R: Record<string, number> = {\n  // Alpine — no old versions.\n  'a/b': 1,\n  'c/d': 2,\n}\n"
  expect(editObjectLiteral(FILE, source, 'R', 'c/d', "  'c/d': 3,")).toContain("  // Alpine — no old versions.\n  'a/b': 1,\n  'c/d': 3,\n}")
})

test('a quoted string survives a quote, a backslash and a newline', () => {
  expect(quote("it's a \\ and a\nbreak")).toBe("'it\\'s a \\\\ and a\\nbreak'")
})

test('a wrapped literal concatenates back to the string it was given', () => {
  const reason = 'x'.repeat(40) + ' ' + 'y'.repeat(40) + ' ' + 'z'.repeat(40)
  const wrapped = wrapLiteral(reason, '      ', 60)

  const chunks = wrapped.split('\n').map((line) => line.trim().replace(/ \+$/, '').slice(1, -1))

  expect(wrapped.split('\n').every((line) => line.length <= 60)).toBe(true)
  expect(chunks.join('')).toBe(reason)
})

test('the real registry files parse and round-trip unchanged', () => {
  for (const [path, record] of [
    ['packages/core/src/registry/impact.ts', 'CONCEPT_IMPACT'],
    ['packages/core/src/registry/not-recommended.ts', 'NOT_RECOMMENDED_GENERATED'],
    ['packages/core/src/registry/not-recommended.ts', 'NOT_RECOMMENDED_UNCATALOGUED'],
  ] as const) {
    const source = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
    expect(editObjectLiteral(path, source, record, 'nothing-is-keyed-like-this', null), path).toBe(source)
  }
})
