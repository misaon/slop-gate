import { expect, test } from 'vitest'
import { createLineIndex } from '../diagnostics/position.ts'
import type { OwnerMap } from '../registry/ownership.ts'
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

const ownerMap = (pairs: readonly (readonly [string, RuleRef])[]): OwnerMap =>
  new Map(pairs.map(([concept, owner]) => [concept, [{ owner, languages: ['ts' as const] }]]))

const owners = ownerMap([
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

test('marks a finding in a generated file suppressed rather than dropping it', () => {
  const [only] = run([
    raw({ engineRuleId: 'no-debugger', message: 'debugger', file: 'src/client/client.gen.ts' }),
  ])

  expect(only?.file).toBe('src/client/client.gen.ts')
  expect(only?.suppressed).toEqual({ by: 'generated', reason: expect.stringContaining('generated') })
})

test('leaves a finding in a hand-written declaration file visible', () => {
  const [only] = run([raw({ engineRuleId: 'no-debugger', message: 'debugger', file: 'src/types/nextAuth.d.ts' })])
  expect(only?.suppressed).toBeUndefined()
})

test('keeps generated findings visible when the caller asks for them', () => {
  const [only] = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [raw({ engineRuleId: 'no-debugger', message: 'debugger', file: 'src/client/client.gen.ts' })],
    entries,
    owners,
    sourceOf: () => source,
    levelOf: () => undefined,
    generated: 'check',
  })
  expect(only?.suppressed).toBeUndefined()
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
  const otherOwner = ownerMap([['correctness.no-debugger', { engine: 'eslint', engineRuleId: 'no-debugger' }]])
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
  expect(only?.ruleRefKey).toBe('oxlint/no-debugger')
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

test('the fingerprints of one file do not depend on the order the engine reported them in', () => {
  const forward = [
    raw({ engineRuleId: 'no-unused-vars', message: 'unused import', range: { start: 0, end: 26 } }),
    raw({ engineRuleId: 'no-unused-vars', message: 'unused import', range: { start: 27, end: 42 } }),
  ]

  const inOrder = run(forward).map((diagnostic) => diagnostic.fingerprint)
  const reversed = run([...forward].reverse()).map((diagnostic) => diagnostic.fingerprint)

  expect(inOrder).toHaveLength(2)
  expect([...inOrder].sort()).toEqual([...reversed].sort())
})

test('a new finding above two existing ones leaves both their fingerprints alone', () => {
  const before = "import { a } from 'x'\nimport { b } from 'y'\n"
  const after = "import { c } from 'z'\nimport { a } from 'x'\nimport { b } from 'y'\n"
  const runWith = (fileSource: string, raws: readonly RawDiagnostic[]) =>
    normalizeDiagnostics({
      engine: 'oxlint',
      raws,
      entries,
      owners,
      sourceOf: () => fileSource,
      levelOf: () => undefined,
    })
  const unusedImport = (range: { start: number; end: number }): RawDiagnostic =>
    raw({ engineRuleId: 'no-unused-vars', message: 'unused import', range })

  const original = runWith(before, [unusedImport({ start: 0, end: 21 }), unusedImport({ start: 22, end: 43 })])
  const grown = runWith(after, [
    unusedImport({ start: 0, end: 21 }),
    unusedImport({ start: 22, end: 43 }),
    unusedImport({ start: 44, end: 65 }),
  ])

  const kept = original.map((diagnostic) => diagnostic.fingerprint)
  const now = grown.map((diagnostic) => diagnostic.fingerprint)
  expect(kept).toHaveLength(2)
  expect(now).toHaveLength(3)
  expect(now).toEqual(expect.arrayContaining(kept))
  expect(now.filter((fingerprint) => !kept.includes(fingerprint))).toHaveLength(1)
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

const NEXT_LINE = `sgate-disable${'-next-line'}`
const LINE = `sgate-disable${'-line'}`
const FILE = `sgate-disable${'-file'}`

test('marks a matching finding as suppressed instead of dropping it', () => {
  const fileSource = `// ${NEXT_LINE} correctness.no-debugger -- test reason\ndebugger\n`
  const debuggerOffset = fileSource.lastIndexOf('debugger')

  const [only] = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [raw({ engineRuleId: 'no-debugger', message: 'debugger', range: { start: debuggerOffset, end: debuggerOffset + 8 } })],
    entries,
    owners,
    sourceOf: () => fileSource,
    levelOf: () => undefined,
  })

  expect(only?.concept).toBe('correctness.no-debugger')
  expect(only?.suppressed).toEqual({ by: 'inline', reason: 'test reason' })
})

test('disable-line suppresses a finding on the same line as the comment', () => {
  const fileSource = `debugger // ${LINE} correctness.no-debugger -- test reason\n`

  const [only] = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [raw({ engineRuleId: 'no-debugger', message: 'debugger', range: { start: 0, end: 8 } })],
    entries,
    owners,
    sourceOf: () => fileSource,
    levelOf: () => undefined,
  })

  expect(only?.suppressed).toEqual({ by: 'inline', reason: 'test reason' })
})

