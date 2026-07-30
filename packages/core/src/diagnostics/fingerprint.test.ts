import { expect, test } from 'vitest'
import { fingerprint } from './fingerprint.ts'

const base = {
  concept: 'dead-code.unused-import',
  file: 'src/a.ts',
  source: 'import { x } from "y"\nconst a = 1\n',
  range: { start: 0, end: 21 },
  occurrenceIndex: 0,
}

test('is stable across calls', () => {
  expect(fingerprint(base)).toBe(fingerprint(base))
})

test('survives reindentation of the finding', () => {
  const reindented = { ...base, source: '  import   {  x  }  from "y"\nconst a = 1\n' }
  const shifted = { ...reindented, range: { start: 0, end: 28 } }
  expect(fingerprint(shifted)).toBe(fingerprint(base))
})

test('survives unrelated lines being added above', () => {
  const withPreamble = {
    ...base,
    source: '// header\n// header\nimport { x } from "y"\nconst a = 1\n',
    range: { start: 20, end: 41 },
  }
  expect(fingerprint(withPreamble)).toBe(fingerprint(base))
})

test('differs when the concept differs', () => {
  expect(fingerprint({ ...base, concept: 'style.no-var' })).not.toBe(fingerprint(base))
})

test('differs when the file differs', () => {
  expect(fingerprint({ ...base, file: 'src/b.ts' })).not.toBe(fingerprint(base))
})

test('distinguishes identical windows by occurrence index', () => {
  expect(fingerprint({ ...base, occurrenceIndex: 1 })).not.toBe(fingerprint(base))
})
