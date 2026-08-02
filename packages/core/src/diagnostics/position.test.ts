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

// --- offsetAt: the inverse of positionAt, needed by engines that report (line, column) text ------

test('offsetAt maps line 1 column 1 to offset zero', () => {
  const index = createLineIndex('const a = 1\n')
  expect(index.offsetAt({ line: 1, column: 1 })).toBe(0)
})

test('offsetAt maps a position on a later line', () => {
  const index = createLineIndex('a\nbb\nccc\n')
  expect(index.offsetAt({ line: 3, column: 1 })).toBe(5)
})

test('offsetAt round-trips with positionAt', () => {
  const index = createLineIndex('a\nbb\nccc\n')
  for (const offset of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    expect(index.offsetAt(index.positionAt(offset))).toBe(offset)
  }
})

test('offsetAt counts columns in UTF-16 code units, not bytes', () => {
  // 'č' is 2 bytes in UTF-8 but 1 UTF-16 code unit — mirrors position.test.ts's positionAt case,
  // inverted: column 4 (just before 'x') must land on the byte offset 'x' actually starts at.
  const source = 'čč x'
  const byteOffsetOfX = new TextEncoder().encode('čč ').length
  expect(byteOffsetOfX).toBe(5)
  expect(createLineIndex(source).offsetAt({ line: 1, column: 4 })).toBe(byteOffsetOfX)
})

test('offsetAt counts an astral-plane character as two UTF-16 code units', () => {
  const source = '😀x'
  const byteOffsetOfX = new TextEncoder().encode('😀').length
  expect(byteOffsetOfX).toBe(4)
  expect(createLineIndex(source).offsetAt({ line: 1, column: 3 })).toBe(byteOffsetOfX)
})

test('offsetAt clamps a line past the end of the source to the last line', () => {
  const index = createLineIndex('aaa\nbbb')
  expect(index.offsetAt({ line: 99, column: 1 })).toBe(index.offsetAt({ line: 2, column: 1 }))
})

test('offsetAt clamps a column past the end of a line to the line end', () => {
  const index = createLineIndex('aaa\nbbb\n')
  expect(index.offsetAt({ line: 1, column: 999 })).toBe(index.rangeOfLine(1).end)
})

test('offsetAt clamps a column below 1 to the start of the line', () => {
  const index = createLineIndex('aaa\nbbb\n')
  expect(index.offsetAt({ line: 2, column: 0 })).toBe(index.rangeOfLine(2).start)
})

test('offsetAtCodepointColumn counts an astral-plane character as one column', () => {
  const source = '😀x'
  const byteOffsetOfX = new TextEncoder().encode('😀').length
  expect(byteOffsetOfX).toBe(4)
  expect(createLineIndex(source).offsetAtCodepointColumn({ line: 1, column: 2 })).toBe(byteOffsetOfX)
})

test('offsetAtCodepointColumn and offsetAt disagree by one per astral character', () => {
  // The discriminating fixture, and the reason the two entry points exist. Three astral characters
  // before the target make the UTF-16 column three higher than the codepoint column, so a reading
  // that confuses the units lands three codepoints early — inside the emoji run, not on `x`.
  // Every BMP-only input agrees, which is exactly why this case has to be written down.
  const source = '/* 😀😀😀 */ x'
  const index = createLineIndex(source)
  const byteOffsetOfX = new TextEncoder().encode('/* 😀😀😀 */ ').length

  const codepointColumn = [...'/* 😀😀😀 */ '].length + 1
  const utf16Column = '/* 😀😀😀 */ '.length + 1
  expect(utf16Column - codepointColumn).toBe(3)

  expect(index.offsetAtCodepointColumn({ line: 1, column: codepointColumn })).toBe(byteOffsetOfX)
  expect(index.offsetAt({ line: 1, column: utf16Column })).toBe(byteOffsetOfX)
  expect(index.offsetAt({ line: 1, column: codepointColumn })).not.toBe(byteOffsetOfX)
})

test('offsetAtCodepointColumn matches offsetAt on input with no astral characters', () => {
  const index = createLineIndex('čč x\nplain ascii\n')
  for (const position of [
    { line: 1, column: 1 },
    { line: 1, column: 4 },
    { line: 2, column: 7 },
  ]) {
    expect(index.offsetAtCodepointColumn(position)).toBe(index.offsetAt(position))
  }
})

test('offsetAtCodepointColumn clamps out-of-range lines and columns like offsetAt', () => {
  const index = createLineIndex('aaa\nbbb')
  expect(index.offsetAtCodepointColumn({ line: 99, column: 1 })).toBe(index.offsetAt({ line: 2, column: 1 }))
  expect(index.offsetAtCodepointColumn({ line: 1, column: 999 })).toBe(index.rangeOfLine(1).end)
  expect(index.offsetAtCodepointColumn({ line: 2, column: 0 })).toBe(index.rangeOfLine(2).start)
})
