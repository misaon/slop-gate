import { expect, test } from 'vitest'
import { parseActionlintOutput, rangeFromLineColumn, readActionlintErrors, sanitize, type ParseActionlintOptions } from './parse.ts'

const WORKFLOW = ['on: push', 'jobs:', '  a:', '    runs-on: ubuntu-lastest', '    steps:', '      - run: echo hi', ''].join(
  '\n',
)

const options = (overrides: Partial<ParseActionlintOptions> = {}): ParseActionlintOptions => ({
  absolutePrefixes: ['/repo'],
  enabled: () => true,
  readSource: () => WORKFLOW,
  ...overrides,
})

const error = (overrides: Record<string, unknown> = {}) => ({
  message: 'label "ubuntu-lastest" is unknown',
  filepath: '.github/workflows/ci.yml',
  line: 4,
  column: 14,
  kind: 'runner-label',
  end_column: 27,
  ...overrides,
})

const parse = (errors: readonly unknown[], overrides: Partial<ParseActionlintOptions> = {}) =>
  parseActionlintOutput(readActionlintErrors(JSON.stringify(errors)), options(overrides))

test('empty output is no findings, not a parse failure', () => {
  expect(readActionlintErrors('')).toEqual([])
  expect(readActionlintErrors('\n  \n')).toEqual([])
})

test('a finding becomes a diagnostic with a byte range covering the offending token', () => {
  const [diagnostic] = parse([error()])
  expect(diagnostic?.engineRuleId).toBe('runner-label')
  expect(diagnostic?.file).toBe('.github/workflows/ci.yml')
  expect(diagnostic?.severity).toBe('error')
  expect(WORKFLOW.slice(diagnostic!.range.start, diagnostic!.range.end)).toBe('ubuntu-lastest')
})

test('the end of the range comes from the source, never from end_column', () => {
  const wide = ['on: push', 'jobs:', '  a:', '    name: 日本語のジョブ  # ラベル', '    runs-on: ubuntu-latest', ''].join('\n')
  const byteColumn = new TextEncoder().encode('    name: ').length + 1
  const [diagnostic] = parse([error({ line: 4, column: byteColumn, end_column: 3 })], { readSource: () => wide })
  const bytes = new TextEncoder().encode(wide)
  expect(new TextDecoder().decode(bytes.slice(diagnostic!.range.start, diagnostic!.range.end))).toBe('日本語のジョブ')
})

test('line 0, column 0 is the absence of a position and maps to an empty range at the top of the file', () => {
  const [diagnostic] = parse([error({ line: 0, column: 0, kind: 'expression', message: 'something with no node' })])
  expect(diagnostic?.range).toEqual({ start: 0, end: 0 })
})

test('a position past the end of the line clamps instead of running into the next one', () => {
  const [diagnostic] = parse([error({ line: 4, column: 9999 })])
  const lineEnd = WORKFLOW.indexOf('\n', WORKFLOW.indexOf('    runs-on'))
  expect(diagnostic?.range).toEqual({ start: lineEnd, end: lineEnd })
})

test('an unreadable file still yields the finding, at the top of the file', () => {
  const [diagnostic] = parse([error()], { readSource: () => undefined })
  expect(diagnostic?.range).toEqual({ start: 0, end: 0 })
})

test('rules outside the selection are dropped', () => {
  const kept = parse([error(), error({ kind: 'expression', message: 'property "x" is not defined' })], {
    enabled: (rule) => rule === 'expression',
  })
  expect(kept.map((diagnostic) => diagnostic.engineRuleId)).toEqual(['expression'])
})

test('a rule this registry has never heard of is dropped rather than emitted unattributable', () => {
  expect(parse([error({ kind: 'some-future-rule' })], { enabled: (rule) => rule !== 'some-future-rule' })).toEqual([])
})

test('a shellcheck or pyflakes finding fails the run loudly', () => {
  for (const kind of ['shellcheck', 'pyflakes']) {
    expect(() => parse([error({ kind })])).toThrow(new RegExp(`\`-${kind}=\` stopped disabling`))
  }
})

