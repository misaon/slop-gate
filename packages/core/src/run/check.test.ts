import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createWalkFileSource } from '../discovery/inventory.ts'
import type { Engine, EngineRuleSelection, RawDiagnostic } from '../engine/types.ts'
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
  rulesetHash?: string
}): Engine =>
  ({
    id: options.id ?? 'oxlint',
    capabilities: { languages: ['ts'], granularity: 'file', provides: options.provides ?? [], fixes: false },
    version: async () => '1.75.0',
    materializeConfig: async () => ({ path: 'stub', rulesetHash: options.rulesetHash ?? 'stubhash', dispose: async () => {} }),
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

test('hands an engine the options configured for its elected rules', async () => {
  const seen: EngineRuleSelection[] = []
  const engine = stubEngine({})
  const recording: Engine = {
    ...engine,
    materializeConfig: async (selection, context) => {
      seen.push(selection)
      return engine.materializeConfig(selection, context)
    },
  }

  await runCheck({
    ...baseOptions(),
    config: { rules: { 'correctness.no-debugger': ['error', { probe: true }] } } as never,
    engines: [recording],
  })

  expect(seen).toHaveLength(1)
  expect([...(seen[0] ?? new Map())]).toEqual([['no-debugger', ['error', { probe: true }]]])
})

test('reports nothing for a generated file, and everything for it once asked', async () => {
  await writeFile(join(dir, 'src/client.gen.ts'), 'export function f() {\n  debugger\n}\n')
  const engines = () => [stubEngine({ findings: [debuggerFinding('src/client.gen.ts')] })]

  const skipped = await runCheck({ ...baseOptions(), engines: engines() })
  expect(skipped.diagnostics).toEqual([])
  expect(skipped.counts).toEqual({ error: 0, warn: 0, info: 0 })

  const checked = await runCheck({
    ...baseOptions(),
    config: { rules: { 'correctness.no-debugger': 'error' }, generated: 'check' } as never,
    engines: engines(),
  })
  expect(checked.diagnostics).toHaveLength(1)
  expect(checked.diagnostics[0]?.file).toBe('src/client.gen.ts')
})

test('returns a normalized diagnostic for an engine finding', async () => {
  const result = await runCheck({ ...baseOptions(), engines: [stubEngine({ findings: [debuggerFinding('src/a.ts')] })] })

  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]?.concept).toBe('correctness.no-debugger')
  expect(result.diagnostics[0]?.severity).toBe('error')
  expect(result.diagnostics[0]?.position.startLine).toBe(2)
  expect(result.counts).toEqual({ error: 1, warn: 0, info: 0 })
})

