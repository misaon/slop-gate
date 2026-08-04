import { inflateRawSync } from 'node:zlib'

export class ZipFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipFormatError'
  }
}

export type ZipEntry = {
  readonly name: string
  readonly data: Uint8Array
}

const EOCD_SIGNATURE = 0x0605_4b50
const EOCD64_LOCATOR_SIGNATURE = 0x0706_4b50
const EOCD64_SIGNATURE = 0x0606_4b50
const CENTRAL_SIGNATURE = 0x0201_4b50
const LOCAL_SIGNATURE = 0x0403_4b50

const EOCD_SIZE = 22
const EOCD64_LOCATOR_SIZE = 20
const CENTRAL_FIXED_SIZE = 46
const LOCAL_FIXED_SIZE = 30
const MAX_COMMENT = 0xff_ff
const U16_SENTINEL = 0xff_ff
const U32_SENTINEL = 0xffff_ffff
const ZIP64_EXTRA_ID = 0x0001

const STORED = 0
const DEFLATED = 8

export function* readZipEntries(archive: Uint8Array): Generator<ZipEntry> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  const directory = locateCentralDirectory(archive, view)

  let offset = directory.offset
  for (let index = 0; index < directory.entryCount; index++) {
    if (offset + CENTRAL_FIXED_SIZE > archive.length) {
      throw new ZipFormatError(`central directory entry ${index} runs past the end of the archive`)
    }
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new ZipFormatError(`expected a central directory header at byte ${offset}`)
    }

    const method = view.getUint16(offset + 10, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const name = new TextDecoder().decode(archive.subarray(offset + CENTRAL_FIXED_SIZE, offset + CENTRAL_FIXED_SIZE + nameLength))

    const extra = archive.subarray(offset + CENTRAL_FIXED_SIZE + nameLength, offset + CENTRAL_FIXED_SIZE + nameLength + extraLength)
    const sizes = resolveZip64Sizes(view, offset, extra)

    if (!name.endsWith('/')) {
      yield { name, data: readLocalEntry(archive, view, sizes.localOffset, method, sizes.compressedSize, name) }
    }

    offset += CENTRAL_FIXED_SIZE + nameLength + extraLength + commentLength
  }
}

type CentralDirectory = { readonly offset: number; readonly entryCount: number }

function locateCentralDirectory(archive: Uint8Array, view: DataView): CentralDirectory {
  const eocd = findEocd(archive, view)
  let entryCount = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)

  if (entryCount !== U16_SENTINEL && offset !== U32_SENTINEL) return { offset, entryCount }

  const locator = eocd - EOCD64_LOCATOR_SIZE
  if (locator < 0 || view.getUint32(locator, true) !== EOCD64_LOCATOR_SIGNATURE) {
    throw new ZipFormatError('the archive needs ZIP64 but carries no ZIP64 end-of-central-directory locator')
  }
  const eocd64 = readU64(view, locator + 8)
  if (eocd64 + 56 > archive.length || view.getUint32(eocd64, true) !== EOCD64_SIGNATURE) {
    throw new ZipFormatError('the ZIP64 locator does not point at a ZIP64 end-of-central-directory record')
  }
  entryCount = readU64(view, eocd64 + 32)
  offset = readU64(view, eocd64 + 48)
  return { offset, entryCount }
}

function findEocd(archive: Uint8Array, view: DataView): number {
  const earliest = Math.max(0, archive.length - EOCD_SIZE - MAX_COMMENT)
  for (let candidate = archive.length - EOCD_SIZE; candidate >= earliest; candidate--) {
    if (view.getUint32(candidate, true) === EOCD_SIGNATURE) return candidate
  }
  throw new ZipFormatError('no end-of-central-directory record — these bytes are not a zip archive')
}

type EntrySizes = { readonly compressedSize: number; readonly localOffset: number }

function resolveZip64Sizes(view: DataView, central: number, extra: Uint8Array): EntrySizes {
  let compressedSize = view.getUint32(central + 20, true)
  const uncompressedSize = view.getUint32(central + 24, true)
  let localOffset = view.getUint32(central + 42, true)
  if (compressedSize !== U32_SENTINEL && localOffset !== U32_SENTINEL) return { compressedSize, localOffset }

  const extraView = new DataView(extra.buffer, extra.byteOffset, extra.byteLength)
  for (let cursor = 0; cursor + 4 <= extra.length; ) {
    const id = extraView.getUint16(cursor, true)
    const size = extraView.getUint16(cursor + 2, true)
    const body = cursor + 4
    if (id === ZIP64_EXTRA_ID) {
      let field = body
      if (uncompressedSize === U32_SENTINEL) field += 8
      if (compressedSize === U32_SENTINEL) {
        compressedSize = readU64(extraView, field)
        field += 8
      }
      if (localOffset === U32_SENTINEL) localOffset = readU64(extraView, field)
      return { compressedSize, localOffset }
    }
    cursor = body + size
  }
  throw new ZipFormatError('a central directory entry needs ZIP64 sizes but carries no ZIP64 extra field')
}

function readLocalEntry(
  archive: Uint8Array,
  view: DataView,
  offset: number,
  method: number,
  compressedSize: number,
  name: string,
): Uint8Array {
  if (offset + LOCAL_FIXED_SIZE > archive.length || view.getUint32(offset, true) !== LOCAL_SIGNATURE) {
    throw new ZipFormatError(`no local file header for \`${name}\` at byte ${offset}`)
  }
  const nameLength = view.getUint16(offset + 26, true)
  const extraLength = view.getUint16(offset + 28, true)
  const start = offset + LOCAL_FIXED_SIZE + nameLength + extraLength
  if (start + compressedSize > archive.length) throw new ZipFormatError(`\`${name}\` runs past the end of the archive`)

  const payload = archive.subarray(start, start + compressedSize)
  if (method === STORED) return payload
  if (method !== DEFLATED) throw new ZipFormatError(`\`${name}\` uses unsupported compression method ${method}`)
  return new Uint8Array(inflateRawSync(payload))
}

function readU64(view: DataView, offset: number): number {
  const value = view.getBigUint64(offset, true)
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipFormatError('archive offsets exceed the addressable range')
  return Number(value)
}