test('the quoted-scalar reusable-workflow input class is filtered, in all three inferred types', () => {
  const messages = [
    'input "flag" is typed as string by reusable workflow "./.github/workflows/x.yml". bool value cannot be assigned',
    'input "flag" is typed as string by reusable workflow "./.github/workflows/x.yml". null value cannot be assigned',
    'input "flag" is typed as string by reusable workflow "./.github/workflows/x.yml". number value cannot be assigned',
  ]
  expect(parse(messages.map((message) => error({ kind: 'expression', message })))).toEqual([])
})

test('a genuinely wrong reusable-workflow input type still reports', () => {
  const message =
    'input "count" is typed as number by reusable workflow "./.github/workflows/x.yml". string value cannot be assigned'
  expect(parse([error({ kind: 'expression', message })])).toHaveLength(1)
})

test('the fromJSON(bool) class is filtered, and other argument-type errors are not', () => {
  const filtered =
    '1st argument of function call is not assignable. "bool" cannot be assigned to "string". called function type is "fromJSON(string) -> any"'
  const kept =
    '1st argument of function call is not assignable. "string" cannot be assigned to "array<any>". called function type is "join(array<any>, string) -> string"'
  const result = parse([error({ kind: 'expression', message: filtered }), error({ kind: 'expression', message: kept })])
  expect(result.map((diagnostic) => diagnostic.message)).toEqual([kept])
})

test('yAML parse errors and duplicate keys are dropped, because the schema engine owns both', () => {
  const schemaOwned =
    'unexpected key "queue" for "concurrency" section. expected one of "cancel-in-progress", "group"'
  const kept = parse([
    error({ kind: 'syntax-check', message: "could not parse as YAML: yaml: unknown anchor 'missing' referenced", line: 0, column: 0 }),
    error({ kind: 'syntax-check', message: 'key "runs-on" is duplicated in "a" job. previously defined at line:4,col:5' }),
    error({ kind: 'syntax-check', message: schemaOwned }),
  ])
  expect(kept.map((diagnostic) => diagnostic.message)).toEqual([schemaOwned])
})

test('the `if: false` remediation is replaced, because following it would enable the job', () => {
  const [diagnostic] = parse([
    error({ kind: 'if-cond', message: 'constant expression "false" in condition. remove the if: section' }),
  ])
  expect(diagnostic?.message).not.toContain('remove the if: section')
  expect(diagnostic?.message).toContain('constant expression "false" in condition')
  expect(diagnostic?.message).toContain('only equivalent when the constant is truthy')
})

test('an if-cond finding that is not the constant-expression one is left alone', () => {
  const message = 'if: condition "(${{ success() }})" is always evaluated to true because extra characters are around ${{ }}'
  expect(parse([error({ kind: 'if-cond', message })])[0]?.message).toBe(message)
})

test('absolute paths are stripped out of messages', () => {
  const [diagnostic] = parse([
    error({
      kind: 'action',
      message: 'could not parse action metadata in "/repo/.github/actions/setup": line 5: unexpected key "type"',
    }),
  ])
  expect(diagnostic?.message).toBe('could not parse action metadata in ".github/actions/setup": line 5: unexpected key "type"')
})

test('every prefix is stripped, longest first, so a nested root does not leave a fragment', () => {
  expect(sanitize('at "/tmp/work/repo/a.yml" and "/tmp/work/b.yml"', ['/tmp/work', '/tmp/work/repo'])).toBe(
    'at "a.yml" and "b.yml"',
  )
})

test('a Windows-shaped absolute path is stripped too', () => {
  expect(sanitize(String.raw`defined at "C:\repo\.github\actions\x"`, [String.raw`C:\repo`])).toBe(String.raw`defined at ".github\actions\x"`)
})

test('backslash file paths are normalised to POSIX', () => {
  expect(parse([error({ filepath: '.github\\workflows\\ci.yml' })])[0]?.file).toBe('.github/workflows/ci.yml')
})

test('malformed output is an engine error, not silence', () => {
  expect(() => readActionlintErrors('not json')).toThrow(/could not parse actionlint JSON output/)
})

test('rangeFromLineColumn agrees with what the parser produces', () => {
  const range = rangeFromLineColumn({ line: 4, column: 14 }, WORKFLOW)
  expect(range).toEqual(parse([error()])[0]?.range)
  expect(WORKFLOW.slice(range.start, range.end)).toBe('ubuntu-lastest')
})
