import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createWalkFileSource } from '../discovery/inventory.ts'
import type { Engine, RawDiagnostic } from '../engine/types.ts'
import type { Capability, EngineId, RuleEntry } from '../registry/types.ts'
import { runCheck, streamCheck } from './check.ts'

let dir: string

const ENTRIES: RuleEntry[] = [
  {
    engine: 'oxlint',
    engineRuleId: 'no-debugger',
    concepts: ['correctness.no-debugger'],
    tier: 0,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts'],
    docsUrl: 'https://example.test/no-debugger',
    since: '0.1.0',
  },
]

const stubEngine = (options: {
  id?: EngineId
  provides?: Capability[]
  findings?: RawDiagnostic[]
  fail?: string
  onRun?: () => void
}): Engine =>
  ({
    id: options.id ?? 'oxlint',
    capabilities: { languages: ['ts'], granularity: 'file', provides: options.provides ?? [], fixes: false },
    version: async () => '1.75.0',
    materializeConfig: async () => ({ path: 'stub', rulesetHash: 'stubhash', dispose: async () => {} }),
    run: (batch) =>
      (async function* () {
        options.onRun?.()
        if (options.fail !== undefined) throw new Error(options.fail)
        const paths = new Set(batch.files.map((f) => f.path))
        for (const finding of options.findings ?? []) {
          if (paths.has(finding.file)) yield finding
        }
      })(),
  }) satisfies Engine

const debuggerFinding = (file: string): RawDiagnostic => ({
  engineRuleId: 'no-debugger',
  message: '`debugger` statement is not allowed',
  severity: 'error',
  file,
  range: { start: 22, end: 30 },
})

const baseOptions = () => ({
  rootDir: dir,
  config: { rules: { 'correctness.no-debugger': 'error' } } as never,
  entries: ENTRIES,
  fileSource: createWalkFileSource(),
  cacheDir: join(dir, '.slop-gate', 'cache'),
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-check-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  await mkdir(join(dir, 'src'), { recursive: true })
  await writeFile(join(dir, 'src/a.ts'), 'export function f() {\n  debugger\n}\n')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('returns a normalized diagnostic for an engine finding', async () => {
  const result = await runCheck({ ...baseOptions(), engines: [stubEngine({ findings: [debuggerFinding('src/a.ts')] })] })

  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]?.concept).toBe('correctness.no-debugger')
  expect(result.diagnostics[0]?.severity).toBe('error')
  expect(result.diagnostics[0]?.position.startLine).toBe(2)
  expect(result.counts).toEqual({ error: 1, warn: 0, info: 0 })
})

test('reports zero findings on a clean repository', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  const result = await runCheck({ ...baseOptions(), engines: [stubEngine({})] })

  expect(result.diagnostics).toEqual([])
  expect(result.counts).toEqual({ error: 0, warn: 0, info: 0 })
})

test('serves a second identical run from the cache without invoking the engine', async () => {
  let runs = 0
  const engine = () => stubEngine({ findings: [debuggerFinding('src/a.ts')], onRun: () => (runs += 1) })

  const first = await runCheck({ ...baseOptions(), engines: [engine()] })
  const second = await runCheck({ ...baseOptions(), engines: [engine()] })

  expect(runs).toBe(1)
  expect(second.diagnostics).toEqual(first.diagnostics)
  expect(second.stats.filesFromCache).toBeGreaterThan(0)
})

test('caches a clean result so unchanged clean files are not re-analysed', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  let runs = 0
  const engine = () => stubEngine({ onRun: () => (runs += 1) })

  await runCheck({ ...baseOptions(), engines: [engine()] })
  await runCheck({ ...baseOptions(), engines: [engine()] })

  expect(runs).toBe(1)
})

test('re-runs the engine after a file changes', async () => {
  let runs = 0
  const engine = () => stubEngine({ findings: [debuggerFinding('src/a.ts')], onRun: () => (runs += 1) })

  await runCheck({ ...baseOptions(), engines: [engine()] })
  await writeFile(join(dir, 'src/a.ts'), 'export function f() {\n  debugger\n  debugger\n}\n')
  await runCheck({ ...baseOptions(), engines: [engine()] })

  expect(runs).toBe(2)
})

