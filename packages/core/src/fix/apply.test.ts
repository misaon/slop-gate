import { expect, test } from 'vitest'
import { applyEdits, decodeUtf8, encodeUtf8 } from './apply.ts'
import type { CandidateEdit } from './types.ts'

const edit = (over: Partial<CandidateEdit> & Pick<CandidateEdit, 'range' | 'replacement'>): CandidateEdit => ({
  file: 'src/a.ts',
  kind: 'safe',
  ruleRefKey: 'oxlint/rule',
  concept: 'correctness.m',
  priority: 50,
  severity: 'warn',
  ...over,
})

const apply = (source: string, edits: readonly CandidateEdit[]): string =>
  decodeUtf8(applyEdits(encodeUtf8(source), edits))

test('a single replacement lands exactly on its range', () => {
  expect(apply('const a = 1', [edit({ range: { start: 0, end: 5 }, replacement: 'let' })])).toBe('let a = 1')
})

test('two disjoint edits both land, and the later one does not shift the earlier one', () => {
  const source = 'if (a == 1 && b == 2) {}'
  const result = apply(source, [
    edit({ range: { start: 6, end: 8 }, replacement: '===' }),
    edit({ range: { start: 16, end: 18 }, replacement: '===' }),
  ])

  expect(result).toBe('if (a === 1 && b === 2) {}')
})

test('edits are applied in reverse offset order regardless of the order given', () => {
  const source = 'aaaa bbbb cccc'
  const forward = apply(source, [
    edit({ range: { start: 0, end: 4 }, replacement: 'X' }),
    edit({ range: { start: 10, end: 14 }, replacement: 'ZZZZZZ' }),
  ])
  const backward = apply(source, [
    edit({ range: { start: 10, end: 14 }, replacement: 'ZZZZZZ' }),
    edit({ range: { start: 0, end: 4 }, replacement: 'X' }),
  ])

  expect(forward).toBe('X bbbb ZZZZZZ')
  expect(backward).toBe(forward)
})

test('a zero-width edit inserts without deleting', () => {
  expect(apply('const a = 1', [edit({ range: { start: 11, end: 11 }, replacement: ';' })])).toBe('const a = 1;')
})

test('an edit whose range is the whole buffer replaces everything', () => {
  expect(apply('old', [edit({ range: { start: 0, end: 3 }, replacement: 'new' })])).toBe('new')
})

test('an empty replacement deletes the range', () => {
  expect(apply('const a = 1;;', [edit({ range: { start: 12, end: 13 }, replacement: '' })])).toBe('const a = 1;')
})

test('a byte-offset edit after multi-byte characters lands on the right characters', () => {
  const source = 'const emoji = "🚀 héllo"\nif (x == 1) {}\n'
  const bytes = encodeUtf8(source)
  const start = bytes.indexOf(encodeUtf8('==')[0]!, encodeUtf8('const emoji = "🚀 héllo"\nif (x ').length - 1)

  const eqOffset = encodeUtf8('const emoji = "🚀 héllo"\nif (x ').length
  expect(start).toBe(eqOffset)

  const result = apply(source, [edit({ range: { start: eqOffset, end: eqOffset + 2 }, replacement: '===' })])
  expect(result).toBe('const emoji = "🚀 héllo"\nif (x === 1) {}\n')
})

test('a multi-byte replacement does not disturb a later edit derived from the original buffer', () => {
  const source = 'a = "x"; b = "y";'
  const result = apply(source, [
    edit({ range: { start: 4, end: 7 }, replacement: '"🚀🚀🚀"' }),
    edit({ range: { start: 13, end: 16 }, replacement: '"z"' }),
  ])

  expect(result).toBe('a = "🚀🚀🚀"; b = "z";')
})

test('CRLF line endings survive an edit on another line', () => {
  const source = 'const a = 1\r\nif (b == 2) {}\r\n'
  const offset = encodeUtf8('const a = 1\r\nif (b ').length
  const result = apply(source, [edit({ range: { start: offset, end: offset + 2 }, replacement: '===' })])

  expect(result).toBe('const a = 1\r\nif (b === 2) {}\r\n')
})

test('a lone surrogate in a replacement cannot smuggle invalid bytes through', () => {
  const result = apply('ab', [edit({ range: { start: 1, end: 2 }, replacement: '\uD800' })])
  expect(decodeUtf8(encodeUtf8(result))).toBe(result)
  expect(result).toBe('a�')
})

test('applying no edits returns the buffer unchanged', () => {
  const bytes = encodeUtf8('unchanged')
  expect(decodeUtf8(applyEdits(bytes, []))).toBe('unchanged')
})

test('an out-of-range edit throws rather than silently clamping', () => {
  expect(() => applyEdits(encodeUtf8('abc'), [edit({ range: { start: 2, end: 90 }, replacement: 'x' })])).toThrow(
    /out of range/i,
  )
})

test('overlapping edits throw rather than producing a spliced-together buffer', () => {
  expect(() =>
    applyEdits(encodeUtf8('abcdefgh'), [
      edit({ range: { start: 0, end: 5 }, replacement: 'x' }),
      edit({ range: { start: 3, end: 7 }, replacement: 'y' }),
    ]),
  ).toThrow(/overlap/i)
})
