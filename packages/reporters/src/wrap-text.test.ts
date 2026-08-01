import { expect, test } from 'vitest'
import { displayWidth } from './display-width.ts'
import { wrapText } from './wrap-text.ts'

test('a message shorter than the width passes through as a single line', () => {
  expect(wrapText('short message', 40)).toEqual(['short message'])
})

test('a message exactly at the width passes through as a single line', () => {
  const text = 'exactly ten'
  expect(displayWidth(text)).toBe(11)
  expect(wrapText(text, 11)).toEqual(['exactly ten'])
})

test('an empty message returns a single empty line', () => {
  expect(wrapText('', 40)).toEqual([''])
})

test('a long message wraps at word boundaries, never mid-word', () => {
  const text = 'the quick brown fox jumps over the lazy dog and then ran further away into the distance'
  const lines = wrapText(text, 20)

  expect(lines.length).toBeGreaterThan(1)
  for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(20)

  // Re-joining every line with a single space must reproduce the original words in order — the
  // only thing wrapping is allowed to change is *where* whitespace becomes a newline.
  expect(lines.join(' ')).toBe(text)

  // No returned line may start or end mid-word: every line boundary must land on one of the
  // original word boundaries.
  const originalWords = text.split(' ')
  for (const line of lines) {
    for (const word of line.split(' ')) expect(originalWords).toContain(word)
  }
})

test('an unbreakable token longer than the width survives intact on its own line', () => {
  const longToken = 'src/very/deeply/nested/package/module/implementation/file.ts'
  const text = `see ${longToken} for detail`
  const lines = wrapText(text, 20)

  expect(lines).toContain(longToken)
  const tokenLine = lines.find((line) => line === longToken)
  expect(tokenLine).toBeDefined()
  expect(displayWidth(tokenLine!)).toBeGreaterThan(20)
})

test('a lone unbreakable token wider than the width is the only line', () => {
  const longToken = 'a'.repeat(50)
  expect(wrapText(longToken, 20)).toEqual([longToken])
})

test('a message containing non-ASCII measures correctly when wrapping', () => {
  // "中文" is 2 codepoints at 2 columns each (4 total); plain ASCII words are 1 column per
  // character. If wrapping measured by `.length` instead of `displayWidth`, these CJK words would
  // be undercounted and this line would overflow the requested width.
  const text = '中文 中文 中文 ascii ascii'
  const lines = wrapText(text, 10)

  for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(10)
  expect(lines.join(' ')).toBe(text)
})

test('collapses runs of whitespace between words', () => {
  expect(wrapText('one   two\tthree', 40)).toEqual(['one two three'])
})

test('is a pure function: identical input always produces identical output', () => {
  const text = 'the quick brown fox jumps over the lazy dog'
  expect(wrapText(text, 15)).toEqual(wrapText(text, 15))
})
