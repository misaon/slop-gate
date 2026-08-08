import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { beforeAll, expect, test } from 'vitest'
import type { CheckResult } from '@misaon/slop-gate-core'
import { BUNDLED_ENGINES, cacheCounters, engineInvocations, workCounters } from './counters.ts'
import { STANDARD_CORPUS, writeCorpus } from './corpus.ts'

const run = promisify(execFile)

const REPO_ROOT = join(import.meta.dirname, '../../..')
const CORPUS = join(import.meta.dirname, '../.corpus/counters')
// The built binary, not an in-process `runCheck`: these numbers are a promise about what a user's install
// does, and the source alias in vitest.config.ts cannot see `dist`.
const CLI = join(REPO_ROOT, 'packages/cli/bin/sgate.js')

async function check(): Promise<CheckResult> {
  const { stdout } = await run(process.execPath, [CLI, 'check', '--cwd', CORPUS, '--format', 'json'], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, SLOP_GATE_TELEMETRY: '0' },
  })
  return JSON.parse(stdout) as CheckResult
}

let cold: CheckResult
let warm: CheckResult

beforeAll(async () => {
  await writeCorpus(CORPUS, STANDARD_CORPUS)
  await rm(join(CORPUS, '.slop-gate'), { recursive: true, force: true })
  cold = await check()
  warm = await check()
}, 600_000)

// The corpus is generated from a seed, so these are exact rather than approximate. A change here is a
// change in how much work a run does, and it should be argued for in the pull request that causes it.
test('a run analyses exactly the files the corpus contains, and no more', () => {
  // 51, not 50: the generator's modules used to import their neighbour modulo the total, which closed a
  // 400-module ring. Opening it left `mod-0000`'s exported type reachable from the entry and unused, which
  // is one more knip finding and one fewer 400-finding cycle.
  expect(workCounters(cold)).toEqual({
    filesScanned: 439,
    filesAnalysed: 439,
    findings: 51,
    filesAssigned: { astgrep: 401, 'biome-css': 24, knip: 415, oxlint: 401, tsc: 401 },
  })
})

test('a second run reads every file from the cache', () => {
  const counters = cacheCounters(warm)
  expect(counters.filesFromCache).toBe(warm.stats.filesAnalysed)
  for (const engine of BUNDLED_ENGINES) {
    expect(counters.filesFromCachePerEngine[engine]).toBe(workCounters(warm).filesAssigned[engine])
  }
})

// A batch engine that becomes a per-file engine is the regression a wall clock on a shared runner is too
// noisy to catch, and it is the most expensive one available.
test('each engine is invoked once for the whole run, not once per file', () => {
  expect(engineInvocations(cold)).toBeLessThanOrEqual(8)
  expect(engineInvocations(cold)).toBeGreaterThanOrEqual(BUNDLED_ENGINES.length)
})

test('no bundled engine is missing, which would make every other number here a smaller promise', () => {
  const missing = cold.unavailableEngines.map((entry) => entry.engine)
  for (const engine of BUNDLED_ENGINES) expect(missing).not.toContain(engine)
})
