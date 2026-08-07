import { styleText } from 'node:util'
import { expect, test } from 'vitest'
import { displayWidth, padEndDisplay, padStartDisplay, truncateEnd, truncateStart } from './display-width.ts'

test('counts plain ASCII as one column per character', () => {
  expect(displayWidth('hello')).toBe(5)
  expect(displayWidth('')).toBe(0)
})

test('counts a single-codepoint emoji as two columns', () => {
  expect(displayWidth('🔴')).toBe(2)
  expect(displayWidth('🟡')).toBe(2)
  expect(displayWidth('🔵')).toBe(2)
})

test('counts emoji mixed with ASCII text correctly', () => {
  expect(displayWidth('🔴 error')).toBe(2 + 1 + 5)
  expect(displayWidth('a🔴b')).toBe(1 + 2 + 1)
})

test('counts a CJK character as two columns', () => {
  expect(displayWidth('中')).toBe(2)
  expect(displayWidth('日本語')).toBe(6)
})

test('counts CJK mixed with ASCII correctly', () => {
  expect(displayWidth('中a')).toBe(3)
})

test('a combining mark contributes zero width to its base character', () => {
  const decomposed = 'é'
  expect(decomposed).toHaveLength(2)
  expect(displayWidth(decomposed)).toBe(1)
  expect(displayWidth(`caf${decomposed}`)).toBe(4)
})

test('a bare combining mark with no base character has zero width', () => {
  expect(displayWidth('́')).toBe(0)
})

test('a regional-indicator flag pair counts as one two-column glyph, not two', () => {
  const flag = '\u{1F1FA}\u{1F1F8}'
  expect(displayWidth(flag)).toBe(2)
})

test('box-drawing and other ambiguous-width dingbats count as one column, not two', () => {
  expect(displayWidth('─')).toBe(1)
  expect(displayWidth('│')).toBe(1)
  expect(displayWidth('╭')).toBe(1)
  expect(displayWidth('▌')).toBe(1)
  expect(displayWidth('✓')).toBe(1)
  expect(displayWidth('◆')).toBe(1)
  expect(displayWidth('━')).toBe(1)
})

test('a realistic mixed string sums correctly', () => {
  const text = '🔴  23:9'
  expect(displayWidth(text)).toBe(8)
})

test('padEndDisplay pads plain text to the target width', () => {
  expect(padEndDisplay('ab', 5)).toBe('ab   ')
  expect(displayWidth(padEndDisplay('ab', 5))).toBe(5)
})

test('padEndDisplay accounts for an emoji already consuming two columns', () => {
  const text = '🔴x'
  expect(text).toHaveLength(3)
  const padded = padEndDisplay(text, 5)
  expect(padded).toBe('🔴x  ')
  expect(displayWidth(padded)).toBe(5)
})

test('padEndDisplay is a no-op when the text already reaches the width', () => {
  expect(padEndDisplay('🔴🔴', 4)).toBe('🔴🔴')
  expect(padEndDisplay('abcdef', 4)).toBe('abcdef')
})

test('padStartDisplay right-aligns plain text', () => {
  expect(padStartDisplay('7', 3)).toBe('  7')
})

test('padStartDisplay accounts for emoji width when right-aligning', () => {
  const padded = padStartDisplay('🔴', 4)
  expect(padded).toBe('  🔴')
  expect(displayWidth(padded)).toBe(4)
})

test('truncateEnd leaves short text untouched', () => {
  expect(truncateEnd('short', 10)).toBe('short')
})

test('truncateEnd keeps the head and appends an ellipsis when too long', () => {
  const result = truncateEnd('dead-code.unused-variable', 12)
  expect(result.endsWith('…')).toBe(true)
  expect(result.startsWith('dead-code')).toBe(true)
  expect(displayWidth(result)).toBeLessThanOrEqual(12)
})

test('truncateStart leaves short text untouched', () => {
  expect(truncateStart('short.ts', 10)).toBe('short.ts')
})

test('truncateStart keeps the tail and prefixes an ellipsis when too long', () => {
  const result = truncateStart('src/very/deep/nested/path/file.ts', 22)
  expect(result.startsWith('…')).toBe(true)
  expect(result.endsWith('file.ts')).toBe(true)
  expect(displayWidth(result)).toBeLessThanOrEqual(22)
})

test('truncateStart accounts for display width, not string length, when a path contains wide characters', () => {
  const path = '中文/very/deep/nested/path/file.ts'
  const result = truncateStart(path, 20)
  expect(displayWidth(result)).toBeLessThanOrEqual(20)
  expect(result.endsWith('file.ts')).toBe(true)
})

test('aNSI colour escape codes contribute zero width', () => {
  const colored = styleText('bold', 'slop-gate', { validateStream: false })
  expect(colored).not.toBe('slop-gate')
  expect(displayWidth(colored)).toBe(displayWidth('slop-gate'))
})

test('padEndDisplay pads a coloured string based on its visible width, not its raw length', () => {
  const colored = styleText('red', 'error', { validateStream: false })
  const padded = padEndDisplay(colored, 10)
  expect(displayWidth(padded)).toBe(10)
})

test('truncateEnd does not fire on coloured text that already fits within maxWidth', () => {
  const colored = styleText('bold', 'slop-gate', { validateStream: false })
  expect(truncateEnd(colored, 40)).toBe(colored)
})
