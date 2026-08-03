import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AdvisoryInstallError, installAdvisorySnapshot, writeAdvisorySnapshot } from './install.ts'
import { MALICIOUS_FILE, SNAPSHOT_MANIFEST_FILENAME, SNAPSHOT_FORMAT_VERSION, VULNERABLE_FILE, readSnapshotManifest } from './snapshot.ts'
import type { AdvisoryTable } from './advisory.ts'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

/**
 * An archive in OSV's exact publishing shape — streamed, so local headers carry no sizes — holding
 * four advisory documents copied verbatim out of the real npm export, plus a withdrawn one, a
 * PyPI-only one and a non-JSON file. Everything the reader has to skip is represented, because a
 * filter that silently stops filtering looks identical to one that never ran.
 */
const sample = new Uint8Array(readFileSync(join(fixtures, 'osv-sample.zip')))
const maliciousOnly = new Uint8Array(readFileSync(join(fixtures, 'osv-malicious-only.zip')))

const respondWith = (body: Uint8Array) => () =>
  Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(body.slice().buffer as ArrayBuffer) })

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-advisories-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const install = (body: Uint8Array, overrides: Record<string, unknown> = {}) =>
  installAdvisorySnapshot({ env: { SLOP_GATE_ADVISORIES_PATH: join(dir, 'snapshot') }, fetch: respondWith(body), ...overrides })

describe('installAdvisorySnapshot', () => {
  it('distils an OSV archive into a snapshot the engine can read back', async () => {
    const result = await install(sample)

    const manifest = readSnapshotManifest(result.directory)
    expect(manifest?.formatVersion).toBe(SNAPSHOT_FORMAT_VERSION)
    expect(manifest?.vulnerableAdvisories).toBe(2)
    expect(manifest?.maliciousAdvisories).toBe(2)

    const vulnerable = JSON.parse(await readFile(join(result.directory, VULNERABLE_FILE), 'utf8')) as AdvisoryTable
    const malicious = JSON.parse(await readFile(join(result.directory, MALICIOUS_FILE), 'utf8')) as AdvisoryTable

    // Five package entries from two advisories, not two: both are prototype-pollution reports that
    // name every republished form of the affected library. An index keyed by advisory rather than by
    // package would answer "is `lodash-es` affected" with silence.
    expect(Object.keys(vulnerable)).toEqual(['lodash', 'lodash-amd', 'lodash-es', 'lodash.defaultsdeep', 'minimist'])
    expect(Object.keys(malicious).sort()).toEqual(['chalk', 'debug'])
    expect(malicious['chalk']?.[0]?.versions).toEqual(['5.6.1'])
  })

  it('records the digest of the bytes it actually fetched', async () => {
    const result = await install(sample)
    expect(result.manifest.digest).toBe(createHash('sha256').update(sample).digest('hex'))
  })

  it('drops withdrawn advisories and other ecosystems', async () => {
    const result = await install(sample)
    const vulnerable = JSON.parse(await readFile(join(result.directory, VULNERABLE_FILE), 'utf8')) as AdvisoryTable

    expect(Object.keys(vulnerable)).not.toContain('requests')
    expect(vulnerable['lodash']?.map((record) => record.id)).not.toContain('GHSA-withdrawn-0000-0000')
  })

  /**
   * The guard that matters most here. A snapshot with no vulnerability data in it would make every
   * repository read as clean — the same silent false negative `npm audit --offline` produces, except
   * baked onto disk and repeated on every run until someone reinstalls. An archive that yields none
   * is far likelier to mean the layout changed than that npm has no advisories.
   */
  it('refuses to install a snapshot that would report every repository clean', async () => {
    await expect(install(maliciousOnly)).rejects.toThrow(AdvisoryInstallError)
    await expect(install(maliciousOnly)).rejects.toThrow(/report every repository clean/)
  })

  it('leaves nothing behind when it refuses', async () => {
    await expect(install(maliciousOnly)).rejects.toThrow(AdvisoryInstallError)
    expect(readSnapshotManifest(join(dir, 'snapshot'))).toBeUndefined()
  })

  it('reports a failed download as an install error naming the source', async () => {
    await expect(
      installAdvisorySnapshot({
        env: { SLOP_GATE_ADVISORIES_PATH: join(dir, 'snapshot') },
        source: 'https://example.invalid/all.zip',
        fetch: () => Promise.resolve({ ok: false, status: 503, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
      }),
    ).rejects.toThrow(/https:\/\/example\.invalid\/all\.zip responded 503/)
  })

  it('wraps a transport failure rather than letting it escape raw', async () => {
    await expect(
      installAdvisorySnapshot({
        env: { SLOP_GATE_ADVISORIES_PATH: join(dir, 'snapshot') },
        fetch: () => Promise.reject(new Error('ECONNREFUSED')),
      }),
    ).rejects.toThrow(AdvisoryInstallError)
  })

  it('replaces an existing snapshot rather than merging into it', async () => {
    const first = await install(sample, { now: new Date('2026-01-01T00:00:00.000Z') })
    await writeFile(join(first.directory, 'stray.json'), '{}')

    const second = await install(sample, { now: new Date('2026-06-01T00:00:00.000Z') })
    expect(readSnapshotManifest(second.directory)?.fetchedAt).toBe('2026-06-01T00:00:00.000Z')
    expect(await readdir(second.directory)).not.toContain('stray.json')
  })

  it('leaves no staging directory behind', async () => {
    const result = await install(sample)
    const siblings = await readdir(dirname(result.directory))
    expect(siblings.filter((name) => name.includes('.partial'))).toEqual([])
  })

  it('produces byte-identical files from identical input, so the digest means something', async () => {
    const first = await install(sample)
    const before = await readFile(join(first.directory, VULNERABLE_FILE), 'utf8')
    const second = await install(sample)
    expect(await readFile(join(second.directory, VULNERABLE_FILE), 'utf8')).toBe(before)
  })
})

describe('writeAdvisorySnapshot', () => {
  /** The supported way to build a snapshot for an air-gapped image, so it is tested as an entry
   *  point rather than only through the installer. */
  it('writes a readable snapshot to an arbitrary directory', async () => {
    const directory = join(dir, 'baked-in')
    await writeAdvisorySnapshot(
      directory,
      {
        formatVersion: SNAPSHOT_FORMAT_VERSION,
        source: 'file:///build/all.zip',
        fetchedAt: '2026-08-01T00:00:00.000Z',
        digest: 'b'.repeat(64),
        vulnerableAdvisories: 1,
        maliciousAdvisories: 0,
      },
      { vulnerable: { lodash: [{ id: 'GHSA-x', versions: ['1.0.0'], ranges: [], severity: 'HIGH', summary: '' }] }, malicious: {} },
    )

    expect(readSnapshotManifest(directory)?.source).toBe('file:///build/all.zip')
    expect(await readFile(join(directory, SNAPSHOT_MANIFEST_FILENAME), 'utf8')).toContain('"formatVersion": 1')
  })
})
