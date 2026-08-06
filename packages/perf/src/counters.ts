import type { CheckResult } from '@misaon/slop-gate-core'

/**
 * Engines every install has. `actionlint`, `hadolint` and `deps-security` are downloaded rather than
 * bundled, so asserting anything about them would pass on a machine that happens to have them and fail
 * in CI, which installs none.
 */
export const BUNDLED_ENGINES = ['astgrep', 'biome-css', 'knip', 'oxlint', 'tsc'] as const

export type WorkCounters = {
  readonly filesScanned: number
  readonly filesAnalysed: number
  readonly findings: number
  readonly filesAssigned: Readonly<Record<string, number>>
}

export type CacheCounters = {
  readonly filesFromCache: number
  readonly filesFromCachePerEngine: Readonly<Record<string, number>>
}

const assignedTo = (result: CheckResult, engine: string): number =>
  result.stats.cacheByEngine.find((entry) => entry.engine === engine)?.filesAssigned ?? 0

const cachedIn = (result: CheckResult, engine: string): number =>
  result.stats.cacheByEngine.find((entry) => entry.engine === engine)?.filesFromCache ?? 0

export function workCounters(result: CheckResult): WorkCounters {
  return {
    filesScanned: result.stats.filesScanned,
    filesAnalysed: result.stats.filesAnalysed,
    findings: result.counts.error + result.counts.warn + result.counts.info,
    filesAssigned: Object.fromEntries(BUNDLED_ENGINES.map((engine) => [engine, assignedTo(result, engine)])),
  }
}

export function cacheCounters(result: CheckResult): CacheCounters {
  return {
    filesFromCache: result.stats.filesFromCache,
    filesFromCachePerEngine: Object.fromEntries(BUNDLED_ENGINES.map((engine) => [engine, cachedIn(result, engine)])),
  }
}

/** How many times each engine was asked to run, which is what separates a batch from a file-at-a-time. */
export function engineInvocations(result: CheckResult): number {
  return result.stats.enginesRun
}
