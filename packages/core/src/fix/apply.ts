import { rangesConflict } from './arbitrate.ts'
import type { CandidateEdit } from './types.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const encodeUtf8 = (text: string): Uint8Array => encoder.encode(text)
export const decodeUtf8 = (bytes: Uint8Array): string => decoder.decode(bytes)

/**
 * Spec §11 step 3: apply an arbitrated edit set in reverse offset order into an in-memory buffer.
 *
 * **The buffer is bytes, not a string, and that is the whole point of this function.** Engine ranges
 * are byte offsets into the file's UTF-8 encoding (spec §10) while a JavaScript string indexes
 * UTF-16 code units, so `source.slice(edit.range.start, edit.range.end)` is correct only for a file
 * that is pure ASCII and silently mangles every other one — the further into the file a finding is,
 * and the more non-ASCII text precedes it, the further off the cut lands. Splicing `Uint8Array`s
 * makes the two units agree by never converting the file at all; only the replacement text is
 * encoded, and only at the point where it is inserted.
 *
 * Reverse order is what lets every edit keep the offsets it was derived with: splicing from the end
 * backwards means no earlier edit's range has moved by the time it is applied, so a pass never has
 * to rebase anything. It also means the caller's edits must all come from *one* version of the
 * buffer, which is why the fix loop re-runs the engines between passes instead of reusing a previous
 * pass's ranges.
 *
 * Both invariants `arbitrateEdits` is supposed to guarantee — in range, non-overlapping — are
 * re-asserted here and throw rather than being repaired. This function is the last thing between an
 * engine's arithmetic and the user's source file: a range that got here wrong is a defect to
 * surface, and clamping or reordering it would write bytes nobody chose while reporting success.
 */
export function applyEdits(buffer: Uint8Array, edits: readonly CandidateEdit[]): Uint8Array {
  if (edits.length === 0) return buffer

  const ordered = [...edits].sort((a, b) => b.range.start - a.range.start || b.range.end - a.range.end)

  for (const [index, edit] of ordered.entries()) {
    const { start, end } = edit.range
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > buffer.length) {
      throw new Error(
        `fix edit from ${edit.ruleId} is out of range for ${edit.file}: [${start}, ${end}) in a ${buffer.length}-byte buffer`,
      )
    }
    const next = ordered[index + 1]
    if (next !== undefined && rangesConflict(next.range, edit.range)) {
      throw new Error(
        `fix edits from ${next.ruleId} and ${edit.ruleId} overlap in ${edit.file}: ` +
          `[${next.range.start}, ${next.range.end}) and [${start}, ${end})`,
      )
    }
  }

  let result = buffer
  for (const edit of ordered) {
    const replacement = encodeUtf8(edit.replacement)
    const next = new Uint8Array(result.length - (edit.range.end - edit.range.start) + replacement.length)
    next.set(result.subarray(0, edit.range.start), 0)
    next.set(replacement, edit.range.start)
    next.set(result.subarray(edit.range.end), edit.range.start + replacement.length)
    result = next
  }
  return result
}
