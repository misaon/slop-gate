import { expect, test } from 'vitest'
import { renderCodeFrame } from './code-frame.ts'

const source = 'const a = 1\nconst b = 2\nconst c = 3\nconst d = 4\nconst e = 5\n'

test('shows the offending line with a caret underline', () => {
  const frame = renderCodeFrame(source, { startLine: 3, startColumn: 7, endLine: 3, endColumn: 8 })
  expect(frame).toContain('3 | const c = 3')
  expect(frame).toMatch(/\^/)
})

test('includes one line of context on each side', () => {
  const frame = renderCodeFrame(source, { startLine: 3, startColumn: 1, endLine: 3, endColumn: 2 })
  expect(frame).toContain('2 | const b = 2')
  expect(frame).toContain('4 | const d = 4')
  expect(frame).not.toContain('1 | const a = 1')
})

test('handles a finding on the first line', () => {
  const frame = renderCodeFrame(source, { startLine: 1, startColumn: 1, endLine: 1, endColumn: 6 })
  expect(frame).toContain('1 | const a = 1')
  expect(frame).not.toContain('0 |')
})

test('puts the caret under the character at the start column', () => {
  const frame = renderCodeFrame(source, { startLine: 1, startColumn: 7, endLine: 1, endColumn: 8 })
  const [codeLine, underline] = frame.split('\n')

  // `const` begins at the code line's column 1, so column 7 is six characters further right. Both
  // rows carry the same gutter, so the indices are directly comparable.
  expect(underline!.indexOf('^')).toBe(codeLine!.indexOf('const') + 6)
})

test('underlines only to end of line for a multi-line span', () => {
  const multi = 'const a = {\n  b: 1,\n}\n'
  const frame = renderCodeFrame(multi, { startLine: 1, startColumn: 11, endLine: 3, endColumn: 2 })
  expect(frame.split('\n').filter((line) => line.includes('^'))).toHaveLength(1)
})

test('emits no escape codes when colour is off', () => {
  const frame = renderCodeFrame(source, { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 }, { color: false })
  expect(frame).not.toContain('\u001B[')
})
