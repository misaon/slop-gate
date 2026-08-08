import type { ByteRange } from './types.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type LineIndex = {
  positionAt(byteOffset: number): { line: number; column: number }
  offsetAt(position: { line: number; column: number }): number
  offsetAtCodepointColumn(position: { line: number; column: number }): number
  lineRangeOf(range: ByteRange): ByteRange
  sliceBytes(range: ByteRange): string
  rangeOfLine(line: number): ByteRange
}

export function createLineIndex(source: string): LineIndex {
  const bytes = encoder.encode(source)
  const lineStarts = [0]
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0x0A) lineStarts.push(i + 1)
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
      const prefix = decoder.decode(bytes.subarray(lineStarts[line], clamped))
      return { line: line + 1, column: prefix.length + 1 }
    },
    offsetAt(position) {
      const index = Math.max(0, Math.min(position.line - 1, lineStarts.length - 1))
      const lineStart = lineStarts[index]!
      const nextLineStart = lineStarts[index + 1]
      const lineEnd = nextLineStart === undefined ? bytes.length : nextLineStart - 1
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
