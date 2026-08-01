import { expect, test } from 'vitest'
import type { Diagnostic } from '../diagnostics/types.ts'
import type { SuppressionDirective } from './parse.ts'
import { applySuppressions } from './apply.ts'

const diagnostic = (over: Partial<Diagnostic> & Pick<Diagnostic, 'concept'>): Diagnostic => ({
  ruleId: 'oxlint/no-shadow',
  engine: 'oxlint',
  severity: 'warn',
  message: 'x',
  file: 'src/a.ts',
  range: { start: 0, end: 1 },
  position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 },
  docsUrl: 'https://example.test',
  fingerprint: 'fp',
  ...over,
})

const directive = (over: Partial<SuppressionDirective> & Pick<SuppressionDirective, 'kind'>): SuppressionDirective => ({
  line: 1,
  appliesToLine: over.kind === 'disable-file' ? null : 1,
  targets: [],
  reason: 'because',
  ...over,
})

test('marks a diagnostic on the same line a bare disable-line directive covers', () => {
  const finding = diagnostic({ concept: 'correctness.shadows-outer-binding', position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 } })
  const result = applySuppressions([directive({ kind: 'disable-line', appliesToLine: 1 })], [finding])

  expect(result.diagnostics[0]?.suppressed).toEqual({ by: 'inline', reason: 'because' })
  expect(result.unused).toEqual([])
})

test('does not mark a diagnostic on a different line', () => {
  const finding = diagnostic({ concept: 'a.b', position: { startLine: 5, startColumn: 1, endLine: 5, endColumn: 2 } })
  const result = applySuppressions([directive({ kind: 'disable-line', appliesToLine: 1 })], [finding])

  expect(result.diagnostics[0]?.suppressed).toBeUndefined()
  expect(result.unused).toHaveLength(1)
})

test('an unmatched diagnostic is returned as the same object, not a copy', () => {
  const finding = diagnostic({ concept: 'a.b', position: { startLine: 5, startColumn: 1, endLine: 5, endColumn: 2 } })
  const result = applySuppressions([], [finding])
  expect(result.diagnostics[0]).toBe(finding)
})

test('a directive naming a target only matches that concept', () => {
  const shadow = diagnostic({ concept: 'correctness.shadows-outer-binding', position: { startLine: 2, startColumn: 1, endLine: 2, endColumn: 2 } })
  const debuggerFinding = diagnostic({ concept: 'correctness.no-debugger', position: { startLine: 2, startColumn: 1, endLine: 2, endColumn: 2 } })
  const result = applySuppressions(
    [directive({ kind: 'disable-line', appliesToLine: 2, targets: ['correctness.shadows-outer-binding'] })],
    [shadow, debuggerFinding],
  )

  expect(result.diagnostics[0]?.suppressed).toBeDefined()
  expect(result.diagnostics[1]?.suppressed).toBeUndefined()
})

test('a directive can name an engine rule id instead of a concept', () => {
  const finding = diagnostic({ concept: 'correctness.shadows-outer-binding', ruleId: 'oxlint/no-shadow', position: { startLine: 3, startColumn: 1, endLine: 3, endColumn: 2 } })
  const result = applySuppressions([directive({ kind: 'disable-line', appliesToLine: 3, targets: ['oxlint/no-shadow'] })], [finding])

  expect(result.diagnostics[0]?.suppressed).toBeDefined()
})

test('disable-file matches a diagnostic on any line', () => {
  const finding = diagnostic({ concept: 'a.b', position: { startLine: 400, startColumn: 1, endLine: 400, endColumn: 2 } })
  const result = applySuppressions([directive({ kind: 'disable-file', targets: ['a.b'] })], [finding])

  expect(result.diagnostics[0]?.suppressed).toBeDefined()
  expect(result.unused).toEqual([])
})

test('a directive matching nothing is reported unused', () => {
  const result = applySuppressions([directive({ kind: 'disable-line', appliesToLine: 1, targets: ['a.b'] })], [])
  expect(result.unused).toHaveLength(1)
})

test('a directive with no reason is reported missing-reason regardless of whether it matched', () => {
  const finding = diagnostic({ concept: 'a.b', position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 } })
  const matched = applySuppressions([directive({ kind: 'disable-line', appliesToLine: 1, reason: null })], [finding])
  const unmatched = applySuppressions([directive({ kind: 'disable-line', appliesToLine: 9, reason: null })], [finding])

  expect(matched.missingReason).toHaveLength(1)
  expect(matched.unused).toEqual([])
  expect(unmatched.missingReason).toHaveLength(1)
  expect(unmatched.unused).toHaveLength(1)
})

test('a suppressed diagnostic with no reason carries no reason key, not reason: undefined', () => {
  const finding = diagnostic({ concept: 'a.b', position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 } })
  const result = applySuppressions([directive({ kind: 'disable-line', appliesToLine: 1, reason: null })], [finding])

  expect(result.diagnostics[0]?.suppressed).toEqual({ by: 'inline' })
  expect(Object.keys(result.diagnostics[0]?.suppressed ?? {})).toEqual(['by'])
})

test('two directives that both cover the same diagnostic are each independently used', () => {
  const finding = diagnostic({ concept: 'a.b', position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 } })
  const fileWide = directive({ kind: 'disable-file', targets: ['a.b'], reason: 'file-wide' })
  const lineScoped = directive({ kind: 'disable-line', appliesToLine: 1, targets: ['a.b'], reason: 'line-scoped' })

  const result = applySuppressions([fileWide, lineScoped], [finding])

  expect(result.unused).toEqual([])
  // First directive in source order wins the marker — deterministic, not load-bearing which one.
  expect(result.diagnostics[0]?.suppressed).toEqual({ by: 'inline', reason: 'file-wide' })
})

test('preserves the input length and relative order', () => {
  const a = diagnostic({ concept: 'a.a', position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 } })
  const b = diagnostic({ concept: 'a.b', position: { startLine: 2, startColumn: 1, endLine: 2, endColumn: 2 } })
  const result = applySuppressions([], [a, b])
  expect(result.diagnostics).toEqual([a, b])
})
