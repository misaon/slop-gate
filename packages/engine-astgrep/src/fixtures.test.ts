import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { detectLanguage, type InventoryFile, type RawDiagnostic, type RunContext } from '@misaon/slop-gate-core'
import { createAstGrepEngine } from './index.ts'
import { ASTGREP_RULES } from './rules.ts'

/**
 * Spec §14 makes false-positive fixtures mandatory rather than optional for a slop rule, so every
 * rule here is proved in both directions against the real ast-grep binary.
 *
 * A positive fixture marks each line it expects a finding on with `SLOP_HIT`, and the assertion runs
 * both ways: every finding must land on a marked line, *and* every marked line must produce one.
 * Counting markers rather than hard-coding line numbers is what lets a fixture grow a case without
 * renumbering an expectation — and the two-way check is what stops a rule that matches everything
 * from passing.
 *
 * A negative fixture is not a formality either. `narrative-comment.negative.ts` is the six candidate
 * patterns that were measured out, each one a real comment from the corpus that produced the
 * measurement, and `emoji-in-code.negative.ts` is the `\p{Emoji}` trap in full. Both would pass
 * again the moment someone widens a regex, which is exactly when someone needs to be told.
 */
const FIXTURES = dirname(fileURLToPath(import.meta.url)).replace(/src$/, 'fixtures')
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

    // Stated as two unconditional assertions rather than a branch: a guarded `expect` can pass by
    // never running, which is the vacuous-assertion trap the M0 follow-ups record.
    expect(marked.length > 0, 'a positive fixture marks expected lines; a negative one marks none').toBe(
      testCase.polarity === 'positive',
    )
    expect(lines).toEqual(testCase.polarity === 'positive' ? marked : [])
  })
}

test('every shipped rule has both a positive and a negative fixture', () => {
  // The bar spec §14 sets, enforced rather than trusted: adding a rule to `ASTGREP_RULES` without
  // measuring it in both directions fails here instead of shipping.
  for (const rule of ASTGREP_RULES) {
    const polarities = new Set(CASES.filter((c) => c.engineRuleId === rule.engineRuleId).map((c) => c.polarity))
    expect(polarities, `${rule.engineRuleId} is missing a fixture`).toEqual(new Set(['positive', 'negative']))
  }
})

test('each of the three ast-grep languages is proved end to end by some positive fixture', () => {
  // ast-grep's extension mapping is per-document and not the one our `LanguageId` uses: a
  // `language: TypeScript` document does not match `.tsx`, and a `language: JavaScript` one does not
  // match `.ts`. A missing document is silent — the file is scanned, nothing matches, exit 0 — so
  // the mapping needs proving against the real binary at least once per language. Which *rule*
  // proves each one does not matter (the per-rule document emission is asserted in config.test.ts,
  // where it is pure); that every language is reached does.
  const extensions = new Set(
    CASES.filter((c) => c.polarity === 'positive').map((c) => c.file.slice(c.file.lastIndexOf('.'))),
  )
  expect(extensions).toEqual(new Set(['.ts', '.tsx', '.js']))
})