test('disable-file suppresses a matching finding anywhere in the file', () => {
  const fileSource = `// ${FILE} correctness.no-debugger -- test reason\n\n\n\ndebugger\n`
  const debuggerOffset = fileSource.lastIndexOf('debugger')
  expect(createLineIndex(fileSource).positionAt(debuggerOffset).line).toBe(5)

  const [only] = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [raw({ engineRuleId: 'no-debugger', message: 'debugger', range: { start: debuggerOffset, end: debuggerOffset + 8 } })],
    entries,
    owners,
    sourceOf: () => fileSource,
    levelOf: () => undefined,
  })

  expect(only?.suppressed?.by).toBe('inline')
})

test('a directive naming a different concept does not suppress this finding', () => {
  const fileSource = `// ${NEXT_LINE} dead-code.unused-variable -- reason\ndebugger\n`
  const debuggerOffset = fileSource.lastIndexOf('debugger')

  const [only] = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [raw({ engineRuleId: 'no-debugger', message: 'debugger', range: { start: debuggerOffset, end: debuggerOffset + 8 } })],
    entries,
    owners,
    sourceOf: () => fileSource,
    levelOf: () => undefined,
  })

  expect(only?.suppressed).toBeUndefined()
})

test('emits config.unused-suppression when a directive matches nothing', () => {
  const fileSource = `// ${NEXT_LINE} correctness.no-debugger -- reason\nconst ok = 1\n`

  const result = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [],
    entries,
    owners,
    sourceOf: () => fileSource,
    levelOf: (concept) => (concept === 'config.unused-suppression' ? 'warn' : undefined) as never,
    suppressionScanFiles: ['src/a.ts'],
  })

  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({
    concept: 'config.unused-suppression',
    engine: 'slop-gate',
    ruleRefKey: 'slop-gate/config.unused-suppression',
    severity: 'warn',
    file: 'src/a.ts',
  })
  expect(result[0]?.position.startLine).toBe(1)
})

test('does not emit config.unused-suppression when its own level is off', () => {
  const fileSource = `// ${NEXT_LINE} correctness.no-debugger -- reason\nconst ok = 1\n`

  const result = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [],
    entries,
    owners,
    sourceOf: () => fileSource,
    levelOf: () => undefined,
    suppressionScanFiles: ['src/a.ts'],
  })

  expect(result).toEqual([])
})

test('a directive in a file with zero raws is invisible without suppressionScanFiles', () => {
  const fileSource = `// ${NEXT_LINE} correctness.no-debugger -- reason\nconst ok = 1\n`

  const result = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [],
    entries,
    owners,
    sourceOf: () => fileSource,
    levelOf: () => 'warn' as never,
  })

  expect(result).toEqual([])
})

test('emits config.suppression-missing-reason for a directive with no reason, without un-suppressing it', () => {
  const fileSource = `// ${NEXT_LINE} correctness.no-debugger\ndebugger\n`
  const debuggerOffset = fileSource.lastIndexOf('debugger')

  const result = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [raw({ engineRuleId: 'no-debugger', message: 'debugger', range: { start: debuggerOffset, end: debuggerOffset + 8 } })],
    entries,
    owners,
    sourceOf: () => fileSource,
    levelOf: (concept) => {
      if (concept === 'correctness.no-debugger') return 'error'
      if (concept === 'config.suppression-missing-reason') return 'warn'
      return undefined
    },
  })

  const debuggerDiagnostic = result.find((d) => d.concept === 'correctness.no-debugger')
  const missingReason = result.find((d) => d.concept === 'config.suppression-missing-reason')

  expect(debuggerDiagnostic?.suppressed).toEqual({ by: 'inline' })
  expect(missingReason).toMatchObject({ engine: 'slop-gate', severity: 'warn' })
})

test('a multi-target directive is not unused when only one of its targets matches', () => {
  const fileSource = `// ${NEXT_LINE} correctness.no-debugger, dead-code.unused-variable -- reason\ndebugger\n`
  const debuggerOffset = fileSource.lastIndexOf('debugger')

  const result = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [raw({ engineRuleId: 'no-debugger', message: 'debugger', range: { start: debuggerOffset, end: debuggerOffset + 8 } })],
    entries,
    owners,
    sourceOf: () => fileSource,
    levelOf: (concept) => (concept === 'config.unused-suppression' ? 'warn' : undefined) as never,
  })

  expect(result.some((d) => d.concept === 'config.unused-suppression')).toBe(false)
})

test('a file with no directives at all is unaffected', () => {
  const result = run([raw({ engineRuleId: 'no-debugger', message: 'debugger' })])
  expect(result[0]?.suppressed).toBeUndefined()
})

const directive = (rest: string): string => `// sgate-${'disable-next-line'} ${rest}`

