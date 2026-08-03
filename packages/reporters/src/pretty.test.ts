import { expect, test } from 'vitest'
import type { CheckEvent, CheckResult, Diagnostic, TimingReport, UnavailableEngine } from '@misaon/slop-gate-core'
import { displayWidth, hasWideOrFullwidthCharacter } from './display-width.ts'
import { createReporter } from './index.ts'
import type { ReporterContext } from './index.ts'

// Built from a char code, not a literal escape in this source file, purely so the byte sequence
// is unambiguous on review — this file's own diff would otherwise contain a raw control character.
const ANSI_ESCAPE = String.fromCharCode(27) + '['

const diagnostic = (over: Partial<Diagnostic> = {}): Diagnostic => ({
  concept: 'correctness.no-debugger',
  ruleRefKey: 'oxlint/no-debugger',
  engine: 'oxlint',
  severity: 'error',
  message: '`debugger` statement is not allowed',
  file: 'src/a.ts',
  range: { start: 22, end: 30 },
  position: { startLine: 2, startColumn: 3, endLine: 2, endColumn: 11 },
  docsUrl: 'https://example.test/no-debugger',
  fingerprint: 'abc',
  ...over,
})

const result = (over: Partial<CheckResult> = {}): CheckResult => ({
  diagnostics: [],
  counts: { error: 1, warn: 0, info: 0 },
  engineFailures: [],
  unavailableEngines: [],
  baseline: null,
  stats: { filesScanned: 3, filesAnalysed: 3, filesFromCache: 2, cacheByEngine: [], enginesRun: 1, durationMs: 42 },
  ruleset: { enabledConcepts: 5, overlaps: 1, uncovered: [], unknownKeys: [] },
  ...over,
})

const absent = (over: Partial<UnavailableEngine> = {}): UnavailableEngine => ({
  engine: 'astgrep',
  reason: '`ast-grep` was not found on PATH',
  install: 'brew install ast-grep',
  displaced: [
    {
      concept: 'slop.stub-implementation',
      languages: ['ts'],
      wouldOwn: { engine: 'astgrep', engineRuleId: 'stub-implementation' },
      insteadOwnedBy: undefined,
    },
    {
      concept: 'correctness.no-debugger',
      languages: ['ts'],
      wouldOwn: { engine: 'astgrep', engineRuleId: 'no-debugger' },
      insteadOwnedBy: { engine: 'oxlint', engineRuleId: 'no-debugger' },
    },
  ],
  ...over,
})

const capture = (events: CheckEvent[], contextOver: Partial<ReporterContext> = {}): string => {
  let output = ''
  const reporter = createReporter('pretty', {
    write: (chunk) => (output += chunk),
    color: false,
    unicode: true,
    width: 80,
    version: '0.0.0',
    readSource: () => 'export function f() {\n  debugger\n}\n',
    ...contextOver,
  })
  for (const event of events) reporter.onEvent(event)
  return output
}

// Diagnostics carrying their own count, so a single `done` event produces a run whose `diagnostics`
// array is internally consistent with `counts` and long enough to exercise the "Most frequent"
// threshold without hand-listing dozens of object literals.
const manyDiagnostics = (specs: ReadonlyArray<{ concept: string; count: number; file?: string }>): Diagnostic[] => {
  const out: Diagnostic[] = []
  for (const spec of specs) {
    for (let index = 0; index < spec.count; index += 1) {
      out.push(
        diagnostic({
          concept: spec.concept,
          file: spec.file ?? 'src/a.ts',
          fingerprint: `${spec.concept}-${index}`,
          position: { startLine: index + 1, startColumn: 1, endLine: index + 1, endColumn: 2 },
        }),
      )
    }
  }
  return out
}

test('prints the file, position, severity, message and concept', () => {
  const output = capture([{ type: 'diagnostic', diagnostic: diagnostic() }, { type: 'done', result: result() }])

  expect(output).toContain('src/a.ts')
  expect(output).toContain('2:3')
  expect(output).toContain('`debugger` statement is not allowed')
  expect(output).toContain('correctness.no-debugger')
})

test('prints a help hint when the diagnostic carries one', () => {
  const output = capture([
    { type: 'diagnostic', diagnostic: diagnostic({ help: 'remove the debugger statement' }) },
    { type: 'done', result: result() },
  ])
  expect(output).toContain('help: remove the debugger statement')
})

