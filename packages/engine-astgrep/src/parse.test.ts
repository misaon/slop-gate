import { expect, test } from 'vitest'
import { parseAstGrepOutput } from './parse.ts'

/** One entry of real `ast-grep scan --json=compact` output, trimmed to the fields this adapter reads plus enough of the rest to prove nothing else is required. */
const match = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  text: 'x as unknown as string',
  range: {
    byteOffset: { start: 65, end: 87 },
    start: { line: 2, column: 12 },
    end: { line: 2, column: 34 },
  },
  file: 'src/sample.ts',
  lines: '  const b = x as unknown as string',
  language: 'TypeScript',
  metaVariables: { single: {}, multi: {}, transformed: {} },
  ruleId: 'slop-double-cast',
  severity: 'warning',
  note: null,
  message: 'Type assertion laundered through `unknown`.',
  labels: [],
  ...overrides,
})

test('reads byte offsets, not the 0-based line and column ast-grep also reports', () => {
  const [diagnostic] = parseAstGrepOutput(JSON.stringify([match()]), '/repo')

  expect(diagnostic?.range).toEqual({ start: 65, end: 87 })
  expect(diagnostic?.engineRuleId).toBe('slop-double-cast')
  expect(diagnostic?.file).toBe('src/sample.ts')
  expect(diagnostic?.severity).toBe('warning')
})

test('surfaces `note` as help, so each rule\'s documented escape travels with the finding', () => {
  const [diagnostic] = parseAstGrepOutput(JSON.stringify([match({ note: 'Narrow the source type instead.' })]), '/repo')
  expect(diagnostic?.help).toBe('Narrow the source type instead.')
})

test('omits help when ast-grep reports a null note rather than setting it to "null"', () => {
  // ast-grep emits `"note": null` for a document that declares none — an absent key would be the
  // easier case; this is the one that produces the string "null" in a diagnostic if mishandled.
  expect(parseAstGrepOutput(JSON.stringify([match()]), '/repo')[0]).not.toHaveProperty('help')
})

test('maps ast-grep hint severity onto advice', () => {
  const [diagnostic] = parseAstGrepOutput(JSON.stringify([match({ severity: 'hint' })]), '/repo')
  expect(diagnostic?.severity).toBe('advice')
})

test('falls back to warning for a severity name it does not know', () => {
  // The reported severity is not load-bearing — `normalizeDiagnostics` recomputes it from the
  // resolved level — so an unrecognised name must not cost a real finding.
  const [diagnostic] = parseAstGrepOutput(JSON.stringify([match({ severity: 'catastrophe' })]), '/repo')
  expect(diagnostic?.severity).toBe('warning')
})

test('returns nothing for the empty array ast-grep prints on a clean run', () => {
  expect(parseAstGrepOutput('[]', '/repo')).toEqual([])
  expect(parseAstGrepOutput('   \n', '/repo')).toEqual([])
})

test('makes an absolute path repo-relative with posix separators', () => {
  const [diagnostic] = parseAstGrepOutput(JSON.stringify([match({ file: '/repo/src/sample.ts' })]), '/repo')
  expect(diagnostic?.file).toBe('src/sample.ts')
})

test('leaves an already-relative path alone', () => {
  const [diagnostic] = parseAstGrepOutput(JSON.stringify([match({ file: 'packages/a/src/b.ts' })]), '/repo')
  expect(diagnostic?.file).toBe('packages/a/src/b.ts')
})

test('skips a match missing the fields a diagnostic cannot be built without', () => {
  const payload = JSON.stringify([match({ range: {} }), match({ ruleId: undefined }), match()])
  expect(parseAstGrepOutput(payload, '/repo')).toHaveLength(1)
})

test('raises an EngineError naming ast-grep on unparseable output', () => {
  expect(() => parseAstGrepOutput('Error: Cannot parse rule', '/repo')).toThrow(/ast-grep/)
})

test('raises an EngineError when the payload is json but not an array', () => {
  // Worth its own case: `JSON.parse` succeeds here, so nothing but an explicit check separates it
  // from a clean run.
  expect(() => parseAstGrepOutput('{"diagnostics":[]}', '/repo')).toThrow(/not an array/)
})
