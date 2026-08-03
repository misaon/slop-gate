import { expect, test } from 'vitest'
import { fingerprint, normalizedWindow } from './fingerprint.ts'
import { createLineIndex } from './position.ts'
import type { ByteRange } from './types.ts'

const windowOf = (source: string, range: ByteRange): string => normalizedWindow(createLineIndex(source), range)

const base = {
  concept: 'dead-code.unused-import',
  file: 'src/a.ts',
  window: windowOf('import { x } from "y"\nconst a = 1\n', { start: 0, end: 21 }),
  occurrenceIndex: 0,
}

test('is stable across calls', () => {
  expect(fingerprint(base)).toBe(fingerprint(base))
})

test('survives reindentation of the finding', () => {
  const shifted = { ...base, window: windowOf('  import   {  x  }  from "y"\nconst a = 1\n', { start: 0, end: 28 }) }
  expect(fingerprint(shifted)).toBe(fingerprint(base))
})

test('survives unrelated lines being added above', () => {
  const withPreamble = {
    ...base,
    window: windowOf('// header\n// header\nimport { x } from "y"\nconst a = 1\n', { start: 20, end: 41 }),
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

/**
 * The two halves of "line numbers are deliberately excluded" (§10.1), pinned separately because the
 * M0 follow-ups called fingerprints "position-based" and drew a design conclusion from it. They are
 * not: nothing numeric about the position is hashed. What *is* hashed is the text of the line the
 * range lands on — so a column that moves within one line costs nothing, and a finding re-attributed
 * to a different line changes everything. Which of those an unstable engine does decides whether a
 * baseline can survive it.
 */
test('a column that moves within the same line does not change the fingerprint', () => {
  const source = 'const a = compute(1, 2)\n'
  expect(fingerprint({ ...base, window: windowOf(source, { start: 6, end: 7 }) })).toBe(
    fingerprint({ ...base, window: windowOf(source, { start: 10, end: 17 }) }),
  )
})

test('a finding re-attributed to a different line does change it, unless the lines read the same', () => {
  const source = 'const a = 1\nconst b = 2\nconst a = 1\n'
  const first = fingerprint({ ...base, window: windowOf(source, { start: 0, end: 11 }) })

  expect(fingerprint({ ...base, window: windowOf(source, { start: 12, end: 23 }) })).not.toBe(first)
  // Line 3 is textually identical to line 1, so the two are genuinely indistinguishable — that is the
  // trade `occurrenceIndex` exists to make survivable, not a defect.
  expect(fingerprint({ ...base, window: windowOf(source, { start: 24, end: 35 }) })).toBe(first)
})
