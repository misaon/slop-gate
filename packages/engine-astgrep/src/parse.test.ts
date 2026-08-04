import { expect, test } from 'vitest'
import { parseAstGrepOutput } from './parse.ts'

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
  expect(parseAstGrepOutput(JSON.stringify([match()]), '/repo')[0]).not.toHaveProperty('help')
})

test('maps ast-grep hint severity onto advice', () => {
  const [diagnostic] = parseAstGrepOutput(JSON.stringify([match({ severity: 'hint' })]), '/repo')
  expect(diagnostic?.severity).toBe('advice')
})

test('falls back to warning for a severity name it does not know', () => {
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
  expect(() => parseAstGrepOutput('{"diagnostics":[]}', '/repo')).toThrow(/not an array/)
})

test('a match carrying a replacement becomes a RawFix', () => {
  const [diagnostic] = parseAstGrepOutput(
    JSON.stringify([
      {
        ruleId: 'no-loose-eq',
        message: 'use strict equality',
        severity: 'warning',
        file: 'src/a.ts',
        range: { byteOffset: { start: 16, end: 22 } },
        replacement: 'q === 1',
        replacementOffsets: { start: 16, end: 22 },
      },
    ]),
    '/repo',
  )

  expect(diagnostic?.fix).toEqual({ edits: [{ range: { start: 16, end: 22 }, replacement: 'q === 1' }] })
})

test('a replacement span narrower than the match is used as given, not widened to the match', () => {
  const [diagnostic] = parseAstGrepOutput(
    JSON.stringify([
      {
        ruleId: 'r',
        file: 'src/a.ts',
        range: { byteOffset: { start: 10, end: 40 } },
        replacement: '===',
        replacementOffsets: { start: 20, end: 22 },
      },
    ]),
    '/repo',
  )

  expect(diagnostic?.range).toEqual({ start: 10, end: 40 })
  expect(diagnostic?.fix?.edits[0]?.range).toEqual({ start: 20, end: 22 })
})

test('a match from a rule with no fix has no fix key', () => {
  const [diagnostic] = parseAstGrepOutput(
    JSON.stringify([{ ruleId: 'r', file: 'src/a.ts', range: { byteOffset: { start: 0, end: 3 } } }]),
    '/repo',
  )

  expect(diagnostic).not.toHaveProperty('fix')
})

test('a replacement with no offsets is dropped rather than guessed at from the match range', () => {
  const [diagnostic] = parseAstGrepOutput(
    JSON.stringify([{ ruleId: 'r', file: 'src/a.ts', range: { byteOffset: { start: 0, end: 3 } }, replacement: 'x' }]),
    '/repo',
  )

  expect(diagnostic?.fix).toBeUndefined()
})

test('an empty replacement is a deletion, not a missing fix', () => {
  const [diagnostic] = parseAstGrepOutput(
    JSON.stringify([
      { ruleId: 'r', file: 'src/a.ts', range: { byteOffset: { start: 0, end: 3 } }, replacement: '', replacementOffsets: { start: 0, end: 3 } },
    ]),
    '/repo',
  )

  expect(diagnostic?.fix?.edits[0]?.replacement).toBe('')
})