test('counts filesAnalysed as the files an engine plan actually covers, not everything scanned', async () => {
  await writeFile(join(dir, 'src/data.json'), '{}\n')
  const result = await runCheck({ ...baseOptions(), engines: [stubEngine({})] })

  expect(result.stats.filesScanned).toBe(3)
  expect(result.stats.filesAnalysed).toBe(1)
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

test('a project engine that claims a framework file language re-runs when one of those files changes', async () => {
  await writeFile(join(dir, 'src/App.vue'), '<script setup lang="ts">\nimport { a } from "./a"\n</script>\n')
  let runs = 0
  const engine = () =>
    ({
      ...stubEngine({ onRun: () => (runs += 1) }),
      capabilities: { languages: ['ts', 'vue'], granularity: 'project', provides: [], fixes: false },
    }) as Engine

  await runCheck({ ...baseOptions(), engines: [engine()] })
  await writeFile(join(dir, 'src/App.vue'), '<script setup lang="ts">\nconst a = 1\n</script>\n')
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

test('reports options set in an override as dead, while its level still applies', async () => {
  const result = await runCheck({
    ...baseOptions(),
    config: {
      rules: { 'correctness.no-debugger': 'warn', 'config.dead-override': 'warn' },
      overrides: [{ files: ['**/*.ts'], rules: { 'correctness.no-debugger': ['error', { probe: true }] } }],
    } as never,
    engines: [stubEngine({ findings: [debuggerFinding('src/a.ts')] })],
  })

  const dead = result.diagnostics.filter((d) => d.concept === 'config.dead-override')
  expect(dead).toHaveLength(1)
  expect(dead[0]?.message).toContain('correctness.no-debugger')
  expect(dead[0]?.message).toContain('cannot be scoped to a path')
  expect(result.diagnostics.find((d) => d.concept === 'correctness.no-debugger')?.severity).toBe('error')
})

test('a config diagnostic is attributed to no file when no config file was given', async () => {
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
    engines: [stubEngine({}), stubEngine({ id: 'eslint' })],
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

  const second = await runCheck({
    ...options,
    engines: [stubEngine({ findings: [debuggerFinding('legacy/a.ts'), debuggerFinding('src/a.ts')] })],
  })
  const secondFiles = second.diagnostics.map((d) => d.file)
  expect(secondFiles).toContain('legacy/a.ts')
  expect(secondFiles).not.toContain('src/a.ts')
})

const ruleFinding = (engineRuleId: string): RawDiagnostic => ({
  engineRuleId,
  message: 'x',
  severity: 'warning',
  file: 'src/a.ts',
  range: { start: 0, end: 1 },
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

  const result = await runCheck({
    ...baseOptions(),
    config: { rules: { 'slop.as-any-cast': 'warn' } } as never,
    entries,
    engines: [
      stubEngine({ id: 'tsgolint', provides: ['types'], findings: [ruleFinding('typed-rule')] }),
      stubEngine({ id: 'astgrep', findings: [ruleFinding('untyped-rule')] }),
    ],
  })

  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]?.ruleRefKey).toBe('tsgolint/typed-rule')
  expect(result.ruleset.uncovered).toEqual([])
})

const NEXT_LINE = `sgate-disable${'-next-line'}`

const withUnusedSuppressionOn = () => ({
  ...baseOptions(),
  config: {
    rules: { 'correctness.no-debugger': 'error', 'config.unused-suppression': 'warn' },
  } as never,
})

test('a suppressed finding is hidden from the default result and does not count toward severity totals', async () => {
  const source = `// ${NEXT_LINE} correctness.no-debugger -- reason\ndebugger\n`
  await writeFile(join(dir, 'src/a.ts'), source)
  const offset = source.lastIndexOf('debugger')

  const result = await runCheck({
    ...baseOptions(),
    engines: [stubEngine({ findings: [{ ...debuggerFinding('src/a.ts'), range: { start: offset, end: offset + 8 } }] })],
  })

  expect(result.diagnostics.some((d) => d.concept === 'correctness.no-debugger')).toBe(false)
  expect(result.counts).toEqual({ error: 0, warn: 0, info: 0 })
})

test('an unused-suppression diagnostic is served from the cache, not recomputed, on the second run', async () => {
  await writeFile(join(dir, 'src/a.ts'), `// ${NEXT_LINE} correctness.no-debugger -- stale, fixed in #1\nconst clean = 1\n`)
  let runs = 0
  const engine = () => stubEngine({ onRun: () => (runs += 1) })

  const cold = await runCheck({ ...withUnusedSuppressionOn(), engines: [engine()] })
  const warm = await runCheck({ ...withUnusedSuppressionOn(), engines: [engine()] })

  expect(runs).toBe(1)
  expect(cold.diagnostics.map((d) => d.concept)).toEqual(['config.unused-suppression'])
  expect(warm.diagnostics).toEqual(cold.diagnostics)
  expect(warm.stats.filesFromCache).toBeGreaterThan(0)
})

test('a zero-finding file is still scanned for a stale suppression on a cold run', async () => {
  await writeFile(join(dir, 'src/a.ts'), `// ${NEXT_LINE} correctness.no-debugger -- stale\nconst clean = 1\n`)
  const result = await runCheck({ ...withUnusedSuppressionOn(), engines: [stubEngine({})] })

  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]).toMatchObject({ concept: 'config.unused-suppression', file: 'src/a.ts' })
})

