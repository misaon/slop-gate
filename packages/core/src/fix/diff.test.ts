import { expect, test } from 'vitest'
import { unifiedDiff } from './diff.ts'
import { encodeUtf8 } from './apply.ts'

const diff = (before: string, after: string, file = 'src/a.ts'): string =>
  unifiedDiff(file, encodeUtf8(before), encodeUtf8(after))

test('a one-line change produces a standard unified hunk', () => {
  const result = diff('const a = 1\nconst b = 2\nconst c = 3\n', 'const a = 1\nlet b = 2\nconst c = 3\n')

  expect(result).toBe(
    [
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,3 +1,3 @@',
      ' const a = 1',
      '-const b = 2',
      '+let b = 2',
      ' const c = 3',
      '',
    ].join('\n'),
  )
})

test('identical buffers produce an empty diff', () => {
  expect(diff('same\n', 'same\n')).toBe('')
})

test('the header names the file with forward slashes on both sides', () => {
  const result = diff('a\n', 'b\n', 'packages/core/src/a.ts')
  expect(result.startsWith('--- a/packages/core/src/a.ts\n+++ b/packages/core/src/a.ts\n')).toBe(true)
})

test('distant changes produce separate hunks rather than one spanning the gap', () => {
  const before = ['x1', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'x2', ''].join('\n')
  const after = ['y1', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'y2', ''].join('\n')

  const hunks = diff(before, after).split('\n').filter((line) => line.startsWith('@@'))
  expect(hunks).toHaveLength(2)
})

test('nearby changes are merged into one hunk', () => {
  const before = ['x1', 'p', 'x2', ''].join('\n')
  const after = ['y1', 'p', 'y2', ''].join('\n')

  const hunks = diff(before, after).split('\n').filter((line) => line.startsWith('@@'))
  expect(hunks).toHaveLength(1)
})

test('an added line is rendered as an addition with no matching removal', () => {
  const result = diff('a\nb\n', 'a\nnew\nb\n')
  expect(result).toContain('+new')
  expect(result.split('\n').filter((line) => line.startsWith('-'))).toEqual(['--- a/src/a.ts'])
})

test('a removed line is rendered as a removal with no matching addition', () => {
  const result = diff('a\ngone\nb\n', 'a\nb\n')
  expect(result).toContain('-gone')
  expect(result.split('\n').filter((line) => line.startsWith('+'))).toEqual(['+++ b/src/a.ts'])
})

test('a missing trailing newline is reported the way git reports it', () => {
  const result = diff('a\nb', 'a\nc')
  expect(result).toContain('\\ No newline at end of file')
})

test('adding a trailing newline is a visible change, not a silent one', () => {
  const result = diff('a', 'a\n')
  expect(result).toContain('-a')
  expect(result).toContain('+a')
  expect(result).toContain('\\ No newline at end of file')
})

test('multi-byte content is rendered by character, not mangled into replacement bytes', () => {
  const result = diff('const s = "héllo 🚀"\n', 'const s = "héllo 🌍"\n')
  expect(result).toContain('-const s = "héllo 🚀"')
  expect(result).toContain('+const s = "héllo 🌍"')
})

test('a CRLF file keeps its carriage returns out of the line content', () => {
  // A `\r` left on the end of every context line would make the whole file look changed in a
  // terminal that renders it, and would defeat a reader comparing the diff to the source.
  const result = diff('a\r\nb\r\n', 'a\r\nc\r\n')
  expect(result).toContain('-b')
  expect(result).toContain('+c')
  expect(result).not.toContain('\r')
})

test('an empty file gaining content diffs against nothing', () => {
  const result = diff('', 'new\n')
  expect(result).toContain('+new')
})
