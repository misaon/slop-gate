import { expect, test } from 'vitest'
import { createLineIndex } from './position.ts'

test('maps offset zero to line 1 column 1', () => {
  const index = createLineIndex('const a = 1\n')
  expect(index.positionAt(0)).toEqual({ line: 1, column: 1 })
})

test('maps an offset on a later line', () => {
  const index = createLineIndex('a\nbb\nccc\n')
  expect(index.positionAt(5)).toEqual({ line: 3, column: 1 })
})

test('counts columns in UTF-16 code units, not bytes', () => {
  // 'č' is 2 bytes in UTF-8 but 1 UTF-16 code unit.
  const source = 'čč x'
  const byteOffsetOfX = new TextEncoder().encode('čč ').length
  expect(byteOffsetOfX).toBe(5)
  expect(createLineIndex(source).positionAt(byteOffsetOfX)).toEqual({ line: 1, column: 4 })
})

test('counts an astral-plane character as two UTF-16 code units', () => {
  const source = '😀x'
  const byteOffsetOfX = new TextEncoder().encode('😀').length
  expect(byteOffsetOfX).toBe(4)
  expect(createLineIndex(source).positionAt(byteOffsetOfX)).toEqual({ line: 1, column: 3 })
})

test('treats CRLF as a single line break', () => {
  const index = createLineIndex('a\r\nb')
  expect(index.positionAt(3)).toEqual({ line: 2, column: 1 })
})

test('clamps an offset past the end of the source', () => {
  const index = createLineIndex('ab')
  expect(index.positionAt(999)).toEqual({ line: 1, column: 3 })
})

test('expands a range to whole lines', () => {
  const index = createLineIndex('aaa\nbbb\nccc\n')
  expect(index.lineRangeOf({ start: 5, end: 6 })).toEqual({ start: 4, end: 7 })
})

test('slices bytes back into a string', () => {
  const index = createLineIndex('aaa\nbbb\nccc\n')
  expect(index.sliceBytes({ start: 4, end: 7 })).toBe('bbb')
})

test('slices multi-byte characters without splitting them', () => {
  const source = 'čč x'
  const index = createLineIndex(source)
  expect(index.sliceBytes({ start: 0, end: 4 })).toBe('čč')
})

test('expands a range to whole lines when the last line has no trailing newline', () => {
  const index = createLineIndex('aaa\nbbb')
  expect(index.lineRangeOf({ start: 5, end: 6 })).toEqual({ start: 4, end: 7 })
})

test('rangeOfLine returns the byte range of a 1-based line, newline excluded', () => {
  const index = createLineIndex('aaa\nbbb\nccc\n')
  expect(index.rangeOfLine(1)).toEqual({ start: 0, end: 3 })
  expect(index.rangeOfLine(2)).toEqual({ start: 4, end: 7 })
  expect(index.rangeOfLine(3)).toEqual({ start: 8, end: 11 })
})

test('rangeOfLine matches lineRangeOf for an offset on the same line', () => {
  const index = createLineIndex('aaa\nbbb\nccc\n')
  expect(index.rangeOfLine(2)).toEqual(index.lineRangeOf({ start: 5, end: 6 }))
})

test('rangeOfLine on the final line with no trailing newline', () => {
  const index = createLineIndex('aaa\nbbb')
  expect(index.rangeOfLine(2)).toEqual({ start: 4, end: 7 })
})

test('rangeOfLine clamps a line number past the end of the source to the last line', () => {
  // No trailing newline, deliberately: `'aaa\nbbb\n'` would make line 3 the empty line *after* the
  // trailing newline, which is a real (if phantom) last line, not the clamp target this test means
  // to isolate — see the next test for that case instead.
  const index = createLineIndex('aaa\nbbb')
  expect(index.rangeOfLine(99)).toEqual(index.rangeOfLine(2))
})

test('rangeOfLine clamps a line number past the end to the phantom empty line after a trailing newline', () => {
  const index = createLineIndex('aaa\nbbb\n')
  expect(index.rangeOfLine(99)).toEqual({ start: 8, end: 8 })
})

test('rangeOfLine clamps a line number below 1 to the first line', () => {
  const index = createLineIndex('aaa\nbbb\n')
  expect(index.rangeOfLine(0)).toEqual(index.rangeOfLine(1))
})
