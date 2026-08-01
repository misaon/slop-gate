import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createWalkFileSource } from '../discovery/inventory.ts'
import type { Engine, RawDiagnostic } from '../engine/types.ts'
import type { ConceptId } from '../concepts/catalogue.ts'
import type { EngineId, RuleEntry } from '../registry/types.ts'
import { runFix, type FixOptions } from './fix.ts'

let dir: string

/**
 * Every rule in a test needs its **own** concept. Arbitration elects exactly one owner per concept
 * (spec §5.3) and `normalizeDiagnostics` drops any diagnostic from a non-owner, so two entries
 * sharing a concept silently reduces to one rule ever reporting — which would make every overlap and
 * oscillation test below pass for the wrong reason.
 */
const CONCEPTS = [
  'correctness.no-debugger',
  'style.no-var',
  'dead-code.unused-import',
  'dead-code.unused-variable',
  'slop.double-cast',
] as const satisfies readonly ConceptId[]

const entry = (over: Partial<RuleEntry> & Pick<RuleEntry, 'engineRuleId' | 'concepts'>): RuleEntry => ({
  engine: 'oxlint',
  tier: 0,
  priority: 50,
  severityDefault: 'error',
  fixKind: 'safe',
  fixTouches: ['statements'],
  requires: [],
  languages: ['ts'],
  docsUrl: 'https://example.test/rule',
  since: '0.1.0',
  ...over,
})

/**
 * An engine whose findings are recomputed from the file's *current* content on every `run` — the
 * only way to test a loop whose whole purpose is re-running engines over files it just rewrote. A
 * fixed finding list would make every pass identical and every convergence test vacuous.
 */
const reactiveEngine = (options: {
  id?: EngineId
  granularity?: 'file' | 'project'
  onRun?: (source: string, path: string) => readonly RawDiagnostic[]
  failWith?: string
}): Engine => ({
  id: options.id ?? 'oxlint',
  capabilities: { languages: ['ts'], granularity: options.granularity ?? 'file', provides: [], fixes: true },
  version: async () => '1.76.0',
  materializeConfig: async () => ({ path: 'stub', rulesetHash: 'stub', dispose: async () => {} }),
  run: (batch) =>
    (async function* () {
      if (options.failWith !== undefined) throw new Error(options.failWith)
      for (const file of batch.files) {
        const source = await readFile(join(dir, file.path), 'utf8')
        for (const found of options.onRun?.(source, file.path) ?? []) yield { ...found, file: found.file ?? file.path }
      }
    })(),
})

type Found = Omit<RawDiagnostic, 'file' | 'message' | 'severity'> & { file?: string }

const finding = (over: Found): RawDiagnostic => ({
  message: 'finding',
  severity: 'error',
  file: 'src/a.ts',
  ...over,
})

/** A finding whose fix rewrites exactly the range it reports. The shape almost every test wants. */
const fixAt = (engineRuleId: string, start: number, end: number, replacement: string, file?: string): RawDiagnostic =>
  finding({
    engineRuleId,
    range: { start, end },
    fix: { edits: [{ range: { start, end }, replacement }] },
    ...(file === undefined ? {} : { file }),
  })

const allRules = Object.fromEntries([...CONCEPTS, 'config.fix-oscillation'].map((concept) => [concept, 'error']))

const base = (over: Partial<FixOptions> = {}): FixOptions => ({
  rootDir: dir,
  config: { rules: allRules } as never,
  engines: [],
  entries: [entry({ engineRuleId: 'r', concepts: ['correctness.no-debugger'] })],
  fileSource: createWalkFileSource(),
  allowDirty: true,
  ...over,
})

const read = (file: string): Promise<string> => readFile(join(dir, file), 'utf8')

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-fix-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  await mkdir(join(dir, 'src'), { recursive: true })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

// --- The loop ---------------------------------------------------------------------------------

test('a single safe fix is applied and the file is rewritten', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'if (a == 1) {}\n')

  const result = await runFix(
    base({
      engines: [
        reactiveEngine({
          onRun: (source) => {
            const at = source.indexOf(' == ')
            return at === -1 ? [] : [fixAt('r', at + 1, at + 3, '===')]
          },
        }),
      ],
    }),
  )

  expect(await read('src/a.ts')).toBe('if (a === 1) {}\n')
  expect(result.files.map((f) => f.file)).toEqual(['src/a.ts'])
  expect(result.rules).toEqual([{ ruleId: 'oxlint/r', count: 1 }])
  expect(result.truncated).toBe(false)
})

