import { readFileSync } from 'node:fs'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { loadConfig, runCheck, toPosix, type CheckResult } from '@misaon/slop-gate-core'
import { createOxlintEngine } from '@misaon/slop-gate-engine-oxlint'
import { createReporter } from '@misaon/slop-gate-reporters'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/basic')
let dir: string

const suppressedFileConcepts = (result: { diagnostics: readonly { file: string | null; concept: string }[] }): string[] =>
  result.diagnostics.filter((d) => d.file === 'src/suppressed.ts').map((d) => d.concept)

const check = async (useCache: boolean) => {
  // Mirrors what `sgate check` itself does (packages/cli/src/commands/check.ts): `loadConfig`
  // resolves the fixture's own `slop-gate.config.ts` to an absolute path, which the caller must
  // relativize before it reaches `streamCheck` — `configFile` lands verbatim in every `config.*`
  // diagnostic's `file` field, and paths are repo-relative POSIX in every public data structure.
  // Without this, the fixture's config is never actually loaded from disk, so no `config.*`
  // diagnostic is ever produced here and this class of bug (an absolute `configFile`) is invisible.
  const loaded = await loadConfig(dir)
  return runCheck({
    rootDir: dir,
    config: loaded?.config ?? { extends: ['recommended'] },
    ...(loaded === null || loaded === undefined ? {} : { configFile: toPosix(relative(dir, loaded.file)) }),
    engines: [createOxlintEngine()],
    useCache,
  })
}

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
  const diagnostics = (await check(false)).diagnostics

  // The registry's own oxlint/eslint tier overlap on `dead-code.unused-variable` fires
  // unconditionally (§5.3) — `recommended` enables `config.rule-overlap`, so this run must produce
  // one. Without this assertion, the relative-path check below would pass vacuously the moment
  // `configFile` stopped being wired up, exactly the gap that let the absolute-path bug through.
  expect(diagnostics.some((d) => d.concept.startsWith('config.'))).toBe(true)

  for (const diagnostic of diagnostics) {
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

test('the warm run does strictly less work than the cold run', async () => {
  // Asserted as *work*, not as elapsed time. The wall-clock version of this test compared
  // `durationMs` between two runs and failed on a shared CI runner at 173ms vs 163ms — a 6% margin
  // that says nothing about the cache and everything about what else the machine was doing. Cache
  // hits and engine invocations are counters the run controls, so they hold on a loaded runner and
  // still fail for the reason this test exists: a cache that stopped being consulted.
  const cold = await check(true)
  const warm = await check(true)

  expect(cold.stats.filesFromCache).toBe(0)
  expect(warm.stats.filesFromCache).toBe(warm.stats.filesAnalysed)

  // Not asserted: that the warm run invokes fewer engines. `enginesRun` is 1 either way, because the
  // planner is not cache-aware — an engine with every result already cached is still constructed and
  // asked for its version and config. That gap is recorded in the M0 follow-ups under "Restructure
  // before M2"; when it closes, this is the assertion to add.
}, 60_000)

test('never reports two diagnostics with the same concept at the same position', async () => {
  const seen = new Set<string>()
  for (const diagnostic of (await check(false)).diagnostics) {
    const key = `${diagnostic.file}:${diagnostic.range.start}:${diagnostic.concept}`
    expect(seen.has(key), `duplicate report for ${key}`).toBe(false)
    seen.add(key)
  }
}, 60_000)

test('a warm run still reports each of two byte-identical files, not a cross-file duplicate', async () => {
  // fixtures/basic/src/twin-a.ts and twin-b.ts are byte-identical. The result cache key is
  // per-content, not per-path (packages/core/src/cache/keys.ts): without the file path folded in,
  // both files collide on one cache entry on a warm run, so this is the property that class of bug
  // breaks — unlike the cache-off test above, which never touches the cache at all.
  await check(true)
  const warm = await check(true)

  const twins = warm.diagnostics.filter((d) => d.file === 'src/twin-a.ts' || d.file === 'src/twin-b.ts')
  expect(twins.map((d) => d.file).sort()).toEqual(['src/twin-a.ts', 'src/twin-b.ts'])

  const seen = new Set<string>()
  for (const diagnostic of warm.diagnostics) {
    const key = `${diagnostic.file}:${diagnostic.range.start}:${diagnostic.concept}`
    expect(seen.has(key), `duplicate report for ${key}`).toBe(false)
    seen.add(key)
  }
}, 60_000)

test('reports no engine failures', async () => {
  expect((await check(false)).engineFailures).toEqual([])
}, 60_000)

const agentReport = (result: CheckResult, maxTokens?: number): string => {
  let output = ''
  createReporter('agent', {
    write: (chunk) => (output += chunk),
    color: false,
    unicode: true,
    width: 80,
    version: '0.0.0',
    readSource: (file) => (file === null ? null : readFileSync(join(dir, file), 'utf8')),
    ...(maxTokens === undefined ? {} : { maxTokens }),
  }).onEvent({ type: 'done', result })
  return output
}

test('the agent report is byte-identical whether the run was served cold or from cache', async () => {
  // The end of the determinism chain the unit tests cover a link at a time: a real oxlint run over
  // real files, once cold and once warm, through the real reporter. `stats.durationMs` and
  // `stats.filesFromCache` differ between these two results by construction, so this is the test
  // that fails the moment either of them reaches the output — and with it the property that makes
  // this format diffable and cacheable.
  const cold = await check(true)
  const warm = await check(true)

  expect(warm.stats.filesFromCache).not.toBe(cold.stats.filesFromCache)
  expect(agentReport(warm)).toBe(agentReport(cold))
  expect(agentReport(warm, 900)).toBe(agentReport(cold, 900))
}, 60_000)

test('the agent report accounts for every finding the same run reported', async () => {
  const result = await check(false)
  const output = agentReport(result)

  expect(output).toContain(`coverage: ${result.diagnostics.length} of ${result.diagnostics.length} findings shown, 0 omitted`)
  for (const diagnostic of result.diagnostics) {
    const where = diagnostic.file === null ? '(configuration)' : `${diagnostic.file}:${diagnostic.position.startLine}:`
    expect(output, diagnostic.concept).toContain(where)
    expect(output, diagnostic.concept).toContain(`### ${diagnostic.concept}`)
  }
}, 60_000)

test('an inline suppression hides a real oxlint finding, and an unused one is reported', async () => {
  // Exercises the full pipeline the unit tests in packages/core stub out: a real oxlint byte
  // offset, a real line index, a real cached per-file result — not a hand-built `RawDiagnostic`.
  // fixtures/basic/src/suppressed.ts seeds two directives: one that matches its debugger statement
  // (must disappear from the result) and one that matches nothing (must surface as
  // config.unused-suppression, which `recommended` enables by default — see config/presets.ts).
  const result = await check(false)
  const concepts = suppressedFileConcepts(result)

  expect(concepts).not.toContain('correctness.no-debugger')
  expect(concepts).toContain('config.unused-suppression')

  // dirty.ts's own, unsuppressed debugger is untouched by the fixture file above.
  expect(result.diagnostics.some((d) => d.file === 'src/dirty.ts' && d.concept === 'correctness.no-debugger')).toBe(true)
}, 60_000)

test('the suppressed finding and the unused-suppression diagnostic both survive a warm cache hit', async () => {
  const cold = await check(true)
  const warm = await check(true)

  expect(suppressedFileConcepts(warm)).toEqual(suppressedFileConcepts(cold))
  expect(suppressedFileConcepts(warm)).toContain('config.unused-suppression')
  expect(warm.stats.filesFromCache).toBeGreaterThan(0)
}, 60_000)
