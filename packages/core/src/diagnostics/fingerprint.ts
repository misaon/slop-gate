import { createHash } from 'node:crypto'
import type { ByteRange } from './types.ts'
import type { LineIndex } from './position.ts'

export type FingerprintInput = {
  concept: string
  file: string
  window: string
  occurrenceIndex: number
}

export function normalizedWindow(index: LineIndex, range: ByteRange): string {
  return index.sliceBytes(index.lineRangeOf(range)).replaceAll(/\s+/g, ' ').trim()
}

export function fingerprint(input: FingerprintInput): string {
  return createHash('sha256')
    .update([input.concept, input.file, input.window, String(input.occurrenceIndex)].join('\0'))
    .digest('hex')
    .slice(0, 32)
}