test('re-runs the engine after a rule entry changes without adding or removing a rule id', async () => {
  let runs = 0
  const engine = () => stubEngine({ findings: [debuggerFinding('src/a.ts')], onRun: () => (runs += 1) })

  await runCheck({ ...baseOptions(), engines: [engine()] })
  const mutatedEntries: RuleEntry[] = [{ ...ENTRIES[0]!, severityDefault: 'warn' }]
  await runCheck({ ...baseOptions(), entries: mutatedEntries, engines: [engine()] })

  expect(runs).toBe(2)
})

test('bypasses the cache when asked', async () => {
  let runs = 0
  const engine = () => stubEngine({ findings: [debuggerFinding('src/a.ts')], onRun: () => (runs += 1) })

  await runCheck({ ...baseOptions(), engines: [engine()], useCache: false })
  await runCheck({ ...baseOptions(), engines: [engine()], useCache: false })

  expect(runs).toBe(2)
})

test('an engine failure is reported without aborting the run', async () => {
  const result = await runCheck({ ...baseOptions(), engines: [stubEngine({ fail: 'boom' })] })

  expect(result.engineFailures).toEqual([{ engine: 'oxlint', message: 'boom' }])
  expect(result.diagnostics).toEqual([])
})

test('emits a diagnostic for a dead override', async () => {
  const result = await runCheck({
    ...baseOptions(),
    config: {
      rules: { 'correctness.no-debugger': 'error', 'oxlint/no-such-rule': 'error', 'config.dead-override': 'warn' },
    } as never,
    engines: [stubEngine({})],
  })

  const dead = result.diagnostics.filter((d) => d.concept === 'config.dead-override')
  expect(dead).toHaveLength(1)
  expect(dead[0]?.message).toContain('oxlint/no-such-rule')
})

test('a config diagnostic is attributed to no file when no config file was given', async () => {
  // Bug reproduction (docs/superpowers/specs/2026-07-31-m0-followups.md, "Found by first
  // real-world use"): `baseOptions()` never sets `configFile`, matching a real run where
  // `loadConfig` found nothing. The diagnostic must not name the literal default
  // `slop-gate.config.ts` — that path does not exist in this fixture's `dir` — so `file` has to be
  // `null`, not a guessed filename.
  const result = await runCheck({
    ...baseOptions(),
    config: {
      rules: { 'correctness.no-debugger': 'error', 'oxlint/no-such-rule': 'error', 'config.dead-override': 'warn' },
    } as never,
    engines: [stubEngine({})],
  })

  const dead = result.diagnostics.filter((d) => d.concept === 'config.dead-override')
  expect(dead).toHaveLength(1)
  expect(dead[0]?.file).toBeNull()
})

test('a config diagnostic is attributed to the real config file when one was given', async () => {
  const result = await runCheck({
    ...baseOptions(),
    config: {
      rules: { 'correctness.no-debugger': 'error', 'oxlint/no-such-rule': 'error', 'config.dead-override': 'warn' },
    } as never,
    configFile: 'slop-gate.config.ts',
    engines: [stubEngine({})],
  })

  const dead = result.diagnostics.filter((d) => d.concept === 'config.dead-override')
  expect(dead).toHaveLength(1)
  expect(dead[0]?.file).toBe('slop-gate.config.ts')
})

test('emits a diagnostic naming both rules when two rules overlap', async () => {
  const withOverlap: RuleEntry[] = [
    ...ENTRIES,
    { ...ENTRIES[0]!, engine: 'eslint', engineRuleId: 'no-debugger', tier: 2 },
  ]
  const result = await runCheck({
    ...baseOptions(),
    config: { rules: { 'correctness.no-debugger': 'error', 'config.rule-overlap': 'info' } } as never,
    entries: withOverlap,
    engines: [stubEngine({})],
  })

  const overlap = result.diagnostics.filter((d) => d.concept === 'config.rule-overlap')
  expect(overlap).toHaveLength(1)
  expect(overlap[0]?.message).toContain('oxlint/no-debugger')
  expect(overlap[0]?.message).toContain('eslint/no-debugger')
  expect(overlap[0]?.file).toBeNull()
})

test('sorts diagnostics by file then offset', async () => {
  await writeFile(join(dir, 'src/b.ts'), 'export function g() {\n  debugger\n}\n')
  const result = await runCheck({
    ...baseOptions(),
    engines: [stubEngine({ findings: [debuggerFinding('src/b.ts'), debuggerFinding('src/a.ts')] })],
  })

  expect(result.diagnostics.map((d) => d.file)).toEqual(['src/a.ts', 'src/b.ts'])
})

