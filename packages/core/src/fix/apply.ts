import { rangesConflict } from './arbitrate.ts'
import type { CandidateEdit } from './types.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const encodeUtf8 = (text: string): Uint8Array => encoder.encode(text)
export const decodeUtf8 = (bytes: Uint8Array): string => decoder.decode(bytes)

export function applyEdits(buffer: Uint8Array, edits: readonly CandidateEdit[]): Uint8Array {
  if (edits.length === 0) return buffer

  const ordered = [...edits].sort((a, b) => b.range.start - a.range.start || b.range.end - a.range.end)

  for (const [index, edit] of ordered.entries()) {
    const { start, end } = edit.range
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > buffer.length) {
      throw new Error(
        `fix edit from ${edit.ruleRefKey} is out of range for ${edit.file}: [${start}, ${end}) in a ${buffer.length}-byte buffer`,
      )
    }
    const next = ordered[index + 1]
    if (next !== undefined && rangesConflict(next.range, edit.range)) {
      throw new Error(
        `fix edits from ${next.ruleRefKey} and ${edit.ruleRefKey} overlap in ${edit.file}: ` +
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