test('removing the suppression comment invalidates the cache and reveals the finding it was hiding', async () => {
  const suppressed = `// ${NEXT_LINE} correctness.no-debugger -- reason\ndebugger\n`
  await writeFile(join(dir, 'src/a.ts'), suppressed)
  const suppressedOffset = suppressed.lastIndexOf('debugger')
  const options = { ...baseOptions(), engines: [stubEngine({ findings: [{ ...debuggerFinding('src/a.ts'), range: { start: suppressedOffset, end: suppressedOffset + 8 } }] })] }

  const first = await runCheck(options)
  expect(first.diagnostics.some((d) => d.concept === 'correctness.no-debugger')).toBe(false)

  const bare = 'debugger\n'
  await writeFile(join(dir, 'src/a.ts'), bare)
  const bareOffset = bare.indexOf('debugger')
  const second = await runCheck({
    ...baseOptions(),
    engines: [stubEngine({ findings: [{ ...debuggerFinding('src/a.ts'), range: { start: bareOffset, end: bareOffset + 8 } }] })],
  })

  expect(second.diagnostics.some((d) => d.concept === 'correctness.no-debugger')).toBe(true)
})

const TSC_ENTRIES: RuleEntry[] = [
  {
    engine: 'tsc',
    engineRuleId: 'type-error',
    concepts: ['types.type-error'],
    tier: 1,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts'],
    docsUrl: 'https://example.test/type-error',
    since: '0.1.0',
  },
]

const stubProjectEngine = (options: {
  id?: EngineId
  findings?: RawDiagnostic[]
  onRun?: (batchPaths: string[]) => void
  onDispose?: () => void
  rulesetHash?: string
  fail?: string
}): Engine =>
  ({
    id: options.id ?? 'tsc',
    capabilities: { languages: ['ts'], granularity: 'project', provides: [], fixes: false },
    version: async () => '5.9.3',
    materializeConfig: async () => ({
      path: 'stub-tsconfig',
      rulesetHash: options.rulesetHash ?? 'stubhash',
      async dispose() {
        options.onDispose?.()
      },
    }),
    run: (batch) =>
      (async function* () {
        options.onRun?.(batch.files.map((f) => f.path))
        if (options.fail !== undefined) throw new Error(options.fail)
        for (const finding of options.findings ?? []) yield finding
      })(),
  }) satisfies Engine

const typeErrorFinding = (file: string): RawDiagnostic => ({
  engineRuleId: 'type-error',
  message: "Type 'string' is not assignable to type 'number'.",
  severity: 'error',
  file,
  range: { start: 0, end: 1 },
})

const projectOptions = () => ({
  rootDir: dir,
  config: { rules: { 'types.type-error': 'error' } } as never,
  entries: TSC_ENTRIES,
  fileSource: createWalkFileSource(),
  cacheDir: join(dir, '.slop-gate', 'cache'),
})

test('a project engine receives every assigned file in one run() call, never chunked into batches', async () => {
  await writeFile(join(dir, 'src/b.ts'), 'export const b = 1\n')
  const calls: string[][] = []
  const result = await runCheck({
    ...projectOptions(),
    batchSize: 1,
    engines: [stubProjectEngine({ onRun: (paths) => calls.push(paths) })],
  })

  expect(calls).toHaveLength(1)
  expect(calls[0]?.slice().sort()).toEqual(['src/a.ts', 'src/b.ts'])
  expect(result.stats.filesAnalysed).toBe(2)
})

test('a second identical run for a project engine is served from one aggregate cache entry', async () => {
  let runs = 0
  const engine = () => stubProjectEngine({ findings: [typeErrorFinding('src/a.ts')], onRun: () => (runs += 1) })

  const first = await runCheck({ ...projectOptions(), engines: [engine()] })
  const second = await runCheck({ ...projectOptions(), engines: [engine()] })

  expect(runs).toBe(1)
  expect(second.diagnostics).toEqual(first.diagnostics)
  expect(second.stats.filesFromCache).toBeGreaterThan(0)
})

