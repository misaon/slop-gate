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

test('attributes a code-less error diagnostic to the parse-error rule id instead of dropping it', () => {
  // Shape captured from the real binary against a genuinely broken file (no `code` key at all —
  // not an empty string, not null): `oxlint --format json` on `const x: = 5`.
  const parseFailure = JSON.stringify({
    diagnostics: [
      {
        message: 'Unexpected token',
        severity: 'error',
        causes: [],
        filename: 'broken.ts',
        labels: [{ span: { offset: 33, length: 1, line: 2, column: 12 } }],
        related: [],
      },
    ],
  })
  const [result] = parseOxlintOutput(parseFailure, '/repo')

  expect(result?.engineRuleId).toBe('parse-error')
  expect(result?.severity).toBe('error')
  expect(result?.file).toBe('broken.ts')
  expect(result?.range).toEqual({ start: 33, end: 34 })
})

test('still drops a code-less diagnostic that is not error severity, rather than guessing at it', () => {
  const codeless = JSON.stringify({
    diagnostics: [{ message: 'x', severity: 'warning', filename: 'a.ts', labels: [{ span: { offset: 0, length: 1 } }] }],
  })
  expect(parseOxlintOutput(codeless, '/repo')).toEqual([])
})

test('returns nothing for empty output', () => {
  expect(parseOxlintOutput('', '/repo')).toEqual([])
  expect(parseOxlintOutput('{"diagnostics":[]}', '/repo')).toEqual([])
})

test('throws on output that is not oxlint json', () => {
  expect(() => parseOxlintOutput('not json at all', '/repo')).toThrow(/oxlint/)
})

test('tolerates a plain-text preamble before the json, such as a stale-path warning', () => {
  const preambled = `No files found to lint. Please check your paths and ignore patterns.\n${JSON.stringify({
    diagnostics: [],
    number_of_files: 0,
    number_of_rules: 1,
  })}`
  expect(parseOxlintOutput(preambled, '/repo')).toEqual([])
})

test('does not throw when the reported rule count matches what was elected', () => {
  expect(parseOxlintOutput(SAMPLE, '/repo', { ruleCount: 2 })).toHaveLength(2)
})

test('throws when oxlint activated a different number of rules than were elected', () => {
  expect(() => parseOxlintOutput(SAMPLE, '/repo', { ruleCount: 3 })).toThrow(/expected 3 rule/)
})

test('maps a diagnostic scope oxlint spells differently from its own rule catalogue', () => {
  const payload = JSON.stringify({
    diagnostics: [
      {
        message: 'Do not use `<img>` element. Use `<Image />` from `next/image` instead.',
        code: 'next(no-img-element)',
        severity: 'warning',
        filename: 'apps/web/page.tsx',
        labels: [{ span: { offset: 0, length: 4 } }],
      },
      {
        message: 'React Hook useEffect has a missing dependency',
        code: 'react-hooks(exhaustive-deps)',
        severity: 'error',
        filename: 'apps/web/page.tsx',
        labels: [{ span: { offset: 0, length: 4 } }],
      },
    ],
    number_of_rules: 2,
  })
  expect(parseOxlintOutput(payload, '/repo').map((d) => d.engineRuleId)).toEqual([
    'nextjs/no-img-element',
    'react/exhaustive-deps',
  ])
})