test('the loop iterates until no fix remains', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'aaa\n')

  // One `a` per pass, so reaching `bbb` needs three of them plus one that confirms the fixed point.
  const result = await runFix(
    base({
      engines: [
        reactiveEngine({
          onRun: (source) => {
            const at = source.indexOf('a')
            return at === -1 ? [] : [fixAt('r', at, at + 1, 'b')]
          },
        }),
      ],
    }),
  )

  expect(await read('src/a.ts')).toBe('bbb\n')
  expect(result.passes).toBe(4)
  expect(result.truncated).toBe(false)
})

test('the pass limit stops a loop that never converges and reports it as truncated', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'x\n')

  // Always appends, so the file never stops changing and never repeats a state either.
  const result = await runFix(
    base({
      maxPasses: 3,
      engines: [
        reactiveEngine({ onRun: (source) => [fixAt('r', source.length, source.length, 'x')] }),
      ],
    }),
  )

  expect(result.passes).toBe(3)
  expect(result.truncated).toBe(true)
  expect(await read('src/a.ts')).toBe('x\nxxx')
})

// --- Overlap (spec §11 step 2) -----------------------------------------------------------------

test('two rules overlapping on the same range: the higher-priority one wins and the loser runs next pass', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'AAAA\n')

  const result = await runFix(
    base({
      entries: [
        entry({ engineRuleId: 'low', concepts: ['style.no-var'], priority: 10 }),
        entry({ engineRuleId: 'high', concepts: ['correctness.no-debugger'], priority: 90 }),
      ],
      engines: [
        reactiveEngine({
          onRun: (source) => {
            if (source.startsWith('AAAA')) return [fixAt('high', 0, 4, 'BBBB'), fixAt('low', 2, 4, 'zz')]
            if (source.startsWith('BBBB')) return [fixAt('low', 2, 4, 'zz')]
            return []
          },
        }),
      ],
    }),
  )

  // Pass 1 applies `high` only; pass 2 applies `low` on the now-unobstructed range.
  expect(await read('src/a.ts')).toBe('BBzz\n')
  expect(result.skipped.overlap).toBe(1)
  expect(result.rules).toEqual([
    { ruleId: 'oxlint/high', count: 1 },
    { ruleId: 'oxlint/low', count: 1 },
  ])
})

test('a nested edit inside a higher-priority one never reaches the file', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'const value = 1\n')

  await runFix(
    base({
      maxPasses: 1,
      entries: [
        entry({ engineRuleId: 'outer', concepts: ['correctness.no-debugger'], priority: 90 }),
        entry({ engineRuleId: 'inner', concepts: ['style.no-var'], priority: 10 }),
      ],
      engines: [
        reactiveEngine({ onRun: () => [fixAt('outer', 0, 15, 'let v = 2'), fixAt('inner', 6, 11, 'XXXXX')] }),
      ],
    }),
  )

  // The corruption this guards against is `let v = 2` with `XXXXX` spliced into the middle of it.
  expect(await read('src/a.ts')).toBe('let v = 2\n')
})

test('exactly adjacent edits from two rules are both applied in one pass', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'abcd\n')

  await runFix(
    base({
      maxPasses: 1,
      entries: [
        entry({ engineRuleId: 'left', concepts: ['correctness.no-debugger'] }),
        entry({ engineRuleId: 'right', concepts: ['style.no-var'] }),
      ],
      engines: [reactiveEngine({ onRun: () => [fixAt('left', 0, 2, 'AB'), fixAt('right', 2, 4, 'CD')] })],
    }),
  )

  expect(await read('src/a.ts')).toBe('ABCD\n')
})

test('one rule reporting two overlapping findings still drops one deterministically', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'abcdef\n')

  // No priority, severity or rule-id difference to break the tie — only the range ordering appended
  // to `compareEditPrecedence` keeps this from depending on which order the engine yielded them in.
  await runFix(
    base({
      maxPasses: 1,
      engines: [reactiveEngine({ onRun: () => [fixAt('r', 2, 5, 'Y'), fixAt('r', 0, 3, 'X')] })],
    }),
  )

  expect(await read('src/a.ts')).toBe('Xdef\n')
})