test('omits the help line entirely when the diagnostic has none', () => {
  const output = capture([{ type: 'diagnostic', diagnostic: diagnostic() }, { type: 'done', result: result() }])
  expect(output).not.toContain('help:')
})

test('prints a file header once for consecutive diagnostics in the same file', () => {
  const output = capture([
    { type: 'diagnostic', diagnostic: diagnostic() },
    { type: 'diagnostic', diagnostic: diagnostic({ range: { start: 31, end: 39 }, fingerprint: 'def', concept: 'dead-code.unused-variable' }) },
    { type: 'done', result: result({ counts: { error: 1, warn: 1, info: 0 } }) },
  ])

  expect(output.match(/src\/a\.ts/g)).toHaveLength(1)
})

test('prints a new header when the file changes', () => {
  const output = capture([
    { type: 'diagnostic', diagnostic: diagnostic() },
    { type: 'diagnostic', diagnostic: diagnostic({ file: 'src/b.ts', fingerprint: 'def' }) },
    { type: 'done', result: result() },
  ])

  expect(output).toContain('src/a.ts')
  expect(output).toContain('src/b.ts')
})

test('summarises counts, scanned/analysed/cached files and duration', () => {
  const output = capture([{ type: 'done', result: result() }])

  expect(output).toContain('1 error')
  expect(output).toContain('3 scanned')
  expect(output).toContain('3 analysed')
  expect(output).toContain('2 cached')
  expect(output).toContain('42')
})

test('folds analysed and cached into one clause once every analysed file came from the cache', () => {
  // A fully-warm run: every file the plan assigned to an engine was served from the cache. Saying
  // "127 analysed · 127 cached" reads like a coincidence rather than the whole story — "(all
  // cached)" says the same thing without repeating the number.
  const output = capture([
    { type: 'done', result: result({ stats: { filesScanned: 179, filesAnalysed: 127, filesFromCache: 127, cacheByEngine: [], enginesRun: 1, durationMs: 83 } }) },
  ])

  expect(output).toContain('179 scanned')
  expect(output).toContain('127 analysed (all cached)')
  expect(output).not.toContain('127 cached')
})

test('does not claim anything was cached when nothing was analysed', () => {
  // No engine covers any of the scanned files (e.g. a repo of only .json/.md/lockfiles) — 0
  // analysed necessarily means 0 cached too, but saying so is redundant, not just crisp: "0
  // analysed" alone does not imply a cache failure the way "0 analysed · 0 cached" reads.
  const output = capture([
    { type: 'done', result: result({ stats: { filesScanned: 5, filesAnalysed: 0, filesFromCache: 0, cacheByEngine: [], enginesRun: 0, durationMs: 3 } }) },
  ])

  expect(output).toContain('5 scanned')
  expect(output).toContain('0 analysed')
  expect(output).not.toContain('cached')
})

test('shows the analysed/cached split when they differ', () => {
  const output = capture([
    { type: 'done', result: result({ stats: { filesScanned: 179, filesAnalysed: 127, filesFromCache: 90, cacheByEngine: [], enginesRun: 1, durationMs: 83 } }) },
  ])

  expect(output).toContain('179 scanned')
  expect(output).toContain('127 analysed')
  expect(output).toContain('90 cached')
  expect(output).not.toContain('analysed (all cached)')
})

test('names each engine when the aggregate cache count understates the run', () => {
  // The reason `stats.cacheByEngine` exists: `filesFromCache` needs *every* engine that claimed a file
  // to have hit, so one whole-program engine invalidating on any edit reports 3 out of 353 while the
  // per-file engines were served 351 each. "3 cached" is not wrong, and on its own it is read as "the
  // cache did nothing".
  const output = capture([
    {
      type: 'done',
      result: result({
        stats: {
          filesScanned: 373,
          filesAnalysed: 353,
          filesFromCache: 3,
          cacheByEngine: [
            { engine: 'astgrep', filesAssigned: 351, filesFromCache: 351 },
            { engine: 'knip', filesAssigned: 12, filesFromCache: 0 },
            { engine: 'oxlint', filesAssigned: 351, filesFromCache: 351 },
            { engine: 'tsc', filesAssigned: 353, filesFromCache: 0 },
          ],
          enginesRun: 4,
          durationMs: 1489,
        },
      }),
    },
  ])

  expect(output).toContain('353 analysed')
  expect(output).toContain('3 cached')
  expect(output).toContain('cache ')
  expect(output).toContain('oxlint 351/351')
  expect(output).toContain('astgrep 351/351')
  expect(output).toContain('tsc 0/353')
  expect(output).toContain('knip 0/12')
})

