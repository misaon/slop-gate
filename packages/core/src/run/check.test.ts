import { existsSync } from 'node:fs'
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

test('counts filesAnalysed as the files an engine plan actually covers, not everything scanned', async () => {
  // `stubEngine`'s declared languages are `['ts']`, so of the three files a real inventory walk
  // finds here (the root package.json, src/a.ts, and this new src/data.json), only src/a.ts is
  // ever a candidate for analysis or caching — the two `.json` files are real, scanned files that
  // no engine claims, which is exactly the gap `filesAnalysed` exists to stop `filesScanned` from
  // hiding.
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
    // Both engines must actually participate, or arbitration now drops the `eslint` entry before
    // it can even compete — this run is the one deliberately proving a real overlap resolves
    // correctly when both sides of it are actually present, not a run reproducing the M0 defect
    // where an entry for an absent engine still generated a suppression.
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

  // `tsgolint`'s entry is tier 1 (lower, so it wins) but `requires: ['types']`. If the engine's own
  // declared capability never reaches election — `capabilities: new Set()` hard-coded regardless of
  // what any registered engine provides — that requirement can never be satisfied, `astgrep`'s
  // tier-2, no-requirements entry wins by default, and a rule that should have been elected never
  // is. Only one of the two engines' findings should survive ownership filtering.
  expect(result.diagnostics).toHaveLength(1)
  expect(result.diagnostics[0]?.ruleId).toBe('tsgolint/typed-rule')
  expect(result.ruleset.uncovered).toEqual([])
})

// --- Inline suppressions (design spec §6.3) -------------------------------------------------------

// Spliced rather than written whole — the same idiom, for the same reason, as
// `reporters/src/agent.ts`. `parseSuppressions` scans raw text with no notion of comments or string
// literals, so a fixture that spells the token out verbatim is a real directive as far as
// `sgate check` on this repository is concerned, reported as `config.unused-suppression` against this
// file. Only the source text is broken: the value is byte-for-byte the real token, which is the
// point — these tests write fixture files a real run then has to parse.
const NEXT_LINE = `sgate-disable${'-next-line'}`

// A function, not a top-level constant: `baseOptions()` reads `dir`, which `beforeEach` only sets
// once a test is actually running — evaluating this eagerly at module load time would run before
// any `dir` exists at all.
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
  // The comment targets a concept this file never actually reports (the file is otherwise clean),
  // so the directive is unused from the very first run — the scenario `fileRaws.length === 0` used
  // to short-circuit past entirely (see the comment in check.ts this test guards).
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
  // Same fixture as above, but asserted against a single cold run: proves the detection does not
  // depend on having already primed anything via a previous call — the very first `runCheck` must
  // already read this file's source and parse it, even though the engine reports nothing for it.
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

// --- Project granularity (spec §8.1/§9) -----------------------------------------------------------

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
  // A tiny batchSize would chunk a file-granularity engine into two run() calls; a project engine
  // must ignore it — asking `tsc` about a subset of its program is wrong, not just slower (§8.1).
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

  // Two files assigned (src/a.ts, src/b.ts); a project cache hit is all-or-nothing, not per file.
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
  // tsconfig.json is JSON, not TS — buildPlan never assigns it to a `languages: ['ts']` engine, so
  // this exercises the "an engine reported against a file outside its own assignment" path
  // deliberately, rather than by accident.
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
  // The ruleset hash (`configHash` in check.ts, folded into every cache key) has to move when a
  // rule's *own* level changes, not just when a rule it detects changes — otherwise a warm run
  // would keep serving a suppression's cached "unused" verdict from before the concept was turned
  // off, or keep hiding it after turning it on, regardless of what the current config says.
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

/** `recommended` (a preset — §6.2 layer 2) enables it; the framework layer sits above and may turn
 *  it off, which is the whole arrangement these two tests exercise from opposite sides. */
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

