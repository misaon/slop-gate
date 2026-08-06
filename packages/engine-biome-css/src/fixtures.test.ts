import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { InventoryFile, RawDiagnostic, RunContext } from '@misaon/slop-gate-core'
import { BIOME_CSS_RULES, CSS_PARSE_ERROR_RULE_ID, FOREIGN_SUPPRESSION_RULE_ID, createBiomeCssEngine } from './index.ts'

const FIXTURES = join(import.meta.dirname.replace(/src$/, 'fixtures'), 'tree')
const MARKER = '/* HIT */'

const EXCLUDED_FROM_RECOMMENDED = new Set([
  'noHexColors',
  'noDescendingSpecificity',
  'useBaseline',
  'noImportantStyles',
  'noEmptyBlock',
  'noDuplicateSelectors',
  'useGenericFontNames',
  'noUnknownAtRules',
  'noUnknownFunction',
])
const SHIPPED = BIOME_CSS_RULES.filter((rule) => !EXCLUDED_FROM_RECOMMENDED.has(rule.engineRuleId))

type Case = { engineRuleId: string; file: string; polarity: 'positive' | 'negative' | 'excluded' | 'synthetic' }

const CASES: readonly Case[] = [
  ...SHIPPED.map((rule) => ({ engineRuleId: rule.engineRuleId, file: `${rule.engineRuleId}.positive.css`, polarity: 'positive' as const })),
  ...SHIPPED.map((rule) => ({ engineRuleId: rule.engineRuleId, file: 'clean.negative.css', polarity: 'negative' as const })),
  { engineRuleId: CSS_PARSE_ERROR_RULE_ID, file: 'css-parse-error.positive.css', polarity: 'synthetic' },
  { engineRuleId: FOREIGN_SUPPRESSION_RULE_ID, file: 'foreign-suppression.positive.css', polarity: 'synthetic' },
  { engineRuleId: 'noDuplicateProperties', file: 'excluded.progressive-fallback.css', polarity: 'excluded' },
  { engineRuleId: 'noDuplicateProperties', file: 'negative.nested-context.css', polarity: 'negative' },
  { engineRuleId: 'useGenericFontNames', file: 'excluded.icon-font.css', polarity: 'excluded' },
  { engineRuleId: 'noUnknownAtRules', file: 'excluded.preprocessor-at-rule.css', polarity: 'excluded' },
]

let workspace: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'slop-gate-biome-css-'))
  await cp(FIXTURES, workspace, { recursive: true })
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

async function lint(file: string, engineRuleIds: readonly string[]): Promise<RawDiagnostic[]> {
  const engine = createBiomeCssEngine()
  const context: RunContext = { rootDir: workspace, tmpDir: join(workspace, '.tmp') }
  const handle = await engine.materializeConfig(new Map(engineRuleIds.map((id) => [id, ['warn'] as const])), context)
  try {
    const files: InventoryFile[] = [{ path: file, language: 'css', workspace: '', size: 0, mtimeMs: 0 }]
    const found: RawDiagnostic[] = []
    for await (const diagnostic of engine.run({ files }, handle, context, new AbortController().signal)) {
      found.push(diagnostic)
    }
    return found
  } finally {
    await handle.dispose()
  }
}

async function markedLines(file: string): Promise<number[]> {
  const text = await readFile(join(workspace, file), 'utf8')
  return text
    .split('\n')
    .flatMap((line, index) => (line.includes(MARKER) ? [index + 1] : []))
}

test('every rule and both synthetic reports have a fixture', async () => {
  const present = new Set(await readdir(FIXTURES))
  for (const testCase of CASES) expect(present.has(testCase.file), testCase.file).toBe(true)
})

test.each(CASES.filter((c) => c.polarity === 'positive' || c.polarity === 'synthetic'))(
  '$engineRuleId fires on $file',
  async ({ engineRuleId, file }) => {
    const found = await lint(file, [engineRuleId, CSS_PARSE_ERROR_RULE_ID])
    const mine = found.filter((d) => d.engineRuleId === engineRuleId)
    expect(mine.length, `expected ${engineRuleId} on ${file}, got ${JSON.stringify(found.map((d) => d.engineRuleId))}`).toBeGreaterThan(0)
    expect(found.filter((d) => d.engineRuleId !== engineRuleId)).toEqual([])
  },
)

test.each(CASES.filter((c) => c.polarity === 'positive'))('$engineRuleId lands on the marked lines of $file', async ({ engineRuleId, file }) => {
  const source = await readFile(join(workspace, file), 'utf8')
  const lineOf = (offset: number) => source.slice(0, offset).split('\n').length
  const found = await lint(file, [engineRuleId])
  expect(found.map((d) => lineOf(d.range.start)).sort((a, b) => a - b)).toEqual(await markedLines(file))
})

test.each(CASES.filter((c) => c.polarity === 'negative'))('$engineRuleId stays silent on $file', async ({ engineRuleId, file }) => {
  expect(await lint(file, [engineRuleId, CSS_PARSE_ERROR_RULE_ID])).toEqual([])
})

test.each(CASES.filter((c) => c.polarity === 'excluded'))(
  '$engineRuleId still fires on $file, which is why it is excluded',
  async ({ engineRuleId, file }) => {
    const found = await lint(file, [engineRuleId])
    expect(found.map((d) => d.engineRuleId)).toContain(engineRuleId)
    const source = await readFile(join(workspace, file), 'utf8')
    const lineOf = (offset: number) => source.slice(0, offset).split('\n').length
    expect(found.map((d) => lineOf(d.range.start)).sort((a, b) => a - b)).toEqual(await markedLines(file))
  },
)

test('the whole recommended set on the clean stylesheet reports nothing', async () => {
  const all = [...SHIPPED.map((rule) => rule.engineRuleId), CSS_PARSE_ERROR_RULE_ID, FOREIGN_SUPPRESSION_RULE_ID]
  expect(await lint('clean.negative.css', all)).toEqual([])
})

test('a foreign suppression is reported even though biome reports nothing at all', async () => {
  const withRuleOnly = await lint('foreign-suppression.positive.css', ['noDuplicateProperties'])
  expect(withRuleOnly).toEqual([])

  const withReport = await lint('foreign-suppression.positive.css', ['noDuplicateProperties', FOREIGN_SUPPRESSION_RULE_ID])
  expect(withReport.map((d) => d.engineRuleId)).toEqual([FOREIGN_SUPPRESSION_RULE_ID])
  expect(withReport[0]!.message).toContain('sgate-disable')
})

test('an unparseable stylesheet reports once and discards its recovered findings', async () => {
  const found = await lint('css-parse-error.positive.css', [
    CSS_PARSE_ERROR_RULE_ID,
    ...SHIPPED.map((rule) => rule.engineRuleId),
  ])
  expect(found.map((d) => d.engineRuleId)).toEqual([CSS_PARSE_ERROR_RULE_ID])
})

test('a rule left out of the selection does not report', async () => {
  expect(await lint('excluded.icon-font.css', ['noDuplicateProperties'])).toEqual([])
})
