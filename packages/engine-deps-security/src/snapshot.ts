import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AdvisoryTable } from './advisory.ts'

export const SNAPSHOT_PATH_ENV = 'SLOP_GATE_ADVISORIES_PATH'
export const CACHE_DIR_ENV = 'SLOP_GATE_CACHE_DIR'

/**
 * Bumped when the on-disk shape changes. It scopes the cache directory, so an older slop-gate never reads a newer
 * snapshot and a newer one never misreads an older — the same trick `actionlintCacheDir` plays with its pin.
 */
export const SNAPSHOT_FORMAT_VERSION = 1

export const SNAPSHOT_MANIFEST_FILENAME = 'snapshot.json'
export const VULNERABLE_FILE = 'vulnerable.json'
export const MALICIOUS_FILE = 'malicious.json'

export const INSTALL_COMMAND = 'sgate engines install advisories'

export type SnapshotManifest = {
  readonly formatVersion: number
  /** The exact URL the bytes came from, so a snapshot can say what it is without being trusted to. */
  readonly source: string
  readonly fetchedAt: string
  /**
   * SHA-256 of the archive as downloaded. **Not a verification against the publisher** — OSV regenerates
   * `npm/all.zip` daily and publishes no per-release digest, so there is nothing to compare against at fetch time
   * (spec §19). What it buys is after the fact: two machines can prove they built from the same bytes, and a
   * snapshot altered on disk stops matching what it claims.
   */
  readonly digest: string
  readonly vulnerableAdvisories: number
  readonly maliciousAdvisories: number
}

export type AdvisorySnapshot = {
  readonly directory: string
  readonly manifest: SnapshotManifest
  readonly vulnerable: AdvisoryTable
  readonly malicious: AdvisoryTable
}

export type SnapshotLocationOptions = {
  env?: Readonly<Record<string, string | undefined>>
  platform?: string
  homeDir?: string
}

/**
 * `SLOP_GATE_ADVISORIES_PATH` names a directory outright — the escape hatch for an air-gapped image that ships the
 * snapshot in the container, which is the only way this engine can run somewhere with no egress at all.
 */
export function advisorySnapshotDir(options: SnapshotLocationOptions = {}): string {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const home = options.homeDir ?? homedir()

  const explicit = env[SNAPSHOT_PATH_ENV]
  if (explicit !== undefined && explicit !== '') return explicit

  const version = String(SNAPSHOT_FORMAT_VERSION)
  const cacheRoot = env[CACHE_DIR_ENV]
  if (cacheRoot !== undefined && cacheRoot !== '') return join(cacheRoot, 'advisories', version)

  const xdg = env['XDG_CACHE_HOME']
  if (xdg !== undefined && xdg !== '') return join(xdg, 'slop-gate', 'advisories', version)

  const localAppData = env['LOCALAPPDATA']
  if (platform === 'win32' && localAppData !== undefined && localAppData !== '') {
    return join(localAppData, 'slop-gate', 'advisories', version)
  }

  return join(home, '.cache', 'slop-gate', 'advisories', version)
}

/**
 * The whole of `availability()`'s budget, which `Engine.availability` caps at filesystem access. Deliberately not
 * loading the tables: `sgate rules why` calls availability, and parsing 16 MB of malicious-package data to answer
 * "is it installed" would make an explain-only command do the engine's work.
 */
export function readSnapshotManifest(directory: string): SnapshotManifest | undefined {
  const path = join(directory, SNAPSHOT_MANIFEST_FILENAME)
  if (!existsSync(path)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<SnapshotManifest>
    if (parsed.formatVersion !== SNAPSHOT_FORMAT_VERSION) return undefined
    if (typeof parsed.fetchedAt !== 'string' || typeof parsed.digest !== 'string' || typeof parsed.source !== 'string') {
      return undefined
    }
    return {
      formatVersion: parsed.formatVersion,
      source: parsed.source,
      fetchedAt: parsed.fetchedAt,
      digest: parsed.digest,
      vulnerableAdvisories: parsed.vulnerableAdvisories ?? 0,
      maliciousAdvisories: parsed.maliciousAdvisories ?? 0,
    }
  } catch {
    // A half-written or hand-edited manifest reads as "no snapshot" and surfaces as the ordinary coverage gap.
    // Throwing from an availability probe would turn a corrupt cache into a failed run of a command that only
    // meant to explain itself.
    return undefined
  }
}

export function snapshotAgeInDays(manifest: SnapshotManifest, now: Date = new Date()): number {
  const fetched = Date.parse(manifest.fetchedAt)
  if (Number.isNaN(fetched)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor((now.getTime() - fetched) / 86_400_000))
}

/** Below this a snapshot says nothing about its own age; above it, it says so with escalating force. */
export const STALE_AFTER_DAYS = 7

export type StalenessBand = 'fresh' | 'ageing' | 'stale' | 'abandoned'

/**
 * npm gains roughly 35 GitHub advisories a week and 243 a month, so these bands are not round numbers picked for
 * looks: a fortnight-old snapshot is missing a handful, a quarter-old one around a thousand and is no longer a
 * security check in any meaningful sense. The wording moves with them, because a message that reads identically at
 * three days and three months trains people to skip it.
 */
export function stalenessBand(days: number): StalenessBand {
  if (days < STALE_AFTER_DAYS) return 'fresh'
  if (days < 30) return 'ageing'
  if (days < 90) return 'stale'
  return 'abandoned'
}

export function describeStaleness(days: number): string {
  const age = days === 1 ? '1 day' : `${days} days`
  switch (stalenessBand(days)) {
    case 'ageing':
      return `The advisory snapshot is ${age} old, so anything published since is not being checked. Refresh it with \`${INSTALL_COMMAND}\`.`
    case 'stale':
      return `The advisory snapshot is ${age} old. npm gains roughly 240 advisories a month, so this run is missing hundreds of them. Refresh it with \`${INSTALL_COMMAND}\`.`
    case 'abandoned':
      return `The advisory snapshot is ${age} old and is no longer a meaningful security check — around a thousand advisories have been published since it was taken. Refresh it with \`${INSTALL_COMMAND}\`, or stop relying on this engine.`
    case 'fresh':
      return `The advisory snapshot is ${age} old.`
  }
}
