import { expect, test } from 'vitest'
import { parseOxlintOutput } from './parse.ts'

const SAMPLE = JSON.stringify({
  diagnostics: [
    {
      message: '`debugger` statement is not allowed',
      code: 'eslint(no-debugger)',
      severity: 'error',
      causes: [],
      url: 'https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-debugger.html',
      help: 'Remove the debugger statement',
      filename: 'src/a.ts',
      labels: [{ span: { offset: 38, length: 9, line: 5, column: 1 } }],
      related: [],
    },
    {
      message: 'Unexpected any. Specify a different type.',
      code: 'typescript(no-explicit-any)',
      severity: 'warning',
      causes: [],
      filename: 'src/a.ts',
      labels: [{ span: { offset: 60, length: 3, line: 7, column: 20 } }],
      related: [],
    },
  ],
  number_of_files: 1,
  number_of_rules: 2,
  threads_count: 8,
  start_time: 0.01,
})

test('extracts one raw diagnostic per entry', () => {
  expect(parseOxlintOutput(SAMPLE, '/repo')).toHaveLength(2)
})

test('keeps a core rule id bare and qualifies a plugin rule id', () => {
  const [core, plugin] = parseOxlintOutput(SAMPLE, '/repo')
  expect(core?.engineRuleId).toBe('no-debugger')
  expect(plugin?.engineRuleId).toBe('typescript/no-explicit-any')
})

test('converts offset and length into a byte range', () => {
  const [core] = parseOxlintOutput(SAMPLE, '/repo')
  expect(core?.range).toEqual({ start: 38, end: 47 })
})

test('carries message, severity, help and url through', () => {
  const [core] = parseOxlintOutput(SAMPLE, '/repo')
  expect(core?.message).toBe('`debugger` statement is not allowed')
  expect(core?.severity).toBe('error')
  expect(core?.help).toBe('Remove the debugger statement')
  expect(core?.docsUrl).toContain('no-debugger.html')
})

test('normalises an absolute filename to a repo-relative POSIX path', () => {
  const absolute = JSON.stringify({
    diagnostics: [
      {
        message: 'x',
        code: 'eslint(no-var)',
        severity: 'warning',
        filename: '/repo/packages/app/src/a.ts',
        labels: [{ span: { offset: 0, length: 1, line: 1, column: 1 } }],
      },
    ],
  })
  expect(parseOxlintOutput(absolute, '/repo')[0]?.file).toBe('packages/app/src/a.ts')
})

test('skips a diagnostic with no labels rather than inventing a range', () => {
  const unlabelled = JSON.stringify({
    diagnostics: [{ message: 'x', code: 'eslint(no-var)', severity: 'warning', filename: 'a.ts', labels: [] }],
  })
  expect(parseOxlintOutput(unlabelled, '/repo')).toEqual([])
})

test('returns nothing for empty output', () => {
  expect(parseOxlintOutput('', '/repo')).toEqual([])
  expect(parseOxlintOutput('{"diagnostics":[]}', '/repo')).toEqual([])
})

test('throws on output that is not oxlint json', () => {
  expect(() => parseOxlintOutput('not json at all', '/repo')).toThrow(/oxlint/)
})