test('a project cache hit counts every assigned file toward filesFromCache, not just the ones with findings', async () => {
  await writeFile(join(dir, 'src/b.ts'), 'export const b = 1\n')
  const engine = () => stubProjectEngine({ findings: [typeErrorFinding('src/a.ts')] })

  await runCheck({ ...projectOptions(), engines: [engine()] })
  const second = await runCheck({ ...projectOptions(), engines: [engine()] })

  expect(second.stats.filesFromCache).toBe(2)
})

test('changing any one file in the project invalidates the whole aggregate cache entry, not just that file', async () => {
  await writeFile(join(dir, 'src/b.ts'), 'export const b = 1\n')
  let runs = 0
  const engine = () => stubProjectEngine({ findings: [typeErrorFinding('src/a.ts')], onRun: () => (runs += 1) })

  await runCheck({ ...projectOptions(), engines: [engine()] })
  await writeFile(join(dir, 'src/b.ts'), 'export const b = 2\n')
  await runCheck({ ...projectOptions(), engines: [engine()] })

  expect(runs).toBe(2)
})

test('a project engine re-runs after its own ruleset hash changes, even with no file changed', async () => {
  let runs = 0
  const engine = (rulesetHash: string) =>
    stubProjectEngine({ findings: [typeErrorFinding('src/a.ts')], rulesetHash, onRun: () => (runs += 1) })

  await runCheck({ ...projectOptions(), engines: [engine('hash-1')] })
  await runCheck({ ...projectOptions(), engines: [engine('hash-2')] })

  expect(runs).toBe(2)
})

test('a project engine clean file is still scanned for a stale suppression on a cold run', async () => {
  await writeFile(join(dir, 'src/a.ts'), `// ${NEXT_LINE} types.type-error -- stale\nconst clean = 1\n`)
  const result = await runCheck({
    ...projectOptions(),
    config: { rules: { 'types.type-error': 'error', 'config.unused-suppression': 'warn' } } as never,
    engines: [stubProjectEngine({})],
  })

  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]).toMatchObject({ concept: 'config.unused-suppression', file: 'src/a.ts' })
})

test('a project engine diagnostic for a file outside the assignment (e.g. the tsconfig itself) is still reported', async () => {
  await writeFile(join(dir, 'tsconfig.json'), '{}\n')
  const result = await runCheck({
    ...projectOptions(),
    engines: [stubProjectEngine({ findings: [typeErrorFinding('tsconfig.json')] })],
  })

  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]?.file).toBe('tsconfig.json')
})

test('a project engine failure is reported without aborting the run, and still disposes the handle', async () => {
  let disposed = false
  const result = await runCheck({
    ...projectOptions(),
    engines: [stubProjectEngine({ fail: 'tsc boom', onDispose: () => (disposed = true) })],
  })

  expect(result.engineFailures).toEqual([{ engine: 'tsc', message: 'tsc boom' }])
  expect(result.diagnostics).toEqual([])
  expect(disposed).toBe(true)
})

test('toggling config.unused-suppression itself invalidates the cache and changes what is reported', async () => {
  await writeFile(join(dir, 'src/a.ts'), `// ${NEXT_LINE} correctness.no-debugger -- stale\nconst clean = 1\n`)

  const on = await runCheck({ ...withUnusedSuppressionOn(), engines: [stubEngine({})] })
  const off = await runCheck({
    ...baseOptions(),
    config: { rules: { 'correctness.no-debugger': 'error', 'config.unused-suppression': 'off' } } as never,
    engines: [stubEngine({})],
  })

  expect(on.diagnostics.some((d) => d.concept === 'config.unused-suppression')).toBe(true)
  expect(off.diagnostics.some((d) => d.concept === 'config.unused-suppression')).toBe(false)
})

