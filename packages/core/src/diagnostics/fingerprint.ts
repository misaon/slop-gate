import { createHash } from 'node:crypto'
import type { ByteRange } from './types.ts'
import type { LineIndex } from './position.ts'

export type FingerprintInput = {
  concept: string
  file: string
  /** `normalizedWindow`'s output for this diagnostic's range. */
  window: string
  /**
   * Which of the identically-windowed findings in this file this is (spec §10.1). Counted over
   * `(concept, file, window)` by the caller, *not* over `(concept, file)`: findings on textually different lines
   * are already told apart by their windows, so numbering them in arrival order made the fingerprint depend on the
   * order the engine happened to emit them in — real instability for an engine whose order is not fixed (actionlint
   * iterates a workflow's jobs over a Go map, whose order is randomised), producing churn indistinguishable from a
   * genuine change: the same finding set, different fingerprints, on the very next run.
   */
  occurrenceIndex: number
}

/**
 * The diagnostic's range expanded to whole lines with runs of whitespace collapsed — the only thing a fingerprint
 * knows about *where* a finding is. Line and column numbers are deliberately not hashed, so a fingerprint survives
 * reformatting and unrelated edits above the finding (spec §10.1). The cost is the mirror image: a finding
 * re-attributed to a different line *is* a different fingerprint, because the line it quotes has different text.
 *
 * Takes a `LineIndex` rather than the file's source, because every caller normalizes a whole file's worth of
 * diagnostics and already holds one.
 */
export function normalizedWindow(index: LineIndex, range: ByteRange): string {
  return index.sliceBytes(index.lineRangeOf(range)).replace(/\s+/g, ' ').trim()
}

export function fingerprint(input: FingerprintInput): string {
  return createHash('sha256')
    .update([input.concept, input.file, input.window, String(input.occurrenceIndex)].join('\0'))
    .digest('hex')
    .slice(0, 32)
}