// --- Oscillation (spec §11 step 5) -------------------------------------------------------------

test('two rules rewriting each other stop the file and name both', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'const a = 1\n')

  const result = await runFix(
    base({
      entries: [
        entry({ engineRuleId: 'add-type', concepts: ['correctness.no-debugger'] }),
        entry({ engineRuleId: 'drop-type', concepts: ['style.no-var'] }),
      ],
      engines: [
        reactiveEngine({
          onRun: (source) =>
            source.includes(': number')
              ? [fixAt('drop-type', 7, 15, '')]
              : [fixAt('add-type', 7, 7, ': number')],
        }),
      ],
    }),
  )

  expect(result.oscillations).toHaveLength(1)
  const [diagnostic] = result.oscillations
  expect(diagnostic?.concept).toBe('config.fix-oscillation')
  expect(diagnostic?.file).toBe('src/a.ts')
  expect(diagnostic?.message).toContain('oxlint/add-type')
  expect(diagnostic?.message).toContain('oxlint/drop-type')
  expect(diagnostic?.severity).toBe('error')

  // Stopped well inside the pass limit, and left at a state the pipeline chose rather than mid-cycle.
  expect(result.passes).toBeLessThan(10)
  expect(await read('src/a.ts')).toBe('const a: number = 1\n')
})

test('an oscillating file does not stop a different file from being fixed', async () => {
  await writeFile(join(dir, 'src/spin.ts'), 'p\n')
  await writeFile(join(dir, 'src/calm.ts'), 'q\n')

  const result = await runFix(
    base({
      entries: [
        entry({ engineRuleId: 'up', concepts: ['correctness.no-debugger'] }),
        entry({ engineRuleId: 'down', concepts: ['style.no-var'] }),
        entry({ engineRuleId: 'calm', concepts: ['dead-code.unused-import'] }),
      ],
      engines: [
        reactiveEngine({
          onRun: (source, path) => {
            if (source === 'p\n') return [fixAt('up', 0, 1, 'P', path)]
            if (source === 'P\n') return [fixAt('down', 0, 1, 'p', path)]
            if (source === 'q\n') return [fixAt('calm', 0, 1, 'Q', path)]
            return []
          },
        }),
      ],
    }),
  )

  expect(result.oscillations.map((d) => d.file)).toEqual(['src/spin.ts'])
  expect(await read('src/calm.ts')).toBe('Q\n')
})

test('silencing config.fix-oscillation hides the report but never restarts the loop', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'p\n')

  const result = await runFix(
    base({
      config: { rules: { ...allRules, 'config.fix-oscillation': 'off' } } as never,
      entries: [
        entry({ engineRuleId: 'up', concepts: ['correctness.no-debugger'] }),
        entry({ engineRuleId: 'down', concepts: ['style.no-var'] }),
      ],
      engines: [
        reactiveEngine({
          onRun: (source, path) =>
            source === 'p\n' ? [fixAt('up', 0, 1, 'P', path)] : [fixAt('down', 0, 1, 'p', path)],
        }),
      ],
    }),
  )

  expect(result.oscillations).toEqual([])
  expect(result.passes).toBeLessThan(10)
})

// --- Safety rails -----------------------------------------------------------------------------

const alwaysFixes = (): Engine => reactiveEngine({ onRun: (_source, path) => [fixAt('r', 0, 1, 'Z', path)] })

test('a dirty git worktree is refused and nothing is written', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')

  const result = await runFix(
    base({
      allowDirty: false,
      worktree: { run: async (args) => (args[0] === 'rev-parse' ? 'true\n' : ' M src/a.ts\n') },
      engines: [alwaysFixes()],
    }),
  )

  expect(result.refusal?.reason).toBe('dirty-worktree')
  expect(result.refusal?.message).toContain('--allow-dirty')
  expect(result.files).toEqual([])
  expect(await read('src/a.ts')).toBe('a\n')
})

