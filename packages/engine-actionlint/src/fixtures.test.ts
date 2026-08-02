import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { InventoryFile, RawDiagnostic, RunContext } from '@misaon/slop-gate-core'
import { ACTIONLINT_RULES, createActionlintEngine, resolveActionlintBinary } from './index.ts'

/**
 * Both directions, against the real binary, for every rule this engine can report — the bar spec §14
 * sets for a slop rule, applied here because the whole case for this engine is a measurement and a
 * measurement that nothing re-checks decays into a claim.
 *
 * Four kinds of case, and the last two are the ones that carry the design decisions:
 *
 * - `positive` — findings land on exactly the lines marked `# HIT`, and every marked line produces
 *   one. Counting markers rather than line numbers lets a fixture grow a case without renumbering.
 * - `negative` — one well-formed workflow that every shipped rule must stay silent on.
 * - `filtered` — actionlint **does** report, and the adapter's `MESSAGE_EXCLUSIONS` must remove all of
 *   it. Asserted from both ends: the raw binary output is required to be non-empty, so a fixture that
 *   stopped triggering the class would fail here rather than pass by accident.
 * - `excluded` — the rule fires, correctly by its own lights, on input that is not a defect. These are
 *   the measured false-positive classes behind `MANUAL_RULE_EXCLUSIONS`, kept executable so the
 *   reasons in that table stay true.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)).replace(/src$/, 'fixtures'), 'tree')
const MARKER = '# HIT'
const run = promisify(execFile)
const installed = resolveActionlintBinary()
// Inlined at each call site rather than aliased: `oxlint`'s vitest rules only recognise a test
// through the `test.*` member expression, so a `const withBinary = test.skipIf(...)` binding makes
// every assertion inside look like a standalone `expect`.
const noBinary = installed === undefined

type Polarity = 'positive' | 'negative' | 'filtered' | 'excluded'

const CASES: readonly { engineRuleId: string; file: string; polarity: Polarity }[] = [
  ...ACTIONLINT_RULES.map((rule) => ({ engineRuleId: rule.engineRuleId, file: `${rule.engineRuleId}.positive.yml`, polarity: 'positive' as const })),
  ...ACTIONLINT_RULES.map((rule) => ({ engineRuleId: rule.engineRuleId, file: 'clean.negative.yml', polarity: 'negative' as const })),
  { engineRuleId: 'expression', file: 'filtered.quoted-string-inputs.yml', polarity: 'filtered' },
  { engineRuleId: 'expression', file: 'filtered.from-json-bool.yml', polarity: 'filtered' },
  { engineRuleId: 'syntax-check', file: 'filtered.yaml-parse-error.yml', polarity: 'filtered' },
  { engineRuleId: 'syntax-check', file: 'filtered.duplicate-key.yml', polarity: 'filtered' },
  { engineRuleId: 'runner-label', file: 'excluded.third-party-runners.yml', polarity: 'excluded' },
  { engineRuleId: 'syntax-check', file: 'excluded.github-2026-syntax.yml', polarity: 'excluded' },
]

let workspace: string
let context: RunContext

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'sgate-actionlint-fixtures-'))
  await cp(FIXTURES, join(workspace, 'repo'), { recursive: true })
  // actionlint resolves `uses: ./…` against the nearest `.git` and disables local action and reusable
  // workflow checking entirely without one, so `action` and `workflow-call` would pass by never
  // running. The tree is copied out rather than a `.git` committed into `fixtures/`.
  await run('git', ['init', '-q', join(workspace, 'repo')])
  context = { rootDir: join(workspace, 'repo'), tmpDir: workspace }
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

async function findings(engineRuleId: string, file: string): Promise<{ diagnostics: RawDiagnostic[]; source: string }> {
  const relative = ['.github', 'workflows', file].join('/')
  const source = await readFile(join(context.rootDir, relative), 'utf8')
  const inventoryFile: InventoryFile = {
    path: relative,
    language: 'github-workflow',
    workspace: '',
    size: new TextEncoder().encode(source).length,
    mtimeMs: 0,
  }

  const engine = createActionlintEngine()
  const handle = await engine.materializeConfig(new Map([[engineRuleId, 'warn' as const]]), context)
  const diagnostics: RawDiagnostic[] = []
  try {
    for await (const diagnostic of engine.run({ files: [inventoryFile] }, handle, context, AbortSignal.timeout(30_000))) {
      diagnostics.push(diagnostic)
    }
  } finally {
    await handle.dispose()
  }
  return { diagnostics, source }
}

/** What actionlint itself says, before any of this adapter's filtering. */
async function rawFindings(file: string): Promise<unknown[]> {
  const args = ['-shellcheck=', '-pyflakes=', '-no-color', '-format', '{{json .}}', join('.github', 'workflows', file)]
  const result = await run(installed!.command, args, { cwd: context.rootDir, encoding: 'utf8' }).catch(
    (error: { code?: number; stdout?: string }) => ({ stdout: error.stdout ?? '' }),
  )
  return result.stdout.trim() === '' ? [] : (JSON.parse(result.stdout) as unknown[])
}

for (const testCase of CASES) {
  test.skipIf(noBinary)(`${testCase.engineRuleId} — ${testCase.polarity} — ${testCase.file}`, async () => {
    const { diagnostics, source } = await findings(testCase.engineRuleId, testCase.file)
    const lines = source.split('\n')
    const marked = lines.flatMap((line, index) => (line.includes(MARKER) ? [index + 1] : []))
    const found = diagnostics
      .map((diagnostic) => new TextDecoder().decode(new TextEncoder().encode(source).slice(0, diagnostic.range.start)).split('\n').length)
      .sort((a, b) => a - b)

    const wantsMarkers = testCase.polarity === 'positive' || testCase.polarity === 'excluded'
    // A `filtered` case is asserted from both ends — actionlint must still produce the class and the
    // adapter must remove all of it. For every other polarity the raw count is not the property under
    // test, so it is stubbed to 1 rather than branching: a guarded `expect` can pass by never running,
    // which is the vacuous-assertion trap the M0 follow-ups record.
    const rawCount = testCase.polarity === 'filtered' ? (await rawFindings(testCase.file)).length : 1

    expect(rawCount, 'the fixture no longer triggers the class it documents').toBeGreaterThan(0)
    expect(marked.length > 0, 'positive and excluded fixtures mark lines; negative and filtered ones mark none').toBe(
      wantsMarkers,
    )
    expect(found).toEqual(wantsMarkers ? marked : [])
  })
}

test('every rule has a positive and a negative fixture', () => {
  // Adding a rule to `ACTIONLINT_RULES` without measuring it in both directions fails here instead of
  // shipping. Enforced even when actionlint is absent, because it is a property of this file.
  for (const rule of ACTIONLINT_RULES) {
    const polarities = new Set(CASES.filter((c) => c.engineRuleId === rule.engineRuleId).map((c) => c.polarity))
    expect(polarities, `${rule.engineRuleId} is missing a fixture`).toContain('positive')
    expect(polarities, `${rule.engineRuleId} is missing a fixture`).toContain('negative')
  }
})

test('every fixture file is used by some case', async () => {
  // A fixture nobody runs is a fixture that stops being true without anyone noticing.
  const files = (await readdir(join(FIXTURES, '.github', 'workflows'))).filter((name) => name.endsWith('.yml'))
  const used = new Set(CASES.map((testCase) => testCase.file))
  // Two files exist only as the callee of another fixture's `uses:`.
  const callees = new Set(['workflow-call.callee.yml', 'filtered.reusable-callee.yml'])
  expect(files.filter((file) => !used.has(file) && !callees.has(file))).toEqual([])
})
