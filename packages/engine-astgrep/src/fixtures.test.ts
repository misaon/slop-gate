import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { detectLanguage, type InventoryFile, type RawDiagnostic, type RunContext } from '@misaon/slop-gate-core'
import { createAstGrepEngine } from './index.ts'
import { ASTGREP_RULES } from './rules.ts'

const FIXTURES = import.meta.dirname.replace(/src$/, 'fixtures')
const MARKER = 'SLOP_HIT'

const CASES: readonly { engineRuleId: string; file: string; polarity: 'positive' | 'negative' }[] = [
  { engineRuleId: 'slop-double-cast', file: 'double-cast.positive.ts', polarity: 'positive' },
  { engineRuleId: 'slop-double-cast', file: 'double-cast.positive.tsx', polarity: 'positive' },
  { engineRuleId: 'slop-double-cast', file: 'double-cast.negative.ts', polarity: 'negative' },
  { engineRuleId: 'slop-swallowed-error', file: 'swallowed-error.positive.ts', polarity: 'positive' },
  { engineRuleId: 'slop-swallowed-error', file: 'swallowed-error.positive.js', polarity: 'positive' },
  { engineRuleId: 'slop-swallowed-error', file: 'swallowed-error.negative.ts', polarity: 'negative' },
  { engineRuleId: 'slop-stub-implementation', file: 'stub-implementation.positive.ts', polarity: 'positive' },
  { engineRuleId: 'slop-stub-implementation', file: 'stub-implementation.negative.ts', polarity: 'negative' },
  { engineRuleId: 'slop-narrative-comment', file: 'narrative-comment.positive.ts', polarity: 'positive' },
  { engineRuleId: 'slop-narrative-comment', file: 'narrative-comment.positive.js', polarity: 'positive' },
  { engineRuleId: 'slop-narrative-comment', file: 'narrative-comment.negative.ts', polarity: 'negative' },
  { engineRuleId: 'slop-emoji-in-code', file: 'emoji-in-code.positive.ts', polarity: 'positive' },
  { engineRuleId: 'slop-emoji-in-code', file: 'emoji-in-code.negative.ts', polarity: 'negative' },
]

let context: RunContext
let tmp: string

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'sgate-astgrep-fixtures-'))
  context = { rootDir: FIXTURES, tmpDir: tmp }
})

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true })
})

async function findingLines(engineRuleId: string, file: string): Promise<{ lines: number[]; source: string }> {
  const engine = createAstGrepEngine()
  const handle = await engine.materializeConfig(new Map([[engineRuleId, ['warn'] as const]]), context)
  const source = await readFile(join(FIXTURES, file), 'utf8')
  const inventoryFile: InventoryFile = {
    path: file,
    language: detectLanguage(file),
    workspace: '',
    size: new TextEncoder().encode(source).length,
    mtimeMs: 0,
  }

  const found: RawDiagnostic[] = []
  try {
    for await (const diagnostic of engine.run({ files: [inventoryFile] }, handle, context, AbortSignal.timeout(30_000))) {
      found.push(diagnostic)
    }
  } finally {
    await handle.dispose()
  }

  const prefix = new TextEncoder().encode(source)
  const lines = found.map((diagnostic) => {
    expect(diagnostic.file).toBe(file)
    return new TextDecoder().decode(prefix.slice(0, diagnostic.range.start)).split('\n').length
  })
  return { lines: lines.sort((a, b) => a - b), source }
}

for (const testCase of CASES) {
  test(`${testCase.engineRuleId} — ${testCase.file}`, async () => {
    const { lines, source } = await findingLines(testCase.engineRuleId, testCase.file)
    const marked = source
      .split('\n')
      .flatMap((line, index) => (line.includes(MARKER) ? [index + 1] : []))

    expect(marked.length > 0, 'a positive fixture marks expected lines; a negative one marks none').toBe(
      testCase.polarity === 'positive',
    )
    expect(lines).toEqual(testCase.polarity === 'positive' ? marked : [])
  })
}

test('every shipped rule has both a positive and a negative fixture', () => {
  for (const rule of ASTGREP_RULES) {
    const polarities = new Set(CASES.filter((c) => c.engineRuleId === rule.engineRuleId).map((c) => c.polarity))
    expect(polarities, `${rule.engineRuleId} is missing a fixture`).toEqual(new Set(['positive', 'negative']))
  }
})

test('each of the three ast-grep languages is proved end to end by some positive fixture', () => {
  const extensions = new Set(
    CASES.filter((c) => c.polarity === 'positive').map((c) => c.file.slice(c.file.lastIndexOf('.'))),
  )
  expect(extensions).toEqual(new Set(['.ts', '.tsx', '.js']))
})
