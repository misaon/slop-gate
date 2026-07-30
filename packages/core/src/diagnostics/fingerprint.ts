import { createHash } from 'node:crypto'
import type { ByteRange } from './types.ts'
import { createLineIndex } from './position.ts'

export type FingerprintInput = {
  concept: string
  file: string
  source: string
  range: ByteRange
  occurrenceIndex: number
}

export function fingerprint(input: FingerprintInput): string {
  const lineRange = createLineIndex(input.source).lineRangeOf(input.range)
  const window = Buffer.from(input.source, 'utf8')
    .subarray(lineRange.start, lineRange.end)
    .toString('utf8')
  const normalized = window.replace(/\s+/g, ' ').trim()

  return createHash('sha256')
    .update([input.concept, input.file, normalized, String(input.occurrenceIndex)].join('\0'))
    .digest('hex')
    .slice(0, 32)
}