test('--allow-dirty proceeds over a dirty worktree', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')

  const result = await runFix(
    base({
      allowDirty: true,
      worktree: { run: async (args) => (args[0] === 'rev-parse' ? 'true\n' : ' M src/a.ts\n') },
      engines: [alwaysFixes()],
    }),
  )

  expect(result.refusal).toBeUndefined()
  expect(await read('src/a.ts')).toBe('Z\n')
})

test('a directory with no git repository is refused', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')

  const result = await runFix(
    base({
      allowDirty: false,
      worktree: {
        run: async () => {
          throw new Error('not a git repository')
        },
      },
      engines: [alwaysFixes()],
    }),
  )

  expect(result.refusal?.reason).toBe('no-git')
  expect(await read('src/a.ts')).toBe('a\n')
})

test('git failing to answer is refused rather than assumed clean', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')

  const result = await runFix(
    base({
      allowDirty: false,
      worktree: {
        run: async (args) => {
          if (args[0] === 'rev-parse') return 'true\n'
          throw new Error('index.lock exists')
        },
      },
      engines: [alwaysFixes()],
    }),
  )

  expect(result.refusal?.reason).toBe('worktree-unknown')
  expect(await read('src/a.ts')).toBe('a\n')
})

test('a clean worktree is not refused', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')

  const result = await runFix(
    base({
      allowDirty: false,
      worktree: { run: async (args) => (args[0] === 'rev-parse' ? 'true\n' : '') },
      engines: [alwaysFixes()],
    }),
  )

  expect(result.refusal).toBeUndefined()
  expect(await read('src/a.ts')).toBe('Z\n')
})

test('--dry-run writes nothing and returns the diff it would have applied', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')

  const result = await runFix(base({ dryRun: true, engines: [alwaysFixes()] }))

  expect(await read('src/a.ts')).toBe('a\n')
  expect(result.files).toHaveLength(1)
  expect(result.files[0]?.diff).toContain('-a')
  expect(result.files[0]?.diff).toContain('+Z')
  expect(result.truncated).toBe(true)
})

test('--dry-run does not consult the worktree at all', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')
  let consulted = false

  await runFix(
    base({
      dryRun: true,
      allowDirty: false,
      worktree: {
        run: async () => {
          consulted = true
          return 'true\n'
        },
      },
      engines: [alwaysFixes()],
    }),
  )

  expect(consulted).toBe(false)
})

test('a fix for a file the ignore config excludes is never applied', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')
  await writeFile(join(dir, 'src/generated.ts'), 'a\n')

  const result = await runFix(
    base({
      config: { rules: allRules, ignore: ['**/generated.ts'] } as never,
      engines: [alwaysFixes()],
    }),
  )

  expect(await read('src/generated.ts')).toBe('a\n')
  expect(await read('src/a.ts')).toBe('Z\n')
  expect(result.files.map((f) => f.file)).toEqual(['src/a.ts'])
})

test('a fix attributed to a file outside the inventory is counted and dropped', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')
  await writeFile(join(dir, 'escape.ts'), 'a\n')
  await writeFile(join(dir, '.gitignore'), 'escape.ts\n')

  // A project-granularity engine is explicitly allowed to report against files the plan never
  // assigned it (see `runProjectAssignment`); the write allowlist is what stops one becoming an edit.
  const rogue = reactiveEngine({
    granularity: 'project',
    onRun: (_source, path) => (path === 'src/a.ts' ? [fixAt('r', 0, 1, 'Z', 'escape.ts')] : []),
  })

  const result = await runFix(base({ engines: [rogue] }))

  expect(await read('escape.ts')).toBe('a\n')
  expect(result.files).toEqual([])
  expect(result.skipped.outsideInventory).toBe(1)
})

test('a suggested fix is not applied at the default safe tier', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')

  const result = await runFix(
    base({
      entries: [entry({ engineRuleId: 'r', concepts: ['correctness.no-debugger'], fixKind: 'suggested' })],
      engines: [alwaysFixes()],
    }),
  )

  expect(await read('src/a.ts')).toBe('a\n')
  expect(result.skipped.aboveTier).toBe(1)
  expect(result.initial.withFix).toEqual({ safe: 0, suggested: 1, unsafe: 0 })
})

