import { open } from 'node:fs/promises'
import type { AdvisoryRecord, AdvisoryTable } from './advisory.ts'

/**
 * The on-disk layout — see docs/measurements.md#keyed-table for why it exists.
 *
 * `.idx`, read whole and never decoded to a string:
 *
 *     u32          magic
 *     u32          count
 *     u32[count+1] nameStart, into the name blob; the extra entry is the blob's length
 *     u32[count+1] recordStart, into the `.rec` file; the extra entry is that file's length
 *     bytes        every name concatenated in sort order, no separators — the offsets delimit them
 *
 * `.rec`, read positionally: each name's records as JSON, concatenated in the same order.
 */
const KEYED_TABLE_MAGIC = 0x53474D49

const HEADER_BYTES = 8

export type KeyedTableFiles = { readonly index: Uint8Array; readonly records: Uint8Array }

/** The reader binary-searches raw UTF-8, so the writer must order by the same comparison. */
function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const shared = Math.min(a.length, b.length)
  for (let offset = 0; offset < shared; offset += 1) {
    const difference = a[offset]! - b[offset]!
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

export function buildKeyedTable(table: AdvisoryTable): KeyedTableFiles {
  const encoder = new TextEncoder()
  const sorted = Object.keys(table)
    .map((name) => ({ name, bytes: encoder.encode(name) }))
    .sort((left, right) => compareBytes(left.bytes, right.bytes))

  const names = sorted.map((entry) => entry.name)
  const nameBytes = sorted.map((entry) => entry.bytes)
  const recordBytes = names.map((name) => encoder.encode(JSON.stringify(table[name] ?? [])))

  const nameBlobLength = nameBytes.reduce((total, entry) => total + entry.length, 0)
  const recordsLength = recordBytes.reduce((total, entry) => total + entry.length, 0)

  const offsetsBytes = (names.length + 1) * 8
  const index = new Uint8Array(HEADER_BYTES + offsetsBytes + nameBlobLength)
  const view = new DataView(index.buffer)

  view.setUint32(0, KEYED_TABLE_MAGIC, true)
  view.setUint32(4, names.length, true)

  const nameStartAt = HEADER_BYTES
  const recordStartAt = nameStartAt + (names.length + 1) * 4
  const blobAt = recordStartAt + (names.length + 1) * 4

  let nameOffset = 0
  let recordOffset = 0
  for (let i = 0; i < names.length; i += 1) {
    view.setUint32(nameStartAt + i * 4, nameOffset, true)
    view.setUint32(recordStartAt + i * 4, recordOffset, true)
    index.set(nameBytes[i]!, blobAt + nameOffset)
    nameOffset += nameBytes[i]!.length
    recordOffset += recordBytes[i]!.length
  }
  view.setUint32(nameStartAt + names.length * 4, nameOffset, true)
  view.setUint32(recordStartAt + names.length * 4, recordOffset, true)

  const records = new Uint8Array(recordsLength)
  let cursor = 0
  for (const entry of recordBytes) {
    records.set(entry, cursor)
    cursor += entry.length
  }

  return { index, records }
}

export class KeyedTableFormatError extends Error {
  override readonly name = 'KeyedTableFormatError'
}

export type KeyedTable = {
  lookup(name: string): Promise<readonly AdvisoryRecord[]>
  close(): Promise<void>
}

export async function openKeyedTable(indexBytes: Uint8Array, recordsPath: string): Promise<KeyedTable> {
  const view = new DataView(indexBytes.buffer, indexBytes.byteOffset, indexBytes.byteLength)
  if (indexBytes.byteLength < HEADER_BYTES || view.getUint32(0, true) !== KEYED_TABLE_MAGIC) {
    throw new KeyedTableFormatError('not a slop-gate keyed advisory index')
  }

  const count = view.getUint32(4, true)
  const nameStartAt = HEADER_BYTES
  const recordStartAt = nameStartAt + (count + 1) * 4
  const blobAt = recordStartAt + (count + 1) * 4
  if (indexBytes.byteLength < blobAt) throw new KeyedTableFormatError('advisory index is truncated')

  const nameStart = (i: number): number => view.getUint32(nameStartAt + i * 4, true)
  const recordStart = (i: number): number => view.getUint32(recordStartAt + i * 4, true)

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let handle: Awaited<ReturnType<typeof open>> | null = null

  const compareAt = (i: number, query: Uint8Array): number => {
    const from = blobAt + nameStart(i)
    const length = nameStart(i + 1) - nameStart(i)
    const shared = Math.min(length, query.length)
    for (let offset = 0; offset < shared; offset += 1) {
      const difference = indexBytes[from + offset]! - query[offset]!
      if (difference !== 0) return difference
    }
    return length - query.length
  }

  return {
    async lookup(name) {
      const query = encoder.encode(name)
      let low = 0
      let high = count - 1
      let found = -1
      while (low <= high) {
        const mid = (low + high) >> 1
        const order = compareAt(mid, query)
        if (order === 0) {
          found = mid
          break
        }
        if (order < 0) low = mid + 1
        else high = mid - 1
      }
      if (found === -1) return []

      const from = recordStart(found)
      const length = recordStart(found + 1) - from
      if (length === 0) return []

      handle ??= await open(recordsPath, 'r')
      const buffer = new Uint8Array(length)
      await handle.read(buffer, 0, length, from)
      return JSON.parse(decoder.decode(buffer)) as readonly AdvisoryRecord[]
    },
    async close() {
      await handle?.close()
      handle = null
    },
  }
}
