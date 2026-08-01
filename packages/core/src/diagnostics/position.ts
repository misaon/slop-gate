import type { ByteRange } from './types.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type LineIndex = {
  positionAt(byteOffset: number): { line: number; column: number }
  lineRangeOf(range: ByteRange): ByteRange
  sliceBytes(range: ByteRange): string
  /**
   * The byte range of one whole 1-based source line, trailing newline excluded — the same
   * convention `lineRangeOf` uses, just keyed by line number instead of an existing byte range. For
   * a diagnostic synthesised from a source *line* rather than an engine's byte offsets (inline
   * suppression directives are found by scanning line by line; see `suppressions/parse.ts`), this is
   * the inverse of `positionAt`: it turns a line number back into the range `positionAt` would map
   * back to that line. Clamped to the last real line rather than throwing, matching `positionAt`'s
   * own out-of-range handling — a `disable-next-line` on a file's final line names a line number one
   * past the end, and that must produce a usable (if slightly imprecise) range, not an exception.
   */
  rangeOfLine(line: number): ByteRange
}

export function createLineIndex(source: string): LineIndex {
  const bytes = encoder.encode(source)
  const lineStarts = [0]
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0x0a) lineStarts.push(i + 1)
  }

  const lineIndexAt = (byteOffset: number): number => {
    let low = 0
    let high = lineStarts.length - 1
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if (lineStarts[mid]! <= byteOffset) low = mid
      else high = mid - 1
    }
    return low
  }

  return {
    positionAt(byteOffset) {
      const clamped = Math.max(0, Math.min(byteOffset, bytes.length))
      const line = lineIndexAt(clamped)
      const prefix = decoder.decode(bytes.subarray(lineStarts[line]!, clamped))
      return { line: line + 1, column: prefix.length + 1 }
    },
    lineRangeOf(range) {
      const startLine = lineIndexAt(Math.max(0, Math.min(range.start, bytes.length)))
      const endLine = lineIndexAt(Math.max(0, Math.min(range.end, bytes.length)))
      const nextLineStart = lineStarts[endLine + 1]
      return {
        start: lineStarts[startLine]!,
        end: nextLineStart === undefined ? bytes.length : nextLineStart - 1,
      }
    },
    sliceBytes(range) {
      const start = Math.max(0, Math.min(range.start, bytes.length))
      const end = Math.max(start, Math.min(range.end, bytes.length))
      return decoder.decode(bytes.subarray(start, end))
    },

    rangeOfLine(line) {
      const index = Math.max(0, Math.min(line - 1, lineStarts.length - 1))
      const start = lineStarts[index]!
      const nextLineStart = lineStarts[index + 1]
      return { start, end: nextLineStart === undefined ? bytes.length : nextLineStart - 1 }
    },
  }
}
