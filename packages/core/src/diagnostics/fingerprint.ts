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
  const index = createLineIndex(input.source)
  const window = index.sliceBytes(index.lineRangeOf(input.range))
  const normalized = window.replace(/\s+/g, ' ').trim()

  return createHash('sha256')
    .update([input.concept, input.file, normalized, String(input.occurrenceIndex)].join('\0'))
    .digest('hex')
    .slice(0, 32)
}
