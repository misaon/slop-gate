import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AdvisoryTable } from './advisory.ts'

export const SNAPSHOT_PATH_ENV = 'SLOP_GATE_ADVISORIES_PATH'
export const CACHE_DIR_ENV = 'SLOP_GATE_CACHE_DIR'

export const SNAPSHOT_FORMAT_VERSION = 2

export const SNAPSHOT_MANIFEST_FILENAME = 'snapshot.json'
export const VULNERABLE_FILE = 'vulnerable.json'
export const MALICIOUS_INDEX_FILE = 'malicious.idx'
export const MALICIOUS_RECORDS_FILE = 'malicious.rec'

export const INSTALL_COMMAND = 'sgate engines install advisories'

export type SnapshotManifest = {
  readonly formatVersion: number
  readonly source: string
  readonly fetchedAt: string
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
    return undefined
  }
}

export function snapshotAgeInDays(manifest: SnapshotManifest, now: Date = new Date()): number {
  const fetched = Date.parse(manifest.fetchedAt)
  if (Number.isNaN(fetched)) return Number.POSITIVE_INFINITY
  return Math.max(0, Math.floor((now.getTime() - fetched) / 86_400_000))
}

export const STALE_AFTER_DAYS = 7

export type StalenessBand = 'fresh' | 'ageing' | 'stale' | 'abandoned'

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
