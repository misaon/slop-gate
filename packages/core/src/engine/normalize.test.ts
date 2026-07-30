import { expect, test } from 'vitest'
import type { RuleEntry, RuleRef } from '../registry/types.ts'
import { normalizeDiagnostics } from './normalize.ts'
import type { RawDiagnostic } from './types.ts'

const unusedVars: RuleEntry = {
  engine: 'oxlint',
  engineRuleId: 'no-unused-vars',
  concepts: ['dead-code.unused-variable', 'dead-code.unused-import'],
  classify: [{ messagePattern: '\\bimport(ed)?\\b', concept: 'dead-code.unused-import' }],
  tier: 0,
  priority: 90,
  severityDefault: 'warn',
  fixKind: 'suggested',
  fixTouches: ['imports'],
  requires: [],
  languages: ['ts'],
  docsUrl: 'https://example.test/no-unused-vars',
  since: '0.1.0',
}

// Built from scratch rather than `{ ...unusedVars, classify: undefined }`: `RuleEntry.classify` is
// optional, and `exactOptionalPropertyTypes` rejects assigning `undefined` to override it — the
// key must be absent, not present-with-undefined.
const noDebugger: RuleEntry = {
  engine: 'oxlint',
  engineRuleId: 'no-debugger',
  concepts: ['correctness.no-debugger'],
  tier: 0,
  priority: 90,
  severityDefault: 'error',
  fixKind: 'suggested',
  fixTouches: ['imports'],
  requires: [],
  languages: ['ts'],
  docsUrl: 'https://example.test/no-debugger',
  since: '0.1.0',
}

const entries = [unusedVars, noDebugger]

const owners = new Map<string, RuleRef>([
  ['dead-code.unused-variable', { engine: 'oxlint', engineRuleId: 'no-unused-vars' }],
  ['dead-code.unused-import', { engine: 'oxlint', engineRuleId: 'no-unused-vars' }],
  ['correctness.no-debugger', { engine: 'oxlint', engineRuleId: 'no-debugger' }],
])

const source = "import { unused } from 'y'\nconst spare = 1\ndebugger\n"

const raw = (over: Partial<RawDiagnostic> & Pick<RawDiagnostic, 'engineRuleId' | 'message'>): RawDiagnostic => ({
  severity: 'warning',
  file: 'src/a.ts',
  range: { start: 0, end: 26 },
  ...over,
})

const run = (raws: readonly RawDiagnostic[], levels: Record<string, string> = {}) =>
  normalizeDiagnostics({
    engine: 'oxlint',
    raws,
    entries,
    owners,
    sourceOf: () => source,
    levelOf: (concept) => levels[concept] as never,
  })

test('emits exactly one diagnostic per raw finding', () => {
  const result = run([raw({ engineRuleId: 'no-unused-vars', message: "'unused' is defined but never used" })])
  expect(result).toHaveLength(1)
})

test('classifies a finding by message when a rule covers several concepts', () => {
  const [imported] = run([raw({ engineRuleId: 'no-unused-vars', message: "'unused' imported but never used" })])
  const [variable] = run([raw({ engineRuleId: 'no-unused-vars', message: "'spare' is assigned but never used" })])

  expect(imported?.concept).toBe('dead-code.unused-import')
  expect(variable?.concept).toBe('dead-code.unused-variable')
})

test('falls back to the first concept when no classify pattern matches', () => {
  const [only] = run([raw({ engineRuleId: 'no-unused-vars', message: 'something unexpected' })])
  expect(only?.concept).toBe('dead-code.unused-variable')
})

test('drops a finding from a rule the registry does not describe', () => {
  expect(run([raw({ engineRuleId: 'not-in-registry', message: 'x' })])).toEqual([])
})

test('drops a finding whose concept is owned by a different rule', () => {
  const otherOwner = new Map<string, RuleRef>([
    ['correctness.no-debugger', { engine: 'eslint', engineRuleId: 'no-debugger' }],
  ])
  const result = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [raw({ engineRuleId: 'no-debugger', message: 'debugger' })],
    entries,
    owners: otherOwner,
    sourceOf: () => source,
    levelOf: () => undefined,
  })
  expect(result).toEqual([])
})

test('takes severity from the resolved level over the registry default', () => {
  const [only] = run([raw({ engineRuleId: 'no-debugger', message: 'debugger' })], {
    'correctness.no-debugger': 'info',
  })
  expect(only?.severity).toBe('info')
})

test('uses the registry default severity when no level is resolved', () => {
  const [only] = run([raw({ engineRuleId: 'no-debugger', message: 'debugger' })])
  expect(only?.severity).toBe('error')
})

test('drops a finding whose resolved level is off', () => {
  expect(run([raw({ engineRuleId: 'no-debugger', message: 'debugger' })], { 'correctness.no-debugger': 'off' })).toEqual([])
})

test('recomputes positions from byte offsets', () => {
  const [only] = run([
    raw({ engineRuleId: 'no-debugger', message: 'debugger', range: { start: 43, end: 51 } }),
  ])
  expect(only?.position).toEqual({ startLine: 3, startColumn: 1, endLine: 3, endColumn: 9 })
})

test('builds a canonical rule id from engine and engine rule id', () => {
  const [only] = run([raw({ engineRuleId: 'no-debugger', message: 'debugger' })])
  expect(only?.ruleId).toBe('oxlint/no-debugger')
})

test('prefers the engine docs url and falls back to the registry', () => {
  const [withUrl] = run([raw({ engineRuleId: 'no-debugger', message: 'x', docsUrl: 'https://engine.test/d' })])
  const [withoutUrl] = run([raw({ engineRuleId: 'no-debugger', message: 'x' })])

  expect(withUrl?.docsUrl).toBe('https://engine.test/d')
  expect(withoutUrl?.docsUrl).toBe('https://example.test/no-debugger')
})

test('gives repeated identical findings in one file distinct fingerprints', () => {
  const [first, second] = run([
    raw({ engineRuleId: 'no-debugger', message: 'debugger', range: { start: 43, end: 51 } }),
    raw({ engineRuleId: 'no-debugger', message: 'debugger', range: { start: 43, end: 51 } }),
  ])
  expect(first?.fingerprint).not.toBe(second?.fingerprint)
})

test('gives the same finding in two files distinct fingerprints', () => {
  const [a, b] = run([
    raw({ engineRuleId: 'no-debugger', message: 'debugger', file: 'src/a.ts' }),
    raw({ engineRuleId: 'no-debugger', message: 'debugger', file: 'src/b.ts' }),
  ])
  expect(a?.fingerprint).not.toBe(b?.fingerprint)
})

test('maps raw severities that have no resolved level', () => {
  const [advice] = run([raw({ engineRuleId: 'no-unused-vars', message: 'x', severity: 'advice' })])
  expect(advice?.severity).toBe('warn')
})