const EXTRANEOUS_CLASS_ENTRY: RuleEntry = {
  ...ENTRIES[0]!,
  engineRuleId: 'no-extraneous-class',
  concepts: ['suspicious.no-extraneous-class'],
}

const extraneousClassFinding: RawDiagnostic = {
  engineRuleId: 'no-extraneous-class',
  message: 'Unexpected empty class',
  severity: 'error',
  file: 'src/a.ts',
  range: { start: 0, end: 5 },
}

const presetEnabled = () => ({
  ...baseOptions(),
  config: { extends: ['recommended'] } as never,
  entries: [...ENTRIES, EXTRANEOUS_CLASS_ENTRY],
  engines: [stubEngine({ findings: [debuggerFinding('src/a.ts'), extraneousClassFinding] })],
})

const withNestDependency = async (): Promise<void> => {
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies: { '@nestjs/core': '^11.0.0' } }),
  )
}

test('a dependency change that turns one of two concepts off is not served from the warm cache', async () => {
  const cold = await runCheck(presetEnabled())
  expect(cold.diagnostics.map((d) => d.concept).sort()).toEqual([
    'correctness.no-debugger',
    'suspicious.no-extraneous-class',
  ])

  const warm = await runCheck(presetEnabled())
  expect(warm.stats.filesFromCache).toBeGreaterThan(0)
  expect(warm.diagnostics).toHaveLength(2)

  await withNestDependency()

  const detected = await runCheck(presetEnabled())
  expect(detected.diagnostics.map((d) => d.concept)).toEqual(['correctness.no-debugger'])
})

test('removing the dependency again re-enables the concept, so the layer is not sticky', async () => {
  await withNestDependency()
  expect((await runCheck(presetEnabled())).diagnostics).toHaveLength(1)

  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  expect((await runCheck(presetEnabled())).diagnostics).toHaveLength(2)
})

test('a concept the user enables in their own config survives a framework that would disable it', async () => {
  await withNestDependency()
  const result = await runCheck({
    ...presetEnabled(),
    config: { extends: ['recommended'], rules: { 'suspicious.no-extraneous-class': 'error' } } as never,
  })

  expect(result.diagnostics.map((d) => d.concept).sort()).toEqual([
    'correctness.no-debugger',
    'suspicious.no-extraneous-class',
  ])
})

test('an Angular repository gets the empty-class concept turned off, same as a NestJS one', async () => {
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies: { '@angular/core': '^19.0.0' } }),
  )

  const result = await runCheck(presetEnabled())
  expect(result.diagnostics.map((d) => d.concept)).toEqual(['correctness.no-debugger'])
})

const suppression = (rest: string): string => `// sgate-${'disable-next-line'} ${rest}`

const TWO_ENGINE_ENTRIES: RuleEntry[] = [
  ...ENTRIES,
  {
    engine: 'astgrep',
    engineRuleId: 'slop-double-cast',
    concepts: ['slop.double-cast'],
    tier: 0,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts'],
    docsUrl: 'https://example.test/slop-double-cast',
    since: '0.1.0',
  },
]

const TWO_ENGINE_RULES = { 'correctness.no-debugger': 'error', 'slop.double-cast': 'warn', 'config.unused-suppression': 'warn' }

const twoEngineOptions = (engines: Engine[]) => ({
  ...baseOptions(),
  entries: TWO_ENGINE_ENTRIES,
  config: { rules: TWO_ENGINE_RULES } as never,
  engines,
})

test('filesFromCache counts files, not cache entries, so it can never exceed filesAnalysed', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export function f() {\n  debugger\n}\n')

  await runCheck(twoEngineOptions([stubEngine({ id: 'oxlint' }), stubEngine({ id: 'astgrep' })]))
  const warm = await runCheck(twoEngineOptions([stubEngine({ id: 'oxlint' }), stubEngine({ id: 'astgrep' })]))

  expect(warm.stats.filesAnalysed).toBe(1)
  expect(warm.stats.filesFromCache).toBe(1)
})