test('keeps the per-engine breakdown off a run where it would add nothing', () => {
  // Two cases, and the same predicate covers both: a cold run has every engine at zero, so no engine
  // exceeds the aggregate; a fully warm one has nothing left to explain. Printing a breakdown either
  // time would be footer noise on the two most common runs there are.
  const cold = capture([
    {
      type: 'done',
      result: result({
        stats: {
          filesScanned: 373,
          filesAnalysed: 353,
          filesFromCache: 0,
          cacheByEngine: [
            { engine: 'oxlint', filesAssigned: 351, filesFromCache: 0 },
            { engine: 'tsc', filesAssigned: 353, filesFromCache: 0 },
          ],
          enginesRun: 2,
          durationMs: 5750,
        },
      }),
    },
  ])
  expect(cold).not.toContain('oxlint 0/351')

  const warm = capture([
    {
      type: 'done',
      result: result({
        stats: {
          filesScanned: 373,
          filesAnalysed: 353,
          filesFromCache: 353,
          cacheByEngine: [
            { engine: 'oxlint', filesAssigned: 351, filesFromCache: 351 },
            { engine: 'tsc', filesAssigned: 353, filesFromCache: 353 },
          ],
          enginesRun: 2,
          durationMs: 157,
        },
      }),
    },
  ])
  expect(warm).toContain('353 analysed (all cached)')
  expect(warm).not.toContain('oxlint 351/351')
})

test('wraps the per-engine breakdown rather than letting the frame truncate an engine off it', () => {
  // The engines worth naming are the ones with the fewest hits, and they sort last — so truncating to
  // the frame width would drop precisely the ones the block exists for.
  const output = capture(
    [
      {
        type: 'done',
        result: result({
          stats: {
            filesScanned: 400,
            filesAnalysed: 380,
            filesFromCache: 1,
            cacheByEngine: [
              { engine: 'actionlint', filesAssigned: 14, filesFromCache: 14 },
              { engine: 'astgrep', filesAssigned: 351, filesFromCache: 351 },
              { engine: 'biome-css', filesAssigned: 9, filesFromCache: 9 },
              { engine: 'knip', filesAssigned: 12, filesFromCache: 0 },
              { engine: 'oxlint', filesAssigned: 351, filesFromCache: 350 },
              { engine: 'schema', filesAssigned: 2, filesFromCache: 2 },
              { engine: 'tsc', filesAssigned: 353, filesFromCache: 0 },
            ],
            enginesRun: 7,
            durationMs: 1489,
          },
        }),
      },
    ],
    { width: 60 },
  )

  expect(output).toContain('tsc 0/353')
  expect(output).toContain('knip 0/12')
  // Every framed line stays exactly one frame wide, breakdown lines included.
  const framed = output.split('\n').filter((line) => line.includes('│') || line.includes('|'))
  expect(new Set(framed.map((line) => line.length)).size).toBe(1)
})

test('pluralises the severity nouns a developer reads on every run', () => {
  // The scanned/analysed/cached line no longer carries a noun to pluralise at all — fix 4 dropped
  // "file(s)" from it entirely (see pretty.ts's `writeSummary`), so this test now covers what's
  // left with a noun: the severity counts, which still say "error" vs "errors".
  const singular = capture([{ type: 'done', result: result({ counts: { error: 1, warn: 0, info: 0 } }) }])
  expect(singular).toContain('1 error')
  expect(singular).not.toContain('1 errors')

  const plural = capture([{ type: 'done', result: result({ counts: { error: 0, warn: 2, info: 0 } }) }])
  expect(plural).toContain('2 warnings')
  expect(plural).not.toContain('2 warns')
})

test('says so plainly when nothing was found', () => {
  const output = capture([{ type: 'done', result: result({ counts: { error: 0, warn: 0, info: 0 } }) }])
  expect(output).toMatch(/no issues/i)
})

test('reports an engine failure prominently', () => {
  const output = capture([
    { type: 'engine-failed', engine: 'oxlint', message: 'binary not found' },
    { type: 'done', result: result({ engineFailures: [{ engine: 'oxlint', message: 'binary not found' }] }) },
  ])

  expect(output).toContain('oxlint')
  expect(output).toContain('binary not found')
})

