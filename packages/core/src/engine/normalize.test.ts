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

/**
 * An owner map in the `(concept, language)` shape `electOwners` now produces. The tests here are all
 * about a single `.ts` file, so every concept is owned for `ts` and the language dimension is
 * uniform — see `registry/elect.test.ts` for the split-ownership cases.
 */
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

// --- Inline suppressions (design spec §6.3) ------------------------------------------------------
// The three directive tokens, spliced rather than written whole — the same idiom, for the same
// reason, as `reporters/src/agent.ts`. `parseSuppressions` scans raw text with no notion of comments
// or string literals, so a fixture that spells a token out verbatim is a real directive as far as
// `sgate check` on this repository is concerned, reported as `config.unused-suppression` against this
// file. Only the source text is broken: each value below is byte-for-byte the real token, which is
// the point — these tests must drive normalization with exactly what a user writes.
const NEXT_LINE = `sgate-disable${'-next-line'}`
const LINE = `sgate-disable${'-line'}`
const FILE = `sgate-disable${'-file'}`

// The tests below deliberately bypass the shared `run()` helper above: it always serves the
// module-level `source` constant regardless of the file argument (`sourceOf: () => source`), fine for
// every test above (none of them care what the source text says) but wrong here, where the
// suppression comment's exact text is the point of the test. Each test below declares its own local
// `fileSource` instead — a distinct name, not `source` again, specifically so it does not shadow the
// module-level constant (oxlint's own `no-shadow` rightly flags that, see correctness.shadows-outer-binding).

test('marks a matching finding as suppressed instead of dropping it', () => {
  const fileSource = `// ${NEXT_LINE} correctness.no-debugger -- test reason\ndebugger\n`
  // `lastIndexOf`, not `indexOf`: the directive's own text contains "debugger" as a substring of
  // "no-debugger", which `indexOf` would find first — the real statement is the *last* occurrence.
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
  // The real statement is genuinely on a later line, not just the last string occurrence — this is
  // the property that distinguishes `disable-file` (line-agnostic) from the `disable-next-line`
  // test above, so pin it down rather than asserting suppression alone, which `appliesToLine: null`
  // would satisfy even if this offset pointed at the wrong line by accident.
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
    ruleId: 'slop-gate/config.unused-suppression',
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
  // Pins the contract `run/check.ts` relies on: a file an engine reports nothing for never
  // otherwise appears to this function at all, so a stale suppression comment in it would
  // silently go undetected unless the caller explicitly names the file here.
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

// Spelled in parts on purpose. `parseSuppressions` reads raw file text with no idea of string
// literals, so a test *about* directives that writes one out in full turns this file into a source
// of phantom `config.unused-suppression` findings against slop-gate's own `check` — the ten already
// above are exactly that. Assembling the token keeps the runtime source identical and the file text
// inert; the underlying limitation is recorded in the M0 follow-ups.
const directive = (rest: string): string => `// sgate-${'disable-next-line'} ${rest}`

test('an engine that owns none of a directive\'s targets does not call it unused', () => {
  // The defect this guards was user-visible the moment a second file-granularity engine existed:
  // `normalizeDiagnostics` runs once per (engine, file) and sees only that engine's diagnostics, so
  // oxlint's pass over a file whose only finding is ast-grep's reported the (correctly working)
  // suppression as matching nothing.
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
  // The other half, and the one that would make the guard above vacuous if it were wrong: scoping by
  // ownership must not stop the engine that *does* own the concept from reporting a dead suppression.
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
  // A directive naming a concept nothing covers can never match and is the dead suppression this
  // concept exists for. Excluding every engine on ownership grounds would silently stop reporting
  // it; `run/check.ts` collapses the resulting duplicates instead.
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
  // `directiveMatches` accepts `oxlint/no-shadow` as well as a concept id, so ownership has to be
  // readable from the spelling too — otherwise the rule-id form keeps the bug the concept form lost.
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
  // Deliberately not scoped by ownership: whether a directive carries a reason is a property of the
  // comment, not of any engine. Duplicates across engines are collapsed in `run/check.ts`.
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

// --- Fix data (spec §11 step 1): the engine supplies edits, the registry supplies the tier -------

const fixEdits = [{ range: { start: 0, end: 26 }, replacement: '' }]

test('an engine fix is carried onto the diagnostic with the registry entry as its tier', () => {
  const [diagnostic] = run([
    raw({ engineRuleId: 'no-debugger', message: 'debugger', fix: { edits: fixEdits } }),
  ])

  // `suggested` comes from `noDebugger.fixKind`, not from anything the raw diagnostic said.
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