test('a file one engine still had to look at is not counted as served from cache', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export function f() {\n  debugger\n}\n')

  await runCheck(twoEngineOptions([stubEngine({ id: 'oxlint' }), stubEngine({ id: 'astgrep', rulesetHash: 'before' })]))
  const warm = await runCheck(twoEngineOptions([stubEngine({ id: 'oxlint' }), stubEngine({ id: 'astgrep', rulesetHash: 'after' })]))

  expect(warm.stats.filesAnalysed).toBe(1)
  expect(warm.stats.filesFromCache).toBe(0)
})

test('hands a spawning engine a version cache, and withholds it under --no-cache', async () => {
  const seen: Array<unknown> = []
  const probing = (): Engine => ({
    ...stubEngine({}),
    version: async (cache) => {
      seen.push(cache)
      return '1.75.0'
    },
  })

  await runCheck({ ...baseOptions(), engines: [probing()] })
  expect(seen).toHaveLength(1)
  expect(seen[0]).toBeDefined()

  await runCheck({ ...baseOptions(), engines: [probing()], useCache: false })
  expect(seen[1]).toBeUndefined()
})

test('reports each engine its own cache coverage, so the strict aggregate cannot be read as the whole story', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export function f() {\n  debugger\n}\n')

  await runCheck(twoEngineOptions([stubEngine({ id: 'oxlint' }), stubEngine({ id: 'astgrep', rulesetHash: 'before' })]))
  const warm = await runCheck(twoEngineOptions([stubEngine({ id: 'oxlint' }), stubEngine({ id: 'astgrep', rulesetHash: 'after' })]))

  expect(warm.stats.filesFromCache).toBe(0)
  expect(warm.stats.cacheByEngine).toEqual([
    { engine: 'astgrep', filesAssigned: 1, filesFromCache: 0 },
    { engine: 'oxlint', filesAssigned: 1, filesFromCache: 1 },
  ])
})

test('an engine that failed reports no cache coverage of its own', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export function f() {\n  debugger\n}\n')
  const broken = (): Engine => ({
    ...stubEngine({ id: 'astgrep' }),
    async materializeConfig() {
      throw new Error('nope')
    },
  })

  await runCheck(twoEngineOptions([stubEngine({ id: 'oxlint' }), broken()]))
  const warm = await runCheck(twoEngineOptions([stubEngine({ id: 'oxlint' }), broken()]))

  expect(warm.engineFailures).toHaveLength(1)
  expect(warm.stats.cacheByEngine).toEqual([
    { engine: 'astgrep', filesAssigned: 1, filesFromCache: 0 },
    { engine: 'oxlint', filesAssigned: 1, filesFromCache: 1 },
  ])
})

test('an engine whose version cannot be resolved fails alone, and the rest of the plan still runs', async () => {
  const broken: Engine = {
    ...stubEngine({ id: 'astgrep' }),
    version: async () => {
      throw new Error('ast-grep is not installed')
    },
  }

  const events: string[] = []
  let done: Awaited<ReturnType<typeof runCheck>> | null = null
  for await (const event of streamCheck(
    twoEngineOptions([stubEngine({ id: 'oxlint', findings: [debuggerFinding('src/a.ts')] }), broken]),
  )) {
    if (event.type === 'diagnostic') events.push(`diagnostic:${event.diagnostic.concept}`)
    if (event.type === 'engine-failed') events.push(`failed:${event.engine}:${event.message}`)
    if (event.type === 'done') done = event.result
  }

  expect(events).toContain('failed:astgrep:ast-grep is not installed')
  expect(events).toContain('diagnostic:correctness.no-debugger')
  expect(done?.engineFailures).toEqual([{ engine: 'astgrep', message: 'ast-grep is not installed' }])
  expect(done?.stats.enginesRun).toBe(1)
})