/**
 * Spec §23.4, and the reason `configHash` folds in the detection result rather than only the config
 * and the entries.
 *
 * The shape matters, and the obvious version of this test does not have teeth: if the *only* enabled
 * concept is the one the framework disables, the engine drops out of the plan entirely and the cache
 * is never consulted, so the assertion passes with or without the fold. Two concepts are needed — one
 * the framework leaves alone, so the engine still runs and the file is still a cache candidate, and
 * one it turns off. `src/a.ts` is byte-identical across all three runs and `package.json` is not a
 * file this engine claims, so nothing else in the per-file key moves. Without the fold, the warm run
 * replays the cached array and keeps reporting a concept that is no longer enabled.
 */
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

/**
 * The framework layer never wins an argument with a person (spec §23.2). A user who writes this rule
 * into their own config in a NestJS repository means it, and gets it — root config is §6.2 layer 4,
 * above the framework layer at 3.
 */
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

/**
 * The `angular` profile end to end, and the reason it exists at all: `@NgModule({...}) export class
 * AppModule {}` is the identical construct `no-extraneous-class` was measured 11/11 wrong on in
 * NestJS. Unlike the other profiles this one's warrant is mechanism identity rather than its own
 * false-positive count (spec §23.5), so the thing worth pinning is that detection and the layer
 * actually connect — not a finding rate this test could not honestly produce anyway.
 */
test('an Angular repository gets the empty-class concept turned off, same as a NestJS one', async () => {
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies: { '@angular/core': '^19.0.0' } }),
  )

  const result = await runCheck(presetEnabled())
  expect(result.diagnostics.map((d) => d.concept)).toEqual(['correctness.no-debugger'])
})

// See the identical note in engine/normalize.test.ts: assembled from parts so a test *about*
// suppression directives does not leave phantom ones in this file's own text.
const suppression = (rest: string): string => `// sgate-${'disable-next-line'} ${rest}`

// Without this, `stubEngine({ id: 'astgrep' })` is never assigned any work: `buildPlan` only gives
// an engine files if some elected concept resolves to it, so the second engine would silently drop
// out and the two tests below would pass whether or not the collapse exists at all. That is the
// vacuous-plan trap the M0 follow-ups record, reproduced here on the first attempt.
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

test('a directive is reported once, not once per file-granularity engine', async () => {
  // Two file-granularity engines assigned the same file each run their own `normalizeDiagnostics`
  // pass over it, and each synthesises its own `config.unused-suppression`. Unreachable while oxlint
  // was the only one; adding ast-grep doubled both orchestrator concepts on this repository (45 → 90
  // and 4 → 8) before this collapse existed.
  //
  // Both engines must be assigned the file for this to prove anything — see `TWO_ENGINE_ENTRIES`.
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
  // The collapse keys on the directive's message as well as its position, because the message names
  // the targets. Keying on position alone would silently merge these — and keying on `fingerprint`
  // would not collapse the cross-engine duplicate above at all, since its occurrence index is
  // counted per `normalizeDiagnostics` call and the two engines no longer judge the same subset.
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
  // What this proves: ownership transfer across an availability change is never served stale.
  //
  // What it does **not** prove, and no test here does: that folding `unavailableEngines` into
  // `configHash` is what prevents that. It passes with the fold removed, because the ownership
  // change already alters each engine's `rulesetHash` and assignment. The fold is kept as cheap
  // insurance and `check.ts` says so; do not read this test as guarding it.
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

  // astgrep appears. It outranks oxlint, so it takes the concept and oxlint must fall silent.
  const installed = await runCheck({ ...baseOptions(), entries, engines: [always(), optional(true)] })
  expect(installed.diagnostics.map((d) => d.engine)).toEqual(['astgrep'])
})

test('the result names the engine that could not run and what its absence cost', async () => {
  // A real `stat` against a path that genuinely does not exist, not a hard-coded boolean: this is
  // the whole budget `Engine.availability` allows an adapter, so it is the shape the mechanism has
  // to work against.
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