test('a clean run with a missing engine does not read as clean', () => {
  const output = capture([{ type: 'done', result: result({ counts: { error: 0, warn: 0, info: 0 }, unavailableEngines: [absent()] }) }])

  expect(output).toContain('COVERAGE GAP  astgrep could not run here — `ast-grep` was not found on PATH')
  expect(output).toContain('2 concepts went unchecked or to a lower-ranked rule. Resolve it with `brew install ast-grep`.')
  expect(output).toContain('No issues found, but 1 engine could not run')
  expect(output).not.toMatch(/✓ {2}No issues found\s/)
})

test('an absent engine that would have owned nothing does not raise a gap', () => {
  const output = capture([
    { type: 'done', result: result({ counts: { error: 0, warn: 0, info: 0 }, unavailableEngines: [absent({ displaced: [] })] }) },
  ])

  expect(output).not.toContain('COVERAGE GAP')
  expect(output).toContain('No issues found')
})

test('mentions rule overlaps in the summary', () => {
  const output = capture([{ type: 'done', result: result() }])
  expect(output).toMatch(/1 rule overlap/i)
})

test('emits no escape codes when colour is off', () => {
  const output = capture([{ type: 'diagnostic', diagnostic: diagnostic() }, { type: 'done', result: result() }], { color: false })
  expect(output).not.toContain(ANSI_ESCAPE)
})

test('prints the framed header immediately, before any event is delivered', () => {
  let output = ''
  createReporter('pretty', {
    write: (chunk) => (output += chunk),
    color: false,
    unicode: true,
    width: 80,
    version: '1.2.3',
    readSource: () => null,
  })
  expect(output).toContain('slop-gate')
  expect(output).toContain('v1.2.3')
})

test('groups a diagnostic with file: null under a (configuration) heading, not a path', () => {
  const output = capture([
    { type: 'diagnostic', diagnostic: diagnostic({ file: null, concept: 'config.rule-overlap', message: 'overlap' }) },
    { type: 'done', result: result() },
  ])

  expect(output).toContain('(configuration)')
  expect(output).not.toMatch(/\bnull\b/)
})

test('does not attempt to read a source file for a file: null diagnostic', () => {
  let readSourceCalls = 0
  capture(
    [
      { type: 'diagnostic', diagnostic: diagnostic({ file: null, concept: 'config.rule-overlap' }) },
      { type: 'done', result: result() },
    ],
    {
      readSource: () => {
        readSourceCalls += 1
        return null
      },
    },
  )
  expect(readSourceCalls).toBe(0)
})

test('shows a code frame for the first finding of a concept in a file, not for a repeat of the same concept', () => {
  const output = capture([
    { type: 'diagnostic', diagnostic: diagnostic({ position: { startLine: 2, startColumn: 3, endLine: 2, endColumn: 11 } }) },
    { type: 'diagnostic', diagnostic: diagnostic({ position: { startLine: 5, startColumn: 1, endLine: 5, endColumn: 2 }, fingerprint: 'second' }) },
    { type: 'done', result: result({ counts: { error: 2, warn: 0, info: 0 } }) },
  ])

  // The frame renders the source line via `readSource`, which this test's `capture` stubs to a
  // fixed two-line body containing exactly one `debugger` token — so the frame's underline
  // (rendered once per shown frame) is the reliable signal of how many frames were drawn.
  const frameOccurrences = output.match(/[━^]{2,}/g) ?? []
  expect(frameOccurrences).toHaveLength(1)
})

test('shows a code frame for each distinct concept in the same file', () => {
  const output = capture([
    { type: 'diagnostic', diagnostic: diagnostic({ concept: 'correctness.no-debugger' }) },
    { type: 'diagnostic', diagnostic: diagnostic({ concept: 'dead-code.unused-variable', fingerprint: 'second', position: { startLine: 2, startColumn: 3, endLine: 2, endColumn: 11 } }) },
    { type: 'done', result: result({ counts: { error: 2, warn: 0, info: 0 } }) },
  ])

  const frameOccurrences = output.match(/[━^]{2,}/g) ?? []
  expect(frameOccurrences).toHaveLength(2)
})

