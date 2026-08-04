import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { InventoryFile, RawDiagnostic, RunContext } from '@misaon/slop-gate-core'
import { ACTIONLINT_RULES, createActionlintEngine, resolveActionlintBinary } from './index.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)).replace(/src$/, 'fixtures'), 'tree')
const MARKER = '# HIT'
const run = promisify(execFile)
const installed = resolveActionlintBinary()
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
  const handle = await engine.materializeConfig(new Map([[engineRuleId, ['warn'] as const]]), context)
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
    const rawCount = testCase.polarity === 'filtered' ? (await rawFindings(testCase.file)).length : 1

    expect(rawCount, 'the fixture no longer triggers the class it documents').toBeGreaterThan(0)
    expect(marked.length > 0, 'positive and excluded fixtures mark lines; negative and filtered ones mark none').toBe(
      wantsMarkers,
    )
    expect(found).toEqual(wantsMarkers ? marked : [])
  })
}

test('every rule has a positive and a negative fixture', () => {
  for (const rule of ACTIONLINT_RULES) {
    const polarities = new Set(CASES.filter((c) => c.engineRuleId === rule.engineRuleId).map((c) => c.polarity))
    expect(polarities, `${rule.engineRuleId} is missing a fixture`).toContain('positive')
    expect(polarities, `${rule.engineRuleId} is missing a fixture`).toContain('negative')
  }
})

test('every fixture file is used by some case', async () => {
  const files = (await readdir(join(FIXTURES, '.github', 'workflows'))).filter((name) => name.endsWith('.yml'))
  const used = new Set(CASES.map((testCase) => testCase.file))
  const callees = new Set(['workflow-call.callee.yml', 'filtered.reusable-callee.yml'])
  expect(files.filter((file) => !used.has(file) && !callees.has(file))).toEqual([])
})
