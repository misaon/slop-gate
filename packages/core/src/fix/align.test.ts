import { expect, test } from 'vitest'
import { applyEdits, decodeUtf8, encodeUtf8 } from './apply.ts'
import { editsFromRewrite } from './derive.ts'
import { unifiedDiff } from './diff.ts'
import type { CandidateEdit } from './types.ts'

/**
 * A rewrite whose LCS window lands between 1,000,000 and 4,000,000 cells.
 *
 * That band is where `unifiedDiff` and `editsFromRewrite` used to disagree, each carrying its own
 * copy of the same trimmed line-LCS and its own `MAX_CELLS` — 4,000,000 in `diff.ts`, 1,000,000 in
 * `derive.ts`. A rewrite in here got a minimal diff out of `sgate fix --dry-run` and a coarse
 * whole-window replacement out of the fix that actually ran: the preview and the applied edit
 * disagreeing in shape, on the one code path that rewrites a user's source.
 *
 * 1200 x 1200 = 1,440,000 cells. Every line differs except one in the middle, which is what keeps
 * the head/tail trim from shrinking the window (line 0 and line 1199 both differ) and gives the
 * alignment exactly one match to find — so a minimal result and a coarse one are sharply different
 * shapes rather than nearly the same one.
 */
const BAND_LINES = 1200
const SHARED_LINE_INDEX = 600

const band = (): { before: string; after: string; shared: string } => {
  const before = Array.from({ length: BAND_LINES }, (_unused, i) => `let v${i} = ${i}`)
  const after = before.map((line, i) => (i === SHARED_LINE_INDEX ? line : line.replace('let ', 'const ')))
  return { before: `${before.join('\n')}\n`, after: `${after.join('\n')}\n`, shared: before[SHARED_LINE_INDEX]! }
}

/** Above the shared bound on both sides: 2100 x 2100 = 4,410,000 cells. */
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

  // The preview keeps the one unchanged line as context rather than rendering it as a removal and an
  // addition, which is what taking the coarse path would look like.
  expect(diff.split('\n')).toContain(` ${shared}`)
  // The edits are per changed line, not one edit spanning the whole window — the difference that
  // decides whether another rule's edit in these 1200 lines survives overlap arbitration.
  expect(edits).toHaveLength(BAND_LINES - 1)
  expect(decodeUtf8(applyEdits(encodeUtf8(before), asCandidates(edits)))).toBe(after)
})

test('a window past the shared bound falls back on both sides, so the bound still exists', () => {
  const { before, after } = overBand()

  const diff = unifiedDiff('src/a.ts', encodeUtf8(before), encodeUtf8(after))
  const edits = editsFromRewrite(encodeUtf8(before), encodeUtf8(after))

  // No context line survives the coarse path: every old line is a removal, every new one an addition.
  expect(diff.split('\n').filter((line) => line.startsWith(' '))).toEqual([])
  expect(edits).toHaveLength(1)
  expect(decodeUtf8(applyEdits(encodeUtf8(before), asCandidates(edits)))).toBe(after)
})