test('an assignment streams its files in plan order, whether served fresh or from the cache', async () => {
  const paths = Array.from({ length: 24 }, (_unused, i) => `src/f${String(i).padStart(2, '0')}.ts`)
  for (const path of paths) await writeFile(join(dir, path), 'export function f() {\n  debugger\n}\n')

  const options = () => ({ ...baseOptions(), engines: [stubEngine({ findings: paths.map(debuggerFinding) })] })
  const streamed = async (): Promise<string[]> => {
    const files: string[] = []
    for await (const event of streamCheck(options())) {
      if (event.type === 'diagnostic' && event.diagnostic.file !== null) files.push(event.diagnostic.file)
    }
    return files
  }

  const fresh = await streamed()
  const warm = await streamed()

  expect(fresh).toEqual(paths)
  expect(warm).toEqual(paths)
})

test('a directive is reported once, not once per file-granularity engine', async () => {
  await writeFile(join(dir, 'src/a.ts'), `${suppression('style.nobody-owns-this -- stale')}\nexport function f() {\n  debugger\n}\n`)

  const result = await runCheck({
    ...baseOptions(),
    entries: TWO_ENGINE_ENTRIES,
    config: { rules: TWO_ENGINE_RULES } as never,
    engines: [stubEngine({ id: 'oxlint' }), stubEngine({ id: 'astgrep' })],
  })

  expect(result.diagnostics.filter((d) => d.concept === 'config.unused-suppression')).toHaveLength(1)
})

test('two directives written on one line stay two findings', async () => {
  const line = `${suppression('style.nobody-owns-this -- one')} ${suppression('style.nor-this -- two')}`
  await writeFile(join(dir, 'src/a.ts'), `${line}\nexport function f() {\n  debugger\n}\n`)

  const result = await runCheck({
    ...baseOptions(),
    entries: TWO_ENGINE_ENTRIES,
    config: { rules: TWO_ENGINE_RULES } as never,
    engines: [stubEngine({ id: 'oxlint' }), stubEngine({ id: 'astgrep' })],
  })

  expect(result.diagnostics.filter((d) => d.concept === 'config.unused-suppression')).toHaveLength(2)
})

test('an engine appearing moves the concept to it, and the warm cache does not serve the old owner', async () => {
  const optional = (available: boolean): Engine => ({
    ...stubEngine({ id: 'astgrep', findings: [debuggerFinding('src/a.ts')] }),
    availability: async () => (available ? { available: true } : { available: false, reason: 'not installed' }),
  })
  const always = (): Engine => {
    const base = stubEngine({ id: 'oxlint', findings: [debuggerFinding('src/a.ts')] })
    return {
      ...base,
      materializeConfig: async (selection) => ({
        path: 'stub',
        rulesetHash: [...selection.keys()].sort().join(','),
        dispose: async () => {},
      }),
    }
  }
  const entries = [
    { ...ENTRIES[0]!, engine: 'oxlint' as const, engineRuleId: 'no-debugger', tier: 2 as const },
    { ...ENTRIES[0]!, engine: 'astgrep' as const, engineRuleId: 'no-debugger', tier: 0 as const },
  ]

  const cold = await runCheck({ ...baseOptions(), entries, engines: [always(), optional(false)] })
  expect(cold.diagnostics.map((d) => d.engine)).toEqual(['oxlint'])

  const warm = await runCheck({ ...baseOptions(), entries, engines: [always(), optional(false)] })
  expect(warm.stats.filesFromCache).toBeGreaterThan(0)

  const installed = await runCheck({ ...baseOptions(), entries, engines: [always(), optional(true)] })
  expect(installed.diagnostics.map((d) => d.engine)).toEqual(['astgrep'])
})