test('adds a Most frequent block once total findings reach ten, ranked by count', () => {
  const nine = manyDiagnostics([{ concept: 'dead-code.unused-variable', count: 9 }])
  const below = capture([{ type: 'done', result: result({ diagnostics: nine, counts: { error: 9, warn: 0, info: 0 } }) }])
  expect(below).not.toContain('Most frequent')

  const ten = manyDiagnostics([
    { concept: 'dead-code.unused-variable', count: 7 },
    { concept: 'slop.as-any-cast', count: 2 },
    { concept: 'correctness.no-debugger', count: 1 },
  ])
  const atThreshold = capture([{ type: 'done', result: result({ diagnostics: ten, counts: { error: 10, warn: 0, info: 0 } }) }])
  expect(atThreshold).toContain('Most frequent')

  const frequentSection = atThreshold.slice(atThreshold.indexOf('Most frequent'))
  const deadCodeIndex = frequentSection.indexOf('dead-code.unused-variable')
  const asAnyIndex = frequentSection.indexOf('slop.as-any-cast')
  expect(deadCodeIndex).toBeGreaterThan(-1)
  expect(asAnyIndex).toBeGreaterThan(deadCodeIndex)
  expect(frequentSection).toContain('7')
  expect(frequentSection).toContain('2')
})

test('Most frequent lists at most the top three concepts', () => {
  const diagnostics = manyDiagnostics([
    { concept: 'a.one', count: 5 },
    { concept: 'a.two', count: 4 },
    { concept: 'a.three', count: 3 },
    { concept: 'a.four', count: 2 },
    { concept: 'a.five', count: 1 },
  ])
  const output = capture([{ type: 'done', result: result({ diagnostics, counts: { error: 15, warn: 0, info: 0 } }) }])

  expect(output).toContain('a.one')
  expect(output).toContain('a.two')
  expect(output).toContain('a.three')
  expect(output).not.toContain('a.four')
  expect(output).not.toContain('a.five')
})

test('truncates a long file path from the left, keeping the filename', () => {
  const longPath = 'src/very/deeply/nested/package/module/component/implementation/file.ts'
  const output = capture(
    [
      { type: 'diagnostic', diagnostic: diagnostic({ file: longPath }) },
      { type: 'done', result: result() },
    ],
    { width: 60 }, // narrow enough that this 70-character path cannot fit un-truncated
  )

  expect(output).toContain('…')
  expect(output).toContain('file.ts')
  expect(output).not.toContain(longPath)
})

test('frame borders stay aligned to the same display width across a full run', () => {
  // Every content line between the top and bottom border must resolve to exactly the same display
  // width, or the right-hand border characters would not line up. This only proves `frameRow`'s own
  // padding is self-consistent by `displayWidth`'s accounting — it cannot catch a real terminal
  // rendering a glyph narrower than the standard says, which is exactly why framed lines carry no
  // wide/fullwidth glyphs at all any more (see "never puts a wide or fullwidth character in a framed
  // line", below) rather than relying on measuring them correctly.
  const output = capture([
    { type: 'diagnostic', diagnostic: diagnostic({ severity: 'error' }) },
    { type: 'diagnostic', diagnostic: diagnostic({ severity: 'warn', fingerprint: 'w', concept: 'dead-code.unused-variable' }) },
    { type: 'diagnostic', diagnostic: diagnostic({ severity: 'info', fingerprint: 'i', concept: 'config.rule-overlap' }) },
    { type: 'done', result: result({ counts: { error: 1, warn: 1, info: 1 } }) },
  ])

  // Anchored at the start of the line (after the two-space page margin): a bordered frame row
  // always begins with the vertical bar there. A code frame's own gutter (e.g. "        2 │  ...")
  // also contains a "│", deep in the middle of the line, and must not be picked up here — it is
  // not part of a bordered box and is not expected to share its width.
  const borderLines = output.split('\n').filter((line) => /^ {2}[│╭╰]/.test(line))
  expect(borderLines.length).toBeGreaterThan(0)
  const widths = new Set(borderLines.map((line) => displayWidth(line)))
  expect(widths.size).toBe(1)
})

test('frame top and bottom borders match the content rows in display width', () => {
  const output = capture([{ type: 'done', result: result({ counts: { error: 0, warn: 0, info: 0 } }) }])
  const lines = output.split('\n').filter((line) => /^ {2}[│╭╰]/.test(line))
  const widths = new Set(lines.map((line) => displayWidth(line)))
  expect(widths.size).toBe(1)
})

