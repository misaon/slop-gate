import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { detectLanguage, type InventoryFile, type RawDiagnostic, type RunContext } from '@misaon/slop-gate-core'
import { SCHEMA_RULE_IDS, createSchemaEngine } from './index.ts'

const FIXTURES = dirname(fileURLToPath(import.meta.url)).replace(/src$/, 'fixtures')
const MARKER = 'SGATE_HIT'

const CASES: readonly { engineRuleId: string; file: string; polarity: 'positive' | 'negative' }[] = [
  { engineRuleId: 'compose-spec', file: 'compose.positive.yaml', polarity: 'positive' },
  { engineRuleId: 'compose-spec', file: 'compose.negative.yaml', polarity: 'negative' },
  { engineRuleId: 'duplicate-mapping-key', file: 'duplicate-mapping-key.positive.yaml', polarity: 'positive' },
  { engineRuleId: 'duplicate-mapping-key', file: 'duplicate-mapping-key.negative.yaml', polarity: 'negative' },
  { engineRuleId: 'parse-error', file: 'parse-error.positive.yaml', polarity: 'positive' },
  { engineRuleId: 'parse-error', file: 'parse-error.negative.yaml', polarity: 'negative' },
]

let context: RunContext
let tmp: string

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'sgate-schema-fixtures-'))
  context = { rootDir: FIXTURES, tmpDir: tmp }
})

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true })
})

async function findingLines(engineRuleId: string, file: string): Promise<{ lines: number[]; source: string }> {
  const engine = createSchemaEngine()
  const handle = await engine.materializeConfig(new Map([[engineRuleId, ['error'] as const]]), context)
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

  const bytes = new TextEncoder().encode(source)
  const lines = found.map((diagnostic) => {
    expect(diagnostic.file).toBe(file)
    expect(diagnostic.engineRuleId).toBe(engineRuleId)
    return new TextDecoder().decode(bytes.slice(0, diagnostic.range.start)).split('\n').length
  })
  return { lines: lines.sort((a, b) => a - b), source }
}

for (const testCase of CASES) {
  test(`${testCase.engineRuleId} — ${testCase.file}`, async () => {
    const { lines, source } = await findingLines(testCase.engineRuleId, testCase.file)
    const marked = source.split('\n').flatMap((line, index) => (line.includes(MARKER) ? [index + 1] : []))

    expect(marked.length > 0, 'a positive fixture marks expected lines; a negative one marks none').toBe(
      testCase.polarity === 'positive',
    )
    expect(lines).toEqual(testCase.polarity === 'positive' ? marked : [])
  })
}

test('every rule the engine can emit is proved in both directions', () => {
  for (const engineRuleId of SCHEMA_RULE_IDS) {
    const polarities = new Set(CASES.filter((c) => c.engineRuleId === engineRuleId).map((c) => c.polarity))
    expect(polarities, `${engineRuleId} is missing a fixture`).toEqual(new Set(['positive', 'negative']))
  }
})

test('the compose fixtures are named so that the schema actually binds to them', () => {
  for (const testCase of CASES.filter((c) => c.engineRuleId === 'compose-spec')) {
    expect(/^compose\..+\.ya?ml$/.test(testCase.file), testCase.file).toBe(true)
  }
})
