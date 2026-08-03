import { expect, test } from 'vitest'
import { ANCHOR_LABELS, parseOxlintOutput } from './parse.ts'

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

// Payload captured verbatim from oxlint 1.76.0 on a two-function file. Both labels are real; the
// first one names a *different* function than the message does.
const MULTI_LABEL = JSON.stringify({
  diagnostics: [
    {
      message: 'Function `innerHelper` does not capture any variables from its parent scope',
      code: 'unicorn(consistent-function-scoping)',
      severity: 'error',
      causes: [],
      url: 'https://oxc.rs/docs/guide/usage/linter/rules/unicorn/consistent-function-scoping.html',
      help: 'Move `innerHelper` to the outer scope to avoid recreating it on every call.',
      filename: 'cfs.js',
      labels: [
        { label: 'Outer scope where this function is defined', span: { offset: 16, length: 15, line: 1, column: 17 } },
        {
          label: 'This function does not use any variables from the parent function',
          span: { offset: 93, length: 11, line: 4, column: 12 },
        },
      ],
      related: [],
    },
  ],
  number_of_rules: 1,
})

test('anchors a declared rule on the label naming the offending node, not on the first label', () => {
  const [found] = parseOxlintOutput(MULTI_LABEL, '/repo')
  expect(found?.range).toEqual({ start: 93, end: 104 })
})

test('still takes the first label when the declared anchor text is not among the labels', () => {
  // What an oxc reword looks like from here. Falling back to the first label reproduces the old
  // behaviour rather than guessing at an index, so a reword costs the anchor and nothing else.
  const reworded = MULTI_LABEL.replace('This function does not use any variables from the parent function', 'Reworded upstream')
  expect(parseOxlintOutput(reworded, '/repo')[0]?.range).toEqual({ start: 16, end: 31 })
})

test('leaves every rule with no declared anchor on its first label', () => {
  // The measured property this table protects: for every multi-label rule other than the ones named
  // in `ANCHOR_LABELS`, label 0 is the offending node, so nothing may move them.
  const twoLabels = JSON.stringify({
    diagnostics: [
      {
        message: "Variable 'x' is used before its declaration",
        code: 'eslint(no-use-before-define)',
        severity: 'error',
        filename: 'a.ts',
        labels: [
          { label: 'used here', span: { offset: 10, length: 1 } },
          { label: 'defined here', span: { offset: 40, length: 1 } },
        ],
      },
      {
        message: 'Key is duplicated',
        code: 'eslint(no-dupe-keys)',
        severity: 'error',
        filename: 'a.ts',
        labels: [
          { label: 'Key is first defined here', span: { offset: 4, length: 1 } },
          { label: 'and duplicated here', span: { offset: 9, length: 1 } },
        ],
      },
    ],
    number_of_rules: 2,
  })
  expect(parseOxlintOutput(twoLabels, '/repo').map((d) => d.range)).toEqual([
    { start: 10, end: 11 },
    { start: 4, end: 5 },
  ])
})

test('anchors on the declared label wherever oxlint puts it in the array', () => {
  // Label order is not sorted by offset in oxlint's own output (`no-duplicate-imports` emits
  // 4:40 before 3:31), so matching on the text rather than on an index is what keeps a reordering
  // upstream from silently moving a finding.
  const reversed = JSON.parse(MULTI_LABEL) as { diagnostics: Array<{ labels: unknown[] }> }
  reversed.diagnostics[0]!.labels.reverse()
  expect(parseOxlintOutput(JSON.stringify(reversed), '/repo')[0]?.range).toEqual({ start: 93, end: 104 })
})

test('declares an anchor only for rules whose first label is not the offending node', () => {
  expect(Object.keys(ANCHOR_LABELS)).toEqual(['unicorn/consistent-function-scoping'])
})
