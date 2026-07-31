import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { runCheck } from '@misaon/slop-gate-core'
import { createOxlintEngine } from '@misaon/slop-gate-engine-oxlint'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/basic')
let dir: string

const check = (useCache: boolean) =>
  runCheck({
    rootDir: dir,
    config: { extends: ['recommended'] },
    engines: [createOxlintEngine()],
    useCache,
  })

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-e2e-'))
  await cp(FIXTURE, dir, { recursive: true })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('finds the seeded problems in the dirty file and nothing in the clean one', async () => {
  const result = await check(false)
  const concepts = result.diagnostics.map((d) => d.concept)

  expect(concepts).toContain('correctness.no-debugger')
  expect(concepts).toContain('correctness.no-duplicate-object-key')
  expect(result.diagnostics.every((d) => d.file !== 'src/clean.ts')).toBe(true)
}, 60_000)

test('reports every diagnostic with a canonical rule id, a concept and a position', async () => {
  for (const diagnostic of (await check(false)).diagnostics) {
    expect(diagnostic.ruleId).toMatch(/^[a-z-]+\/\S+$/)
    expect(diagnostic.concept).toMatch(/^[a-z-]+\.[a-z-]+$/)
    expect(diagnostic.position.startLine).toBeGreaterThan(0)
    expect(diagnostic.file).not.toMatch(/^\/|\\/)
    expect(diagnostic.fingerprint).toMatch(/^[0-9a-f]{32}$/)
  }
}, 60_000)

test('reports the same findings from cache on a second run', async () => {
  const cold = await check(true)
  const warm = await check(true)

  expect(warm.diagnostics).toEqual(cold.diagnostics)
  expect(warm.stats.filesFromCache).toBeGreaterThan(0)
}, 60_000)

test('the warm run is faster than the cold run', async () => {
  const cold = await check(true)
  const warm = await check(true)

  expect(warm.stats.durationMs).toBeLessThanOrEqual(cold.stats.durationMs)
}, 60_000)

test('never reports two diagnostics with the same concept at the same position', async () => {
  const seen = new Set<string>()
  for (const diagnostic of (await check(false)).diagnostics) {
    const key = `${diagnostic.file}:${diagnostic.range.start}:${diagnostic.concept}`
    expect(seen.has(key), `duplicate report for ${key}`).toBe(false)
    seen.add(key)
  }
}, 60_000)

test('reports no engine failures', async () => {
  expect((await check(false)).engineFailures).toEqual([])
}, 60_000)