test('never puts a wide or fullwidth character in a framed line', () => {
  // The invariant, not the workaround: `displayWidth`'s count of an emoji is standards-correct, but
  // real terminals disagree with the standard often enough that a framed line can never safely
  // contain one — see `hasWideOrFullwidthCharacter`'s doc comment. Stating this as an invariant, and
  // checking every framed line of the busiest footer this reporter draws (all three severities, the
  // "Most frequent" block, a rule overlap and an uncovered concept together), is what stops a
  // future glyph added to the footer from quietly reintroducing the bug fix 2 closed.
  const busy = manyDiagnostics([
    { concept: 'dead-code.unused-variable', count: 7 },
    { concept: 'slop.as-any-cast', count: 2 },
    { concept: 'correctness.no-debugger', count: 1 },
  ])
  const outputs = [
    // Clean run: header plus the "No issues found" footer.
    capture([{ type: 'done', result: result({ diagnostics: [], counts: { error: 0, warn: 0, info: 0 } }) }]),
    // Every severity, "Most frequent", a rule overlap and an uncovered concept at once.
    capture([
      {
        type: 'done',
        result: result({
          diagnostics: busy,
          counts: { error: 5, warn: 3, info: 2 },
          ruleset: { enabledConcepts: 5, overlaps: 3, uncovered: ['style.no-var'], unknownKeys: [] },
        }),
      },
    ]),
  ]

  for (const output of outputs) {
    const framedLines = output.split('\n').filter((line) => /^ {2}[│╭╰]/.test(line))
    expect(framedLines.length).toBeGreaterThan(0)
    for (const line of framedLines) {
      expect(hasWideOrFullwidthCharacter(line), line).toBe(false)
    }
  }
})

test('falls back to ASCII frame characters and severity markers when unicode is disabled', () => {
  const output = capture(
    [{ type: 'diagnostic', diagnostic: diagnostic() }, { type: 'done', result: result() }],
    { unicode: false },
  )

  expect(output).not.toContain('╭')
  expect(output).not.toContain('│')
  expect(output).not.toContain('▌')
  expect(output).not.toContain('🔴')
  expect(output).not.toContain('━')
  expect(output).toContain('+')
  expect(output).toContain('E')
})

test('ASCII fallback does not imply colour is off, and vice versa', () => {
  const asciiWithColor = capture([{ type: 'done', result: result({ counts: { error: 0, warn: 0, info: 0 } }) }], {
    unicode: false,
    color: true,
  })
  expect(asciiWithColor).toContain(ANSI_ESCAPE)
  expect(asciiWithColor).not.toContain('✓')

  const unicodeNoColor = capture([{ type: 'done', result: result({ counts: { error: 0, warn: 0, info: 0 } }) }], {
    unicode: true,
    color: false,
  })
  expect(unicodeNoColor).not.toContain(ANSI_ESCAPE)
  expect(unicodeNoColor).toContain('✓')
})

test('wraps a long message with continuation lines aligned to the message column', () => {
  const longMessage =
    'alpha bravo charlie delta echo foxtrot golf hotel india juliett kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu'
  const output = capture([
    { type: 'diagnostic', diagnostic: diagnostic({ message: longMessage }) },
    { type: 'done', result: result() },
  ])
  const lines = output.split('\n')

  const firstLine = lines.find((line) => line.includes('2:3'))
  const conceptLine = lines.find((line) => line.includes('correctness.no-debugger'))
  expect(firstLine).toBeDefined()
  expect(conceptLine).toBeDefined()

  // The concept line already sits at "the message column" (see `detailIndent` in pretty.ts); every
  // wrapped continuation line of the message above it must land at that same indent, not under the
  // severity glyph.
  const indent = conceptLine!.slice(0, conceptLine!.length - conceptLine!.trimStart().length)
  expect(indent.length).toBeGreaterThan(0)

  const continuationLines = lines.slice(lines.indexOf(firstLine!) + 1, lines.indexOf(conceptLine!))
  expect(continuationLines.length).toBeGreaterThan(1) // long enough to wrap onto more than one continuation line

  for (const line of continuationLines) {
    expect(line.startsWith(indent)).toBe(true)
    expect(line.startsWith(`${indent} `)).toBe(false) // exactly the message column, not one column further in
  }

  // Wrapping must not drop, duplicate, or reorder words.
  const firstFragment = firstLine!.slice(firstLine!.indexOf('2:3') + '2:3'.length).trim()
  const rejoined = [firstFragment, ...continuationLines.map((line) => line.trim())].join(' ')
  expect(rejoined).toBe(longMessage)

  // No produced line may run past the frame's available width.
  for (const line of [firstLine!, ...continuationLines]) expect(displayWidth(line)).toBeLessThanOrEqual(80)
})

test('a message shorter than the available width is not wrapped or altered', () => {
  const output = capture([
    { type: 'diagnostic', diagnostic: diagnostic({ message: 'short message' }) },
    { type: 'done', result: result() },
  ])
  expect(output).toContain('short message')
})

