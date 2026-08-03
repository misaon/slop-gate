import type { Edit } from '../diagnostics/types.ts'
import { alignLines } from './align.ts'
import { decodeUtf8 } from './apply.ts'

type SourceLine = { readonly text: string; readonly start: number; readonly end: number }

/** Splits into lines keeping each one's terminator, so byte ranges reconstruct the buffer exactly. */
function splitLines(buffer: Uint8Array): SourceLine[] {
  const lines: SourceLine[] = []
  let start = 0
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 0x0a) {
      lines.push({ text: decodeUtf8(buffer.subarray(start, i + 1)), start, end: i + 1 })
      start = i + 1
    }
  }
  if (start < buffer.length) lines.push({ text: decodeUtf8(buffer.subarray(start)), start, end: buffer.length })
  return lines
}

/**
 * Byte ranges are what this function is for, so two lines are the same when their *text* is —
 * `unifiedDiff`'s stricter comparison, which also weighs trailing-newline status, would be wrong here
 * because a `SourceLine` keeps its own terminator in `text` already.
 */
const sameText = (a: SourceLine, b: SourceLine): boolean => a.text === b.text

/**
 * Recovers a set of byte-ranged edits from a before/after pair of buffers.
 *
 * This exists for an engine that cannot describe its own fixes and can only *perform* them —
 * oxlint 1.76.0 being the case in hand (see `engine-oxlint/src/derive-fixes.ts`, and the note in
 * spec §13 for the evidence that none of its five output formats carries fix data). Running such an
 * engine over a copy and diffing the result is the only way to obtain the `(range, replacement)`
 * pairs spec §11 step 1 needs, and the alternative — handing the whole rewritten buffer to the fix
 * pipeline — would bypass overlap arbitration entirely, which is the one thing the pipeline exists
 * to do.
 *
 * **Tight ranges are the point, not a nicety.** A single edit spanning from the first change to the
 * last would conflict with every other rule's edit in between and drop them all, so a file with two
 * interleaved rules would converge one rule per pass, or not at all inside the pass limit. Hunks are
 * therefore separated per contiguous run of changed lines, then narrowed to the exact differing bytes
 * within each. That narrowing also makes an edit's range describe what it actually rewrites, which is
 * what the caller's own conflict detection is reasoning about.
 */
export function editsFromRewrite(before: Uint8Array, after: Uint8Array): Edit[] {
  const oldLines = splitLines(before)
  const newLines = splitLines(after)
  const { head, tail, oldWindow, newWindow, steps } = alignLines(oldLines, newLines, sameText)
  if (oldWindow.length === 0 && newWindow.length === 0) return []

  // Where a pure insertion or deletion lands when its window is empty on one side.
  const anchor =
    oldWindow[0]?.start ?? oldLines[head - 1]?.end ?? oldLines[oldLines.length - tail]?.start ?? before.length

  // Window too large to align: one edit over the whole of it. Correct, just not minimal — and the
  // reason `align.ts` picks the higher of the two bounds it inherited, since *this* is the fallback
  // that costs something.
  if (steps === null) {
    return [narrowEditToChangedBytes(before, oldWindow[0]?.start ?? anchor, oldWindow.at(-1)?.end ?? anchor, newWindow.map((l) => l.text).join(''))]
  }

  const edits: Edit[] = []
  let removed: SourceLine[] = []
  let added: string[] = []
  let pendingAt: number | null = null

  /**
   * Emits the accumulated run of changed lines.
   *
   * **One edit per line pair when the counts match**, rather than one edit for the whole run. A run
   * of forty consecutive `let` → `const` lines is one contiguous hunk to a line differ, and emitting
   * it as a single edit spanning forty lines would make every other rule's edit anywhere in those
   * forty lines an overlap loser — a file would then converge one rule per pass, if at all inside
   * the pass limit. Pairing is only valid when nothing was inserted or deleted, which is exactly
   * when line *i* of the run corresponds to line *i* of its replacement; otherwise the run stays
   * whole, because there is no correspondence to key on.
   */
  const flush = (): void => {
    if (removed.length === 0 && added.length === 0) return
    if (removed.length === added.length) {
      removed.forEach((line, index) => edits.push(narrowEditToChangedBytes(before, line.start, line.end, added[index]!)))
    } else {
      const start = removed[0]?.start ?? pendingAt ?? anchor
      const end = removed.at(-1)?.end ?? start
      edits.push(narrowEditToChangedBytes(before, start, end, added.join('')))
    }
    removed = []
    added = []
    pendingAt = null
  }

  let cursor = anchor
  for (const step of steps) {
    if (step.kind === 'same') {
      flush()
      cursor = step.line.end
      continue
    }
    if (step.kind === 'removed') {
      removed.push(step.line)
      cursor = step.line.end
      continue
    }
    if (removed.length === 0 && pendingAt === null) pendingAt = cursor
    added.push(step.line.text)
  }
  flush()

  return edits
}

/** A UTF-8 continuation byte, `10xxxxxx`. Never a legal place to cut. */
const isContinuation = (byte: number | undefined): boolean => byte !== undefined && (byte & 0xc0) === 0x80

/**
 * Trimming the suffix before the prefix would be wrong when the two overlap (`aXa` → `aa`), so the
 * suffix walk is bounded by what the prefix already consumed on both sides.
 *
 * **Both cuts are then pushed back to a UTF-8 character boundary, and that is a correctness fix
 * rather than tidiness.** Two different emoji share leading bytes — U+1F680 is `F0 9F 9A 80`, U+1F30D
 * is `F0 9F 8C 8D` — so a byte-wise common-prefix walk stops *inside* the character, and decoding
 * from there yields U+FFFD on both sides: the range would name a partial character and the
 * replacement would contain a replacement character. That is a corrupted file written with every
 * other check passing. Found by the round-trip test over `"\u{1F680}"` becoming `"\u{1F30D}"`, not by
 * inspection.
 */
function narrowEditToChangedBytes(before: Uint8Array, start: number, end: number, replacement: string): Edit {
  const removed = before.subarray(start, end)
  const inserted = new TextEncoder().encode(replacement)

  let prefix = 0
  while (prefix < removed.length && prefix < inserted.length && removed[prefix] === inserted[prefix]) prefix += 1
  while (prefix > 0 && (isContinuation(removed[prefix]) || isContinuation(inserted[prefix]))) prefix -= 1

  let suffix = 0
  while (
    suffix < removed.length - prefix &&
    suffix < inserted.length - prefix &&
    removed[removed.length - 1 - suffix] === inserted[inserted.length - 1 - suffix]
  ) {
    suffix += 1
  }
  while (
    suffix > 0 &&
    (isContinuation(removed[removed.length - suffix]) || isContinuation(inserted[inserted.length - suffix]))
  ) {
    suffix -= 1
  }

  return {
    range: { start: start + prefix, end: end - suffix },
    replacement: decodeUtf8(inserted.subarray(prefix, inserted.length - suffix)),
  }
}