test('--suggest applies a suggested fix but still not an unsafe one', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')
  await writeFile(join(dir, 'src/b.ts'), 'a\n')

  await runFix(
    base({
      tier: 'suggested',
      entries: [
        entry({ engineRuleId: 'sug', concepts: ['correctness.no-debugger'], fixKind: 'suggested' }),
        entry({ engineRuleId: 'uns', concepts: ['style.no-var'], fixKind: 'unsafe' }),
      ],
      engines: [
        reactiveEngine({
          onRun: (_source, path) =>
            path === 'src/a.ts' ? [fixAt('sug', 0, 1, 'S', path)] : [fixAt('uns', 0, 1, 'U', path)],
        }),
      ],
    }),
  )

  expect(await read('src/a.ts')).toBe('S\n')
  expect(await read('src/b.ts')).toBe('a\n')
})

test('--unsafe applies every tier', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')

  await runFix(
    base({
      tier: 'unsafe',
      entries: [entry({ engineRuleId: 'r', concepts: ['correctness.no-debugger'], fixKind: 'unsafe' })],
      engines: [alwaysFixes()],
    }),
  )

  expect(await read('src/a.ts')).toBe('Z\n')
})

test('an engine failure aborts the pass before anything is written', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')

  const result = await runFix(
    base({
      entries: [
        entry({ engineRuleId: 'r', concepts: ['correctness.no-debugger'] }),
        entry({ engine: 'astgrep', engineRuleId: 'broken', concepts: ['slop.double-cast'], fixKind: 'none' }),
      ],
      engines: [alwaysFixes(), reactiveEngine({ id: 'astgrep', failWith: 'binary missing' })],
    }),
  )

  expect(result.refusal?.reason).toBe('engine-failed')
  expect(result.refusal?.message).toContain('astgrep')
  expect(await read('src/a.ts')).toBe('a\n')
})

test('a suppressed finding is never fixed', async () => {
  const directive = `// sgate-${'disable-next-line'} correctness.no-debugger -- deliberate\n`
  await writeFile(join(dir, 'src/a.ts'), `${directive}a\n`)
  const offset = directive.length

  const result = await runFix(
    base({
      engines: [reactiveEngine({ onRun: (_source, path) => [fixAt('r', offset, offset + 1, 'Z', path)] })],
    }),
  )

  expect(await read('src/a.ts')).toBe(`${directive}a\n`)
  expect(result.files).toEqual([])
})

test('a fix on a file with multi-byte content lands on the right characters', async () => {
  const source = 'const s = "héllo 🚀"\nif (a == 1) {}\n'
  await writeFile(join(dir, 'src/a.ts'), source)
  const at = new TextEncoder().encode(source.slice(0, source.indexOf('a == 1') + 2)).length

  await runFix(
    base({
      engines: [
        reactiveEngine({ onRun: (current) => (current.includes('a == 1') ? [fixAt('r', at, at + 2, '===')] : []) }),
      ],
    }),
  )

  expect(await read('src/a.ts')).toBe('const s = "héllo 🚀"\nif (a === 1) {}\n')
})

test('nothing to fix reports a clean, untruncated result', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')

  const result = await runFix(base({ engines: [reactiveEngine({ onRun: () => [] })] }))

  expect(result.files).toEqual([])
  expect(result.rules).toEqual([])
  expect(result.truncated).toBe(false)
  expect(result.initial).toEqual({ findings: 0, withFix: { safe: 0, suggested: 0, unsafe: 0 } })
})

test('a finding with no fix is counted but leaves the file alone', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')

  const result = await runFix(
    base({ engines: [reactiveEngine({ onRun: (_s, path) => [finding({ engineRuleId: 'r', range: { start: 0, end: 1 }, file: path })] })] }),
  )

  expect(result.initial).toEqual({ findings: 1, withFix: { safe: 0, suggested: 0, unsafe: 0 } })
  expect(await read('src/a.ts')).toBe('a\n')
})

test('a fix a rule the registry calls unfixable offers is never applied', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'a\n')

  const result = await runFix(
    base({
      entries: [entry({ engineRuleId: 'r', concepts: ['correctness.no-debugger'], fixKind: 'none', fixTouches: [] })],
      engines: [alwaysFixes()],
    }),
  )

  expect(await read('src/a.ts')).toBe('a\n')
  expect(result.initial).toEqual({ findings: 1, withFix: { safe: 0, suggested: 0, unsafe: 0 } })
})
