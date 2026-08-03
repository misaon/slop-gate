import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { InventoryFile, RawDiagnostic, RunContext } from '@misaon/slop-gate-core'
import { BIOME_CSS_RULES, CSS_PARSE_ERROR_RULE_ID, FOREIGN_SUPPRESSION_RULE_ID, createBiomeCssEngine } from './index.ts'

/**
 * The authored corpus, and the reason this engine can claim anything at all about thirteen of its
 * seventeen `recommended` rules.
 *
 * Those thirteen produced **zero findings across 1729 production stylesheets**. That measured a
 * false-positive rate of zero and a true-positive rate of nothing whatsoever, so on the corpus alone
 * there would be no evidence they do anything — a rule that never fires is worse than no rule (see
 * `no-implied-eval` in `registry/exclusions.ts`). Every file here is the missing half: one authored
 * construct per rule, run against the real binary, proving the check is live.
 *
 * Reported separately from the corpus and never summed with it, because they answer different
 * questions. These files say a rule *can* fire; only the corpus says how often it fires wrongly.
 *
 * **This is not ceremony, and it has already paid.** `noInvalidGridAreas` sat in the shipped set on
 * the strength of a scratch measurement until its fixture here refused to reproduce it — the rule
 * misses its own documented invalid example whenever the declaration is indented on its own line.
 * Zero on the corpus is consistent with "rare defect" and with "cannot fire", and only a fixture
 * separates them.
 *
 * Four polarities:
 *
 * - `positive` — the rule fires, on exactly the lines marked `/* HIT *␟/`, one finding per marker.
 * - `negative` — a stylesheet a rule must stay silent on: one well-formed sheet every shipped rule
 *   sees, plus a nesting case that a first, wrong reading of the corpus had claimed was a false
 *   positive. This is the polarity that catches a rule firing on ordinary CSS.
 * - `excluded` — the rule fires, correctly by its own lights, on input that is not a defect. These
 *   are the measured false-positive classes behind `MANUAL_RULE_EXCLUSIONS`, kept executable so
 *   those reasons stay true instead of becoming folklore.
 * - `synthetic` — the adapter's own reports (`css-parse-error`, `foreign-suppression`), which come
 *   from the adapter rather than from any Biome rule.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)).replace(/src$/, 'fixtures'), 'tree')
const MARKER = '/* HIT */'

/** Every rule in `recommended`, i.e. everything not held out by `MANUAL_RULE_EXCLUSIONS`. */
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
  // The corrected claim, kept executable: biome does *not* report a duplicate across a nesting
  // boundary. A first reading of the corpus said it did; this fixture said otherwise, and the
  // fixture was right — see `noDuplicateProperties` in `registry/entries.manual.ts`.
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
    // The synthetic reports are elected alongside the rule under test so that a fixture whose CSS
    // also fails to parse cannot pass by accident — `css-parse-error` would show up in `found`.
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
    // Asserted from this end deliberately. If upstream ever fixed one of these, the exclusion reason
    // in `MANUAL_RULE_EXCLUSIONS` would quietly become false, and nothing else would notice.
    const found = await lint(file, [engineRuleId])
    expect(found.map((d) => d.engineRuleId)).toContain(engineRuleId)
    const source = await readFile(join(workspace, file), 'utf8')
    const lineOf = (offset: number) => source.slice(0, offset).split('\n').length
    expect(found.map((d) => lineOf(d.range.start)).sort((a, b) => a - b)).toEqual(await markedLines(file))
  },
)

test('the whole recommended set on the clean stylesheet reports nothing', async () => {
  // The shape of a real run: seventeen rules, a perfectly ordinary stylesheet, no output. Written as
  // its own test because "this engine finds nothing on normal CSS" is a property worth stating.
  const all = [...SHIPPED.map((rule) => rule.engineRuleId), CSS_PARSE_ERROR_RULE_ID, FOREIGN_SUPPRESSION_RULE_ID]
  expect(await lint('clean.negative.css', all)).toEqual([])
})

test('a foreign suppression is reported even though biome reports nothing at all', async () => {
  // Both halves in one assertion, because the point is the gap between them: biome sees a clean
  // file, and the adapter reports the suppression that made it look clean.
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
  // The `recommended: false` guard from the outside: `noHexColors` is one of biome's own recommended
  // rules and the clean fixture is full of colours, so this passing means our config really is
  // selecting only what was elected.
  expect(await lint('excluded.icon-font.css', ['noDuplicateProperties'])).toEqual([])
})
