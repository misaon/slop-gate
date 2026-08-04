import { expect, test } from 'vitest'
import { applyEdits, decodeUtf8, encodeUtf8 } from './apply.ts'
import { editsFromRewrite } from './derive.ts'
import type { CandidateEdit } from './types.ts'

const derive = (before: string, after: string) => editsFromRewrite(encodeUtf8(before), encodeUtf8(after))

const asCandidates = (edits: ReturnType<typeof derive>): CandidateEdit[] =>
  edits.map((edit) => ({
    file: 'src/a.ts',
    range: edit.range,
    replacement: edit.replacement,
    kind: 'safe' as const,
    ruleRefKey: 'oxlint/r',
    concept: 'correctness.m',
    priority: 50,
    severity: 'warn' as const,
  }))

const roundTrips = (before: string, after: string): boolean =>
  decodeUtf8(applyEdits(encodeUtf8(before), asCandidates(derive(before, after)))) === after

test('an unchanged buffer yields no edits', () => {
  expect(derive('a\nb\n', 'a\nb\n')).toEqual([])
})

test('a one-token change on one line is trimmed to that token', () => {
  const edits = derive('if (a == 1) {}\n', 'if (a === 1) {}\n')

  expect(edits).toHaveLength(1)
  expect(edits[0]).toEqual({ range: { start: 8, end: 8 }, replacement: '=' })
})

test('two changes on distant lines produce two separate edits, not one spanning both', () => {
  const before = 'let a = 1\nconst p = 2\nconst q = 3\nlet b = 4\n'
  const after = 'const a = 1\nconst p = 2\nconst q = 3\nconst b = 4\n'
  const edits = derive(before, after)

  expect(edits).toHaveLength(2)
  expect(edits[0]!.range.end).toBeLessThan(edits[1]!.range.start)
  expect(roundTrips(before, after)).toBe(true)
})

test('two changes on adjacent lines stay separate rather than merging into one hunk', () => {
  const before = 'let a = 1\nlet b = 2\n'
  const after = 'const a = 1\nconst b = 2\n'
  const edits = derive(before, after)

  expect(edits).toHaveLength(2)
  expect(roundTrips(before, after)).toBe(true)
})

test('an inserted line is a zero-width edit at the insertion point', () => {
  const edits = derive('a\nc\n', 'a\nb\nc\n')

  expect(edits).toHaveLength(1)
  expect(edits[0]!.range.start).toBe(edits[0]!.range.end)
  expect(edits[0]!.replacement).toBe('b\n')
  expect(roundTrips('a\nc\n', 'a\nb\nc\n')).toBe(true)
})

test('a deleted line is an empty replacement over its whole range', () => {
  const edits = derive('a\ngone\nc\n', 'a\nc\n')

  expect(edits).toHaveLength(1)
  expect(edits[0]!.replacement).toBe('')
  expect(roundTrips('a\ngone\nc\n', 'a\nc\n')).toBe(true)
})

test('a replacement sharing a prefix and a suffix with the original is trimmed on both sides', () => {
  const edits = derive('const spread = [...[1, 2]]\n', 'const spread = [1, 2]\n')

  expect(edits).toHaveLength(1)
  expect(roundTrips('const spread = [...[1, 2]]\n', 'const spread = [1, 2]\n')).toBe(true)
  expect(edits[0]!.range.start).toBeGreaterThan(0)
})

test('overlapping prefix and suffix (aXa -> aa) does not produce an inverted range', () => {
  const edits = derive('aXa\n', 'aa\n')

  expect(edits[0]!.range.end).toBeGreaterThanOrEqual(edits[0]!.range.start)
  expect(roundTrips('aXa\n', 'aa\n')).toBe(true)
})

test('multi-byte content before a change does not shift the derived offsets', () => {
  const before = 'const s = "héllo 🚀"\nif (a == 1) {}\n'
  const after = 'const s = "héllo 🚀"\nif (a === 1) {}\n'
  const edits = derive(before, after)

  expect(edits).toHaveLength(1)
  expect(roundTrips(before, after)).toBe(true)
  expect(edits[0]!.range.start).toBeGreaterThan(before.indexOf('if (a'))
})

test('a change inside a multi-byte character sequence keeps the range on a character boundary', () => {
  const before = 'const e = "🚀"\n'
  const after = 'const e = "🌍"\n'

  expect(roundTrips(before, after)).toBe(true)
})

test('a file with no trailing newline round-trips', () => {
  expect(roundTrips('let a = 1', 'const a = 1')).toBe(true)
})

test('gaining a trailing newline round-trips', () => {
  expect(roundTrips('let a = 1', 'let a = 1\n')).toBe(true)
})

test('losing a trailing newline round-trips', () => {
  expect(roundTrips('let a = 1\n', 'let a = 1')).toBe(true)
})

test('CRLF content round-trips without rewriting the untouched lines', () => {
  const before = 'a\r\nlet b = 1\r\nc\r\n'
  const after = 'a\r\nconst b = 1\r\nc\r\n'

  expect(derive(before, after)).toHaveLength(1)
  expect(roundTrips(before, after)).toBe(true)
})

test('an emptied buffer round-trips', () => {
  expect(roundTrips('a\nb\n', '')).toBe(true)
})

test('a buffer filled from empty round-trips', () => {
  expect(roundTrips('', 'a\nb\n')).toBe(true)
})

test('a wholesale rewrite round-trips', () => {
  expect(roundTrips('a\nb\nc\n', 'x\ny\nz\nw\n')).toBe(true)
})

test('the derived edits never overlap each other', () => {
  const before = Array.from({ length: 40 }, (_unused, i) => `let v${i} = ${i}`).join('\n')
  const after = before.replaceAll('let ', 'const ')
  const edits = derive(before, after)

  const sorted = [...edits].sort((a, b) => a.range.start - b.range.start)
  for (let i = 1; i < sorted.length; i += 1) {
    expect(sorted[i]!.range.start).toBeGreaterThanOrEqual(sorted[i - 1]!.range.end)
  }
  expect(edits).toHaveLength(40)
  expect(roundTrips(before, after)).toBe(true)
})

test('a change amid many identical lines round-trips', () => {
  const before = `${'same\n'.repeat(50)}target\n${'same\n'.repeat(50)}`
  const after = `${'same\n'.repeat(50)}changed\n${'same\n'.repeat(50)}`

  expect(roundTrips(before, after)).toBe(true)
})