test('an unbreakable token in a message (e.g. a long path) is not broken across lines', () => {
  // Reproduces the real defect this fix targets: `config.rule-overlap`'s actual message is one
  // long, mostly-unbroken run of concept and rule identifiers with no short words to wrap on.
  const longToken = 'oxlint/no-unused-vars-and-eslint/@typescript-eslint/no-unused-vars-both-detect-dead-code.unused-variable'
  const output = capture([
    {
      type: 'diagnostic',
      diagnostic: diagnostic({ file: null, concept: 'config.rule-overlap', message: `see ${longToken} for detail` }),
    },
    { type: 'done', result: result() },
  ])

  expect(output).toContain(longToken)
  const tokenLine = output.split('\n').find((line) => line.includes(longToken))
  expect(tokenLine).toBeDefined()
  // The token line is allowed to run past the frame width (an unbroken identifier beats a chopped
  // one), but the token substring itself must appear whole, contiguous, and un-split.
  expect(tokenLine).toContain(longToken)
})

test('clamps frame width between 60 and 100 regardless of the reported terminal width', () => {
  // The border line's own display width is `context.width` clamped to [60, 100], plus the
  // constant two-column page margin that sits outside the box on every printed line.
  const narrow = capture([{ type: 'done', result: result({ counts: { error: 0, warn: 0, info: 0 } }) }], { width: 20 })
  const narrowBorder = narrow.split('\n').find((line) => line.includes('╭'))
  expect(narrowBorder).toBeDefined()
  expect(displayWidth(narrowBorder!)).toBe(60 + 2)

  const wide = capture([{ type: 'done', result: result({ counts: { error: 0, warn: 0, info: 0 } }) }], { width: 500 })
  const wideBorder = wide.split('\n').find((line) => line.includes('╭'))
  expect(wideBorder).toBeDefined()
  expect(displayWidth(wideBorder!)).toBe(100 + 2)
})

const baselineSummary = (over: Partial<NonNullable<CheckResult['baseline']>> = {}): NonNullable<CheckResult['baseline']> => ({
  path: '.slop-gate/baseline.json',
  entries: 609,
  accepted: 609,
  acceptedBySeverity: { error: 211, warn: 398, info: 0 },
  acceptedByConcept: [{ concept: 'correctness.shadows-outer-binding', count: 128 }],
  stale: [],
  ...over,
})

test('withholds the green tick when the run is green only because the baseline accepted findings', () => {
  const output = capture([
    { type: 'done', result: result({ counts: { error: 0, warn: 0, info: 0 }, baseline: baselineSummary() }) },
  ])
  expect(output).toContain('No issues found, but 609 baselined findings')
  expect(output).not.toContain('✓')
})

test('names both causes when an engine was absent and the baseline accepted findings', () => {
  const output = capture([
    {
      type: 'done',
      result: result({ counts: { error: 0, warn: 0, info: 0 }, unavailableEngines: [absent()], baseline: baselineSummary() }),
    },
  ])
  expect(output).toContain('No issues found, but 1 engine could not run and 609 baselined findings')
})

test('states the baseline on a run where it accepted nothing, so silence never means "no baseline"', () => {
  const output = capture([
    {
      type: 'done',
      result: result({ counts: { error: 0, warn: 0, info: 0 }, baseline: baselineSummary({ accepted: 0, entries: 4 }) }),
    },
  ])
  expect(output).toContain('.slop-gate/baseline.json holds 4 findings, none found here')
  expect(output).toContain('✓')
})

test('reports stale entries as fixed findings and names the command that prunes them', () => {
  const output = capture([
    {
      type: 'done',
      result: result({
        counts: { error: 0, warn: 0, info: 0 },
        baseline: baselineSummary({
          accepted: 1,
          stale: [
            { file: 'src/gone.ts', concept: 'slop.double-cast', fingerprint: 'zzzz' },
            { file: 'src/fixed.ts', concept: 'slop.as-any-cast', fingerprint: 'yyyy' },
          ],
        }),
      }),
    },
  ])
  expect(output).toContain('2 accepted findings are fixed — run `sgate baseline update`')
})

test('says nothing about a baseline when there is none', () => {
  const output = capture([{ type: 'done', result: result({ counts: { error: 0, warn: 0, info: 0 } }) }])
  expect(output).not.toContain('baseline')
})

