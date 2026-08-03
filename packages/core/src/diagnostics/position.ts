import type { ByteRange } from './types.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type LineIndex = {
  positionAt(byteOffset: number): { line: number; column: number }
  /**
   * The inverse of `positionAt`: a 1-based line and a 1-based **UTF-16-code-unit** column back to a byte offset.
   * Needed by any engine that reports positions as text rather than byte spans — `tsc`'s plain-text diagnostics
   * are the first such source (see `@misaon/slop-gate-engine-tsc`'s `parse.ts`); oxlint hands back byte offsets
   * directly and never calls this. Clamped, never throwing: an out-of-range line or column produces a usable (if
   * imprecise) offset, because a malformed engine report is not a reason to crash the whole run.
   */
  offsetAt(position: { line: number; column: number }): number
  /**
   * The same conversion as `offsetAt`, for an engine whose columns count **Unicode codepoints** rather than UTF-16
   * code units. Biome is the first such source (see `@misaon/slop-gate-engine-biome-css`'s `parse.ts`); `tsc` and
   * every LSP-shaped tool are not.
   *
   * A separate entry point rather than a flag on `offsetAt`, because the two units are indistinguishable on every
   * input that does not contain an astral character — the whole BMP agrees — so a single function taking a unit
   * argument would be silently correct in every test anybody thought to write and wrong on the one file with an
   * emoji in a `content:` string. Nor is passing codepoint columns to `offsetAt` a rounding error: it lands N bytes
   * early for N astral characters earlier on the line, and the diagnostic then points into a neighbouring token.
   */
  offsetAtCodepointColumn(position: { line: number; column: number }): number
  lineRangeOf(range: ByteRange): ByteRange
  sliceBytes(range: ByteRange): string
  /**
   * The byte range of one whole 1-based source line, trailing newline excluded — the same convention `lineRangeOf`
   * uses, keyed by line number instead of by an existing byte range. For a diagnostic synthesised from a source
   * *line* rather than an engine's byte offsets (inline suppression directives are found by scanning line by line;
   * see `suppressions/parse.ts`). Clamped to the last real line rather than throwing: a `disable-next-line` on a
   * file's final line names a line number one past the end, and that must produce a usable range.
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
    offsetAt(position) {
      const index = Math.max(0, Math.min(position.line - 1, lineStarts.length - 1))
      const lineStart = lineStarts[index]!
      const nextLineStart = lineStarts[index + 1]
      const lineEnd = nextLineStart === undefined ? bytes.length : nextLineStart - 1
      // Slicing this line by UTF-16 code units and measuring the UTF-8 byte length of the slice is what makes this
      // the exact inverse of `positionAt`'s `prefix.length + 1`, for every multi-byte character before the column.
      const lineText = decoder.decode(bytes.subarray(lineStart, lineEnd))
      const prefix = lineText.slice(0, Math.max(0, position.column - 1))
      return lineStart + encoder.encode(prefix).length
    },
    offsetAtCodepointColumn(position) {
      const index = Math.max(0, Math.min(position.line - 1, lineStarts.length - 1))
      const lineStart = lineStarts[index]!
      const nextLineStart = lineStarts[index + 1]
      const lineEnd = nextLineStart === undefined ? bytes.length : nextLineStart - 1
      const lineText = decoder.decode(bytes.subarray(lineStart, lineEnd))
      // `[...lineText]` iterates codepoints, so an astral character contributes one element here where
      // `lineText.slice` above would have counted its two surrogates separately.
      const prefix = [...lineText].slice(0, Math.max(0, position.column - 1)).join('')
      return lineStart + encoder.encode(prefix).length
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