test('an engine that owns none of a directive\'s targets does not call it unused', () => {
  const fileSource = `${directive('slop.double-cast -- checked above')}\nconst a = 1\n`
  const withAstGrep: OwnerMap = new Map(owners).set('slop.double-cast', [
    { owner: { engine: 'astgrep', engineRuleId: 'slop-double-cast' }, languages: ['ts'] },
  ])

  const result = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [],
    entries,
    owners: withAstGrep,
    sourceOf: () => fileSource,
    levelOf: (concept) => (concept === 'config.unused-suppression' ? 'warn' : undefined) as never,
    suppressionScanFiles: ['src/a.ts'],
  })

  expect(result).toEqual([])
})

test('the owning engine still calls its own unmatched directive unused', () => {
  const fileSource = `${directive('correctness.no-debugger -- stale')}\nconst a = 1\n`

  const result = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [],
    entries,
    owners,
    sourceOf: () => fileSource,
    levelOf: (concept) => (concept === 'config.unused-suppression' ? 'warn' : undefined) as never,
    suppressionScanFiles: ['src/a.ts'],
  })

  expect(result.map((d) => d.concept)).toEqual(['config.unused-suppression'])
})

test('a target no participating engine owns is still reported, by whoever is looking', () => {
  const fileSource = `${directive('style.invented-concept -- stale')}\nconst a = 1\n`

  const result = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [],
    entries,
    owners,
    sourceOf: () => fileSource,
    levelOf: (concept) => (concept === 'config.unused-suppression' ? 'warn' : undefined) as never,
    suppressionScanFiles: ['src/a.ts'],
  })

  expect(result.map((d) => d.concept)).toEqual(['config.unused-suppression'])
})

test('a rule-id target is resolved by its engine prefix, not through the election', () => {
  const fileSource = `${directive('astgrep/slop-double-cast -- checked above')}\nconst a = 1\n`

  const result = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [],
    entries,
    owners,
    sourceOf: () => fileSource,
    levelOf: (concept) => (concept === 'config.unused-suppression' ? 'warn' : undefined) as never,
    suppressionScanFiles: ['src/a.ts'],
  })

  expect(result).toEqual([])
})

test('a missing reason is reported regardless of who owns the target', () => {
  const fileSource = `${directive('slop.double-cast')}\nconst a = 1\n`
  const withAstGrep: OwnerMap = new Map(owners).set('slop.double-cast', [
    { owner: { engine: 'astgrep', engineRuleId: 'slop-double-cast' }, languages: ['ts'] },
  ])

  const result = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [],
    entries,
    owners: withAstGrep,
    sourceOf: () => fileSource,
    levelOf: (concept) => (concept === 'config.suppression-missing-reason' ? 'warn' : undefined) as never,
    suppressionScanFiles: ['src/a.ts'],
  })

  expect(result.map((d) => d.concept)).toEqual(['config.suppression-missing-reason'])
})

const fixEdits = [{ range: { start: 0, end: 26 }, replacement: '' }]

test('an engine fix is carried onto the diagnostic with the registry entry as its tier', () => {
  const [diagnostic] = run([
    raw({ engineRuleId: 'no-debugger', message: 'debugger', fix: { edits: fixEdits } }),
  ])

  expect(diagnostic?.fix).toEqual({
    kind: 'suggested',
    description: 'Apply the no-debugger fix.',
    edits: fixEdits,
  })
})

test("an engine's own description wins over the generated one", () => {
  const [diagnostic] = run([
    raw({ engineRuleId: 'no-debugger', message: 'debugger', fix: { description: 'Remove it.', edits: fixEdits } }),
  ])
  expect(diagnostic?.fix?.description).toBe('Remove it.')
})

test('a fix for a rule the registry calls unfixable is dropped, not retiered', () => {
  const unfixable: RuleEntry = { ...noDebugger, fixKind: 'none', fixTouches: [] }
  const [diagnostic] = normalizeDiagnostics({
    engine: 'oxlint',
    raws: [raw({ engineRuleId: 'no-debugger', message: 'debugger', fix: { edits: fixEdits } })],
    entries: [unusedVars, unfixable],
    owners,
    sourceOf: () => source,
    levelOf: () => 'error',
  })

  expect(diagnostic).toBeDefined()
  expect(diagnostic?.fix).toBeUndefined()
})

test('a fix carrying no edits is dropped', () => {
  const [diagnostic] = run([raw({ engineRuleId: 'no-debugger', message: 'debugger', fix: { edits: [] } })])
  expect(diagnostic?.fix).toBeUndefined()
})

test('a diagnostic with no fix has no fix key at all', () => {
  const [diagnostic] = run([raw({ engineRuleId: 'no-debugger', message: 'debugger' })])
  expect(diagnostic).not.toHaveProperty('fix')
})

test('the carried edits are copies, so a later mutation cannot reach into the cached diagnostic', () => {
  const edits = [{ range: { start: 0, end: 4 }, replacement: 'x' }]
  const [diagnostic] = run([raw({ engineRuleId: 'no-debugger', message: 'debugger', fix: { edits } })])

  edits[0]!.range.start = 999
  expect(diagnostic?.fix?.edits[0]?.range.start).toBe(0)
})