test('the result names the engine that could not run and what its absence cost', async () => {
  const binary = join(dir, 'bin', 'nonexistent-linter')
  const optional = (): Engine => ({
    ...stubEngine({ id: 'astgrep', findings: [debuggerFinding('src/a.ts')] }),
    availability: async () =>
      existsSync(binary)
        ? { available: true }
        : { available: false, reason: '`nonexistent-linter` is not installed', install: 'brew install nonexistent-linter' },
  })
  const entries = [
    { ...ENTRIES[0]!, engine: 'oxlint' as const, tier: 2 as const },
    { ...ENTRIES[0]!, engine: 'astgrep' as const, tier: 0 as const },
  ]

  const result = await runCheck({
    ...baseOptions(),
    entries,
    engines: [stubEngine({ findings: [debuggerFinding('src/a.ts')] }), optional()],
  })

  expect(result.unavailableEngines).toEqual([
    {
      engine: 'astgrep',
      reason: '`nonexistent-linter` is not installed',
      install: 'brew install nonexistent-linter',
      displaced: [
        {
          concept: 'correctness.no-debugger',
          languages: ['ts'],
          wouldOwn: { engine: 'astgrep', engineRuleId: 'no-debugger' },
          insteadOwnedBy: { engine: 'oxlint', engineRuleId: 'no-debugger' },
        },
      ],
    },
  ])
  expect(result.engineFailures).toEqual([])
})

test('an absent engine that would have lost anyway is reported with nothing displaced', async () => {
  const optional = (): Engine => ({
    ...stubEngine({ id: 'astgrep' }),
    availability: async () => ({ available: false, reason: 'not installed' }),
  })
  const entries = [
    { ...ENTRIES[0]!, engine: 'oxlint' as const, tier: 0 as const },
    { ...ENTRIES[0]!, engine: 'astgrep' as const, tier: 2 as const },
  ]

  const result = await runCheck({ ...baseOptions(), entries, engines: [stubEngine({}), optional()] })

  expect(result.unavailableEngines).toEqual([{ engine: 'astgrep', reason: 'not installed', displaced: [] }])
})

test('a run nobody asked to time carries no timing report at all', async () => {
  const result = await runCheck({ ...baseOptions(), engines: [stubEngine({ findings: [debuggerFinding('src/a.ts')] })] })

  expect(result.timings).toBeUndefined()
})

test('the timing rows name the walk, arbitration and the engine, and account for the whole reported duration', async () => {
  const result = await runCheck({
    ...baseOptions(),
    engines: [stubEngine({ findings: [debuggerFinding('src/a.ts')] })],
    timing: true,
    startedAt: 0,
  })

  const report = result.timings!
  const names = report.phases.map((phase) => phase.name)
  expect(names).toEqual(expect.arrayContaining(['discover', 'arbitrate', 'versions', 'run:oxlint', 'normalize:oxlint']))
  expect(names).not.toContain('version:oxlint')

  expect(report.startupMs).toBeGreaterThan(0)
  expect(report.unattributedMs).toBeGreaterThanOrEqual(0)
  // Engines run concurrently, so the phases overlap and their durations sum above the run. `busyMs`
  // is the wall clock they occupied between them, and that is what still adds up exactly.
  const summed = report.startupMs + report.busyMs + report.unattributedMs
  expect(Math.abs(summed - result.stats.durationMs)).toBeLessThan(1)
  expect(report.phases.reduce((total, phase) => total + phase.durationMs, 0)).toBeGreaterThanOrEqual(report.busyMs)

  expect(report.rules).toEqual([{ ruleRefKey: 'oxlint/no-debugger', findings: 1 }])
})

test('a long-lived host that does not claim process start is charged no startup', async () => {
  const result = await runCheck({
    ...baseOptions(),
    engines: [stubEngine({ findings: [debuggerFinding('src/a.ts')] })],
    timing: true,
  })

  expect(result.timings?.startupMs).toBe(0)
})

test('a --no-cache run writes nothing into the analysed repository', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'sgate-nocache-writes-'))
  try {
    await writeFile(join(repo, 'package.json'), JSON.stringify({ name: 'r', version: '0.0.0', type: 'module' }))
    await mkdir(join(repo, 'src'), { recursive: true })
    await writeFile(join(repo, 'src', 'a.ts'), 'export const a = 1\n')

    await runCheck({ rootDir: repo, config: { extends: [] }, engines: [], useCache: false })

    expect(existsSync(join(repo, '.slop-gate'))).toBe(false)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})
