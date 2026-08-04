import { expect, test } from 'vitest'
import { applyEdits, decodeUtf8, encodeUtf8 } from './apply.ts'
import { editsFromRewrite } from './derive.ts'
import { unifiedDiff } from './diff.ts'
import type { CandidateEdit } from './types.ts'

const BAND_LINES = 1200
const SHARED_LINE_INDEX = 600

const band = (): { before: string; after: string; shared: string } => {
  const before = Array.from({ length: BAND_LINES }, (_unused, i) => `let v${i} = ${i}`)
  const after = before.map((line, i) => (i === SHARED_LINE_INDEX ? line : line.replace('let ', 'const ')))
  return { before: `${before.join('\n')}\n`, after: `${after.join('\n')}\n`, shared: before[SHARED_LINE_INDEX]! }
}

const overBand = (): { before: string; after: string } => {
  const before = Array.from({ length: 2100 }, (_unused, i) => `let v${i} = ${i}`)
  const after = before.map((line, i) => (i === SHARED_LINE_INDEX ? line : line.replace('let ', 'const ')))
  return { before: `${before.join('\n')}\n`, after: `${after.join('\n')}\n` }
}

const asCandidates = (edits: ReturnType<typeof editsFromRewrite>): CandidateEdit[] =>
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

test('a window between the two old bounds is aligned minimally by the preview and the edits alike', () => {
  const { before, after, shared } = band()

  const diff = unifiedDiff('src/a.ts', encodeUtf8(before), encodeUtf8(after))
  const edits = editsFromRewrite(encodeUtf8(before), encodeUtf8(after))

  expect(diff.split('\n')).toContain(` ${shared}`)
  expect(edits).toHaveLength(BAND_LINES - 1)
  expect(decodeUtf8(applyEdits(encodeUtf8(before), asCandidates(edits)))).toBe(after)
})

test('a window past the shared bound falls back on both sides, so the bound still exists', () => {
  const { before, after } = overBand()

  const diff = unifiedDiff('src/a.ts', encodeUtf8(before), encodeUtf8(after))
  const edits = editsFromRewrite(encodeUtf8(before), encodeUtf8(after))

  expect(diff.split('\n').filter((line) => line.startsWith(' '))).toEqual([])
  expect(edits).toHaveLength(1)
  expect(decodeUtf8(applyEdits(encodeUtf8(before), asCandidates(edits)))).toBe(after)
})
