import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ZipFormatError, readZipEntries } from './zip.ts'

const fixtures = join(import.meta.dirname, 'fixtures')
const load = (name: string) => new Uint8Array(readFileSync(join(fixtures, name)))
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

const collect = (archive: Uint8Array) => {
  const out = new Map<string, string>()
  for (const entry of readZipEntries(archive)) out.set(entry.name, decode(entry.data))
  return out
}

describe('readZipEntries', () => {
  it('reads a plain archive written by Info-ZIP', () => {
    const entries = collect(load('classic.zip'))

    expect(entries.get('a.json')).toBe('{"id":"GHSA-aaaa-bbbb-cccc","summary":"first"}')
    expect(entries.get('b.json')).toBe('{"id":"MAL-2025-1","summary":"second"}')
    expect(entries.get('nested/c.json')).toBe('{"id":"GHSA-dddd-eeee-ffff","summary":"third"}')
  })

  it('reads a ZIP64 archive', () => {
    expect(collect(load('zip64.zip')).get('nested/c.json')).toBe('{"id":"GHSA-dddd-eeee-ffff","summary":"third"}')
  })

  it('reads an archive whose local headers carry no sizes', () => {
    const archive = load('streamed.zip')
    expect(archive[6] !== undefined && (archive[6] & 0x08) !== 0).toBe(true)

    const entries = collect(archive)
    expect(entries.size).toBe(3)
    expect(entries.get('a.json')).toBe('{"id":"GHSA-aaaa-bbbb-cccc","summary":"first"}')
  })

  it('yields every entry exactly once', () => {
    const names = [...readZipEntries(load('zip64.zip'))].map((entry) => entry.name)
    expect(names.filter((name) => name.endsWith('.json'))).toHaveLength(3)
    expect(new Set(names).size).toBe(names.length)
  })

  it('rejects bytes with no end-of-central-directory record', () => {
    expect(() => [...readZipEntries(new Uint8Array([1, 2, 3, 4]))]).toThrow(ZipFormatError)
  })

  it('rejects a truncated archive rather than yielding partial entries', () => {
    const archive = load('classic.zip')
    expect(() => [...readZipEntries(archive.subarray(0, -40))]).toThrow(ZipFormatError)
  })
})
