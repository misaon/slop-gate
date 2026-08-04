import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CACHE_DIR_ENV,
  SNAPSHOT_MANIFEST_FILENAME,
  SNAPSHOT_FORMAT_VERSION,
  SNAPSHOT_PATH_ENV,
  STALE_AFTER_DAYS,
  advisorySnapshotDir,
  describeStaleness,
  readSnapshotManifest,
  snapshotAgeInDays,
  stalenessBand,
  type SnapshotManifest,
} from './snapshot.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-snapshot-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const valid: SnapshotManifest = {
  formatVersion: SNAPSHOT_FORMAT_VERSION,
  source: 'https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip',
  fetchedAt: '2026-08-01T00:00:00.000Z',
  digest: 'c'.repeat(64),
  vulnerableAdvisories: 6709,
  maliciousAdvisories: 216_779,
}

const write = async (body: unknown) => {
  await writeFile(join(dir, SNAPSHOT_MANIFEST_FILENAME), JSON.stringify(body))
  return dir
}

describe('advisorySnapshotDir', () => {
  const version = String(SNAPSHOT_FORMAT_VERSION)

  it('takes an explicit path verbatim, which is how an air-gapped image supplies one', () => {
    expect(advisorySnapshotDir({ env: { [SNAPSHOT_PATH_ENV]: '/opt/advisories' } })).toBe('/opt/advisories')
  })

  it.each([
    [{ [CACHE_DIR_ENV]: '/cache' }, 'posix', join('/cache', 'advisories', version)],
    [{ XDG_CACHE_HOME: '/xdg' }, 'posix', join('/xdg', 'slop-gate', 'advisories', version)],
  ])('honours %o', (env, _platform, expected) => {
    expect(advisorySnapshotDir({ env, homeDir: '/home/u' })).toBe(expected)
  })

  it('uses LOCALAPPDATA only on Windows', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }
    expect(advisorySnapshotDir({ env, platform: 'win32', homeDir: 'C:\\Users\\u' })).toBe(
      join('C:\\Users\\u\\AppData\\Local', 'slop-gate', 'advisories', version),
    )
    expect(advisorySnapshotDir({ env, platform: 'linux', homeDir: '/home/u' })).toBe(
      join('/home/u', '.cache', 'slop-gate', 'advisories', version),
    )
  })

  it('scopes the cache path by format version', () => {
    expect(advisorySnapshotDir({ env: { [CACHE_DIR_ENV]: '/cache' } })).toContain(version)
  })

  it('ignores an empty override rather than treating it as a path', () => {
    expect(advisorySnapshotDir({ env: { [SNAPSHOT_PATH_ENV]: '', [CACHE_DIR_ENV]: '/cache' } })).toBe(
      join('/cache', 'advisories', version),
    )
  })
})

describe('readSnapshotManifest', () => {
  it('reads a well-formed manifest', async () => {
    expect(readSnapshotManifest(await write(valid))).toEqual(valid)
  })

  it('reports nothing when there is no snapshot', () => {
    expect(readSnapshotManifest(join(dir, 'absent'))).toBeUndefined()
  })

  it.each([
    ['truncated JSON', '{ "formatVersion": 1'],
    ['a manifest from another format version', JSON.stringify({ ...valid, formatVersion: 99 })],
    ['a manifest with no fetch date', JSON.stringify({ formatVersion: SNAPSHOT_FORMAT_VERSION, digest: 'x', source: 'y' })],
    ['a manifest with no digest', JSON.stringify({ formatVersion: SNAPSHOT_FORMAT_VERSION, fetchedAt: 'y', source: 'y' })],
  ])('treats %s as no snapshot at all', async (_label, body) => {
    await writeFile(join(dir, SNAPSHOT_MANIFEST_FILENAME), body)
    expect(readSnapshotManifest(dir)).toBeUndefined()
  })
})

describe('snapshotAgeInDays', () => {
  it('counts whole days since the fetch', () => {
    const now = new Date('2026-08-11T06:00:00.000Z')
    expect(snapshotAgeInDays(valid, now)).toBe(10)
  })

  it('never reports a negative age for a clock that ran backwards', () => {
    expect(snapshotAgeInDays(valid, new Date('2026-07-01T00:00:00.000Z'))).toBe(0)
  })

  it('treats an unparseable date as maximally stale', () => {
    expect(snapshotAgeInDays({ ...valid, fetchedAt: 'not a date' })).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('stalenessBand', () => {
  it.each([
    [0, 'fresh'],
    [STALE_AFTER_DAYS - 1, 'fresh'],
    [STALE_AFTER_DAYS, 'ageing'],
    [29, 'ageing'],
    [30, 'stale'],
    [89, 'stale'],
    [90, 'abandoned'],
    [Number.POSITIVE_INFINITY, 'abandoned'],
  ])('puts %s days in the %s band', (days, band) => {
    expect(stalenessBand(days)).toBe(band)
  })
})

describe('describeStaleness', () => {
  it('says something different in every band', () => {
    const messages = [10, 45, 200].map(describeStaleness)
    expect(new Set(messages).size).toBe(3)
    expect(messages[0]).toContain('10 days old')
    expect(messages[1]).toContain('hundreds')
    expect(messages[2]).toContain('no longer a meaningful security check')
  })

  it('names the command that fixes it in every band', () => {
    for (const days of [10, 45, 200]) expect(describeStaleness(days)).toContain('sgate engines install advisories')
  })

  it('does not say "1 days"', () => {
    expect(describeStaleness(1)).toContain('1 day old')
  })
})
