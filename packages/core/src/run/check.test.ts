import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createWalkFileSource } from '../discovery/inventory.ts'
import type { Engine, RawDiagnostic } from '../engine/types.ts'
import type { RuleEntry } from '../registry/types.ts'
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
  findings?: RawDiagnostic[]
  fail?: string
  onRun?: () => void
}): Engine =>
  ({
    id: 'oxlint',
    capabilities: { languages: ['ts'], granularity: 'file', provides: [], fixes: false },
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

  const result = await runCheck({
    ...baseOptions(),
    config: {
      rules: {},
      overrides: [{ files: ['legacy/**'], rules: { 'correctness.no-debugger': 'error' } }],
    } as never,
    engines: [stubEngine({ findings: [debuggerFinding('legacy/a.ts'), debuggerFinding('src/a.ts')] })],
  })

  const files = result.diagnostics.map((d) => d.file)
  expect(files).toContain('legacy/a.ts')
  expect(files).not.toContain('src/a.ts')
  expect(result.ruleset.enabledConcepts).toBeGreaterThan(0)
})
