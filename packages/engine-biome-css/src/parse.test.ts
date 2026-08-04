import { expect, test } from 'vitest'
import { EngineError } from '@misaon/slop-gate-core'
import { CSS_PARSE_ERROR_RULE_ID, parseBiomeOutput } from './parse.ts'

const payload = (diagnostics: unknown[], unchanged = 1): string =>
  JSON.stringify({
    summary: { changed: 0, unchanged, matches: 0, errors: 0, warnings: 0, infos: 0, skipped: 0, diagnosticsNotPrinted: 0 },
    diagnostics,
    command: 'lint',
  })

const finding = (over: Record<string, unknown> = {}) => ({
  severity: 'error',
  message: 'Duplicate properties can lead to unexpected behavior.',
  category: 'lint/suspicious/noDuplicateProperties',
  location: { path: 'a.css', start: { line: 3, column: 3 }, end: { line: 3, column: 8 } },
  advices: [],
  ...over,
})

const sources = new Map([['a.css', 'a {\n  color: red;\n  color: blue;\n}\n']])
const read = (file: string) => sources.get(file)
const enabled = new Set(['noDuplicateProperties'])

test('maps a finding onto its byte range', () => {
  const [diagnostic] = parseBiomeOutput(payload([finding()]), { read, enabled, expectedFileCount: 1 })
  expect(diagnostic).toMatchObject({
    engineRuleId: 'noDuplicateProperties',
    severity: 'error',
    file: 'a.css',
    range: { start: 20, end: 25 },
  })
  expect(sources.get('a.css')!.slice(20, 25)).toBe('color')
})

test('counts columns in codepoints, not UTF-16 code units', () => {
  const source = '/* 😀😀😀 */ a { color: red; color: blue; }\n'
  const expected = new TextEncoder().encode('/* 😀😀😀 */ a { color: red; ').length
  const column = [...'/* 😀😀😀 */ a { color: red; '].length + 1

  const [diagnostic] = parseBiomeOutput(
    payload([finding({ location: { path: 'e.css', start: { line: 1, column }, end: { line: 1, column: column + 5 } } })]),
    { read: () => source, enabled, expectedFileCount: 1 },
  )
  expect(diagnostic!.range.start).toBe(expected)
  expect(source.slice(diagnostic!.range.start, diagnostic!.range.end)).not.toBe('color')
})

test('carries the advice text as help when there is one', () => {
  const [diagnostic] = parseBiomeOutput(
    payload([finding({ advices: [{ start: { line: 2, column: 3 }, end: { line: 2, column: 8 }, text: 'Remove the duplicate.' }] })]),
    { read, enabled, expectedFileCount: 1 },
  )
  expect(diagnostic!.help).toBe('Remove the duplicate.')
})

test('rejects a finding under a rule this run did not enable', () => {
  expect(() =>
    parseBiomeOutput(payload([finding({ category: 'lint/style/noHexColors' })]), { read, enabled, expectedFileCount: 1 }),
  ).toThrow(EngineError)
  expect(() =>
    parseBiomeOutput(payload([finding({ category: 'lint/suspicious/noSuchRule' })]), { read, enabled, expectedFileCount: 1 }),
  ).toThrow(/never enabled/)
})

test('fails when Biome reports fewer files than the batch contained', () => {
  expect(() => parseBiomeOutput(payload([], 3), { read, enabled, expectedFileCount: 4 })).toThrow(/4 file\(s\), biome checked 3/)
})

test('drops the empty-message diagnostic Biome emits for an oversize file', () => {
  const oversize = { severity: 'warning', message: '', category: 'lint', location: { path: 'big.css', start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }, advices: [] }
  expect(parseBiomeOutput(payload([oversize], 1), { read, enabled, expectedFileCount: 1 })).toEqual([])
})

const parseErrorAt = (line: number) => ({
  severity: 'error',
  message: 'This syntax is not supported in CSS.',
  category: 'parse',
  location: { path: 'a.css', start: { line, column: 5 }, end: { line, column: 6 } },
  advices: [],
})

test('collapses a file’s parse errors into one not-analysed finding', () => {
  const diagnostics = parseBiomeOutput(payload([parseErrorAt(2), parseErrorAt(3), parseErrorAt(3)]), { read, enabled, expectedFileCount: 1 })
  expect(diagnostics).toHaveLength(1)
  expect(diagnostics[0]).toMatchObject({ engineRuleId: CSS_PARSE_ERROR_RULE_ID, severity: 'warning', file: 'a.css' })
  expect(diagnostics[0]!.message).toMatch(/was not analysed/)
  expect(diagnostics[0]!.message).toMatch(/This syntax is not supported in CSS\./)
})

test('discards lint findings from a file that failed to parse', () => {
  const parseError = { severity: 'error', message: 'Unexpected value or character.', category: 'parse', location: { path: 'a.css', start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }, advices: [] }
  const diagnostics = parseBiomeOutput(payload([parseError, finding()]), { read, enabled, expectedFileCount: 1 })
  expect(diagnostics.map((d) => d.engineRuleId)).toEqual([CSS_PARSE_ERROR_RULE_ID])
})

test('keeps findings from files that did parse, alongside another file that did not', () => {
  const parseError = { severity: 'error', message: 'boom', category: 'parse', location: { path: 'b.css', start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }, advices: [] }
  const diagnostics = parseBiomeOutput(payload([parseError, finding()], 2), {
    read: (file) => (file === 'a.css' ? sources.get('a.css') : '@bad\n'),
    enabled,
    expectedFileCount: 2,
  })
  expect(diagnostics.map((d) => `${d.file}:${d.engineRuleId}`).sort()).toEqual([
    `a.css:noDuplicateProperties`,
    `b.css:${CSS_PARSE_ERROR_RULE_ID}`,
  ])
})

test('normalises Windows separators in reported paths', () => {
  const [diagnostic] = parseBiomeOutput(payload([finding({ location: { path: 'web\\a.css', start: { line: 1, column: 1 }, end: { line: 1, column: 2 } } })]), {
    read: () => 'a { color: red }\n',
    enabled,
    expectedFileCount: 1,
  })
  expect(diagnostic!.file).toBe('web/a.css')
})

test('falls back to a zero-width range when the file cannot be read back', () => {
  const [diagnostic] = parseBiomeOutput(payload([finding()]), { read: () => undefined, enabled, expectedFileCount: 1 })
  expect(diagnostic!.range).toEqual({ start: 0, end: 0 })
})

test('throws on output that is not the JSON report', () => {
  expect(() => parseBiomeOutput('not json', { read, enabled, expectedFileCount: 0 })).toThrow(EngineError)
  expect(() => parseBiomeOutput('{"summary":{}}', { read, enabled, expectedFileCount: 0 })).toThrow(/diagnostics array/)
})

test('treats an empty report file as an empty batch', () => {
  expect(parseBiomeOutput('', { read, enabled, expectedFileCount: 0 })).toEqual([])
})

test('maps Biome severities onto the raw severity vocabulary', () => {
  const of = (severity: string) =>
    parseBiomeOutput(payload([finding({ severity })]), { read, enabled, expectedFileCount: 1 })[0]!.severity
  expect(of('error')).toBe('error')
  expect(of('warning')).toBe('warning')
  expect(of('information')).toBe('info')
  expect(of('hint')).toBe('advice')
})