const timings = (over: Partial<TimingReport> = {}): TimingReport => ({
  startupMs: 61.2,
  phases: [
    { name: 'run:tsc', durationMs: 40.1, count: 1 },
    { name: 'normalize:oxlint', durationMs: 6.2, count: 307 },
  ],
  unattributedMs: 9.8,
  rules: [
    { ruleRefKey: 'oxlint/no-debugger', findings: 23 },
    { ruleRefKey: 'tsc/2345', findings: 4 },
  ],
  ...over,
})

const timed = (over: Partial<TimingReport> = {}, durationMs = 117): CheckEvent => ({
  type: 'done',
  result: result({ counts: { error: 0, warn: 0, info: 0 }, stats: { ...result().stats, durationMs }, timings: timings(over) }),
})

test('says nothing about timing when nobody asked for it', () => {
  const output = capture([{ type: 'done', result: result({ counts: { error: 0, warn: 0, info: 0 } }) }])

  expect(output).not.toContain('timing')
  expect(output).not.toContain('unattributed')
})

test('prints the timing breakdown under the footer, each row as a share of the run', () => {
  const output = capture([timed()])

  const footerEnd = output.lastIndexOf('\u256f')
  expect(output.indexOf('timing')).toBeGreaterThan(footerEnd)
  expect(output).toMatch(/startup\s+61\.2 ms\s+52\.3%/)
  expect(output).toMatch(/run:tsc\s+40\.1 ms\s+34\.3%/)
  expect(output).toMatch(/unattributed\s+9\.8 ms\s+8\.4%/)
  expect(output).toContain('117 ms total')
})

test('brackets the engine work with the two rows that are not engine work, so the column reads as an account', () => {
  const output = capture([timed()])

  const rows = output
    .split('\n')
    .filter((line) => /^ {4}\S.* ms {2}/.test(line))
    .map((line) => line.trim().split(/\s+/)[0])
  expect(rows[0]).toBe('startup')
  expect(rows.at(-1)).toBe('unattributed')
})

test('shows how many spans a per-file phase summed, so 6 ms across 307 files is not read as one call', () => {
  const output = capture([timed()])

  expect(output).toMatch(/normalize:oxlint\s+6\.2 ms\s+\d+\.\d%\s+\u00d7307/)
  expect(output).not.toMatch(/run:tsc.*\u00d71/)
})

test('folds the phases too small to matter into one row rather than dropping them, so the column still adds up', () => {
  const phases = [
    { name: 'run:tsc', durationMs: 40.1, count: 1 },
    ...Array.from({ length: 12 }, (_, index) => ({ name: `dispose:e${index}`, durationMs: 0.1, count: 1 })),
  ]
  const output = capture([timed({ phases })])

  expect(output).not.toContain('dispose:e0')
  expect(output).toMatch(/12 smaller phases\s+1\.2 ms/)
})

test('names what the two rows core cannot itemise are actually made of', () => {
  const output = capture([timed()])

  expect(output).toContain('node boot')
  expect(output).toContain('module graph')
  expect(output).toContain('between yields')
})

test('per rule the breakdown is a finding count, and says so rather than implying a duration', () => {
  const output = capture([timed()])

  expect(output).toContain('findings by rule')
  expect(output).toContain('no engine reports per-rule time')
  expect(output).toMatch(/23\s+oxlint\/no-debugger/)
  expect(output).toMatch(/4\s+tsc\/2345/)
})

test('caps the per-rule list and says how much of it is missing', () => {
  const rules = Array.from({ length: 14 }, (_, index) => ({ ruleRefKey: `oxlint/rule-${index}`, findings: 20 - index }))
  const output = capture([timed({ rules })])

  expect(output).toContain('oxlint/rule-9')
  expect(output).not.toContain('oxlint/rule-10')
  expect(output).toContain('4 more rules')
  expect(output).toContain('`--format=json` carries every phase and every rule')
})

test('a run with nothing to report per rule prints the phases and no empty heading', () => {
  const output = capture([timed({ rules: [] })])

  expect(output).toContain('unattributed')
  expect(output).not.toContain('findings by rule')
})

test('the timing block never widens the output past the frame', () => {
  const output = capture([timed({ rules: [{ ruleRefKey: `oxlint/${'x'.repeat(120)}`, findings: 1 }] })])

  // 82: the 80-column frame plus the two-space left margin every line in this reporter carries.
  for (const line of output.split('\n')) expect(displayWidth(line)).toBeLessThanOrEqual(82)
})