test('streams diagnostics before the done event', async () => {
  const events: string[] = []
  for await (const event of streamCheck({
    ...baseOptions(),
    engines: [stubEngine({ findings: [debuggerFinding('src/a.ts')] })],
  })) {
    events.push(event.type)
  }

  expect(events).toEqual(['diagnostic', 'done'])
})

test('reports the ruleset summary', async () => {
  const result = await runCheck({ ...baseOptions(), engines: [stubEngine({})] })
  expect(result.ruleset.enabledConcepts).toBeGreaterThan(0)
})

test('an override can enable a concept the base config never mentions, scoped to its glob', async () => {
  await mkdir(join(dir, 'legacy'), { recursive: true })
  await writeFile(join(dir, 'legacy/a.ts'), 'export function f() {\n  debugger\n}\n')

  const options = {
    ...baseOptions(),
    config: {
      rules: {},
      overrides: [{ files: ['legacy/**'], rules: { 'correctness.no-debugger': 'error' } }],
    } as never,
  }

  const result = await runCheck({
    ...options,
    engines: [stubEngine({ findings: [debuggerFinding('legacy/a.ts'), debuggerFinding('src/a.ts')] })],
  })

  const files = result.diagnostics.map((d) => d.file)
  expect(files).toContain('legacy/a.ts')
  expect(files).not.toContain('src/a.ts')
  expect(result.ruleset.enabledConcepts).toBeGreaterThan(0)

  // `legacy/a.ts` and `src/a.ts` are byte-identical, and this override makes their *severities*
  // diverge. A cache key that omits the file path (packages/core/src/cache/keys.ts) would make both
  // files collide on one cache entry: whichever file's result is written last silently overwrites
  // the other's on disk, so a second, cache-warm run must still resolve each file independently
  // rather than replaying a stale cross-file collision.
  const second = await runCheck({
    ...options,
    engines: [stubEngine({ findings: [debuggerFinding('legacy/a.ts'), debuggerFinding('src/a.ts')] })],
  })
  const secondFiles = second.diagnostics.map((d) => d.file)
  expect(secondFiles).toContain('legacy/a.ts')
  expect(secondFiles).not.toContain('src/a.ts')
})

test('an engine that provides a capability lets a capability-requiring rule be elected over one that needs nothing', async () => {
  const entries: RuleEntry[] = [
    {
      engine: 'tsgolint',
      engineRuleId: 'typed-rule',
      concepts: ['slop.as-any-cast'],
      tier: 1,
      priority: 100,
      severityDefault: 'warn',
      fixKind: 'none',
      fixTouches: [],
      requires: ['types'],
      languages: ['ts'],
      docsUrl: 'https://example.test/typed-rule',
      since: '0.1.0',
    },
    {
      engine: 'astgrep',
      engineRuleId: 'untyped-rule',
      concepts: ['slop.as-any-cast'],
      tier: 2,
      priority: 100,
      severityDefault: 'warn',
      fixKind: 'none',
      fixTouches: [],
      requires: [],
      languages: ['ts'],
      docsUrl: 'https://example.test/untyped-rule',
      since: '0.1.0',
    },
  ]
  const finding = (engineRuleId: string): RawDiagnostic => ({
    engineRuleId,
    message: 'x',
    severity: 'warning',
    file: 'src/a.ts',
    range: { start: 0, end: 1 },
  })

  const result = await runCheck({
    ...baseOptions(),
    config: { rules: { 'slop.as-any-cast': 'warn' } } as never,
    entries,
    engines: [
      stubEngine({ id: 'tsgolint', provides: ['types'], findings: [finding('typed-rule')] }),
      stubEngine({ id: 'astgrep', findings: [finding('untyped-rule')] }),
    ],
  })

  // `tsgolint`'s entry is tier 1 (lower, so it wins) but `requires: ['types']`. If the engine's own
  // declared capability never reaches election — `capabilities: new Set()` hard-coded regardless of
  // what any registered engine provides — that requirement can never be satisfied, `astgrep`'s
  // tier-2, no-requirements entry wins by default, and a rule that should have been elected never
  // is. Only one of the two engines' findings should survive ownership filtering.
  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]?.ruleId).toBe('tsgolint/typed-rule')
  expect(result.ruleset.uncovered).toEqual([])
})
