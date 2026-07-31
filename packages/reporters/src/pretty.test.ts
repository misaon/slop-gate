import { expect, test } from 'vitest'
import type { CheckEvent, CheckResult, Diagnostic } from '@misaon/slop-gate-core'
import { displayWidth, hasWideOrFullwidthCharacter } from './display-width.ts'
import { createReporter } from './index.ts'
import type { ReporterContext } from './index.ts'

// Built from a char code, not a literal escape in this source file, purely so the byte sequence
// is unambiguous on review — this file's own diff would otherwise contain a raw control character.
const ANSI_ESCAPE = String.fromCharCode(27) + '['

const diagnostic = (over: Partial<Diagnostic> = {}): Diagnostic => ({
  concept: 'correctness.no-debugger',
  ruleId: 'oxlint/no-debugger',
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
  stats: { filesScanned: 3, filesFromCache: 2, enginesRun: 1, durationMs: 42 },
  ruleset: { enabledConcepts: 5, suppressed: 1, uncovered: [], unknownKeys: [] },
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

test('summarises counts, cache use and duration', () => {
  const output = capture([{ type: 'done', result: result() }])

  expect(output).toContain('1 error')
  expect(output).toContain('3 files')
  expect(output).toContain('2 cached')
  expect(output).toContain('42')
})

test('pluralises the words a developer reads on every run', () => {
  const singular = capture([{ type: 'done', result: result({ stats: { filesScanned: 1, filesFromCache: 0, enginesRun: 1, durationMs: 1 } }) }])
  expect(singular).toContain('1 file')
  expect(singular).not.toContain('1 files')

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

test('mentions suppressed overlaps in the summary', () => {
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
  // "Most frequent" block, a suppressed overlap and an uncovered concept together), is what stops a
  // future glyph added to the footer from quietly reintroducing the bug fix 2 closed.
  const busy = manyDiagnostics([
    { concept: 'dead-code.unused-variable', count: 7 },
    { concept: 'slop.as-any-cast', count: 2 },
    { concept: 'correctness.no-debugger', count: 1 },
  ])
  const outputs = [
    // Clean run: header plus the "No issues found" footer.
    capture([{ type: 'done', result: result({ diagnostics: [], counts: { error: 0, warn: 0, info: 0 } }) }]),
    // Every severity, "Most frequent", a suppressed overlap and an uncovered concept at once.
    capture([
      {
        type: 'done',
        result: result({
          diagnostics: busy,
          counts: { error: 5, warn: 3, info: 2 },
          ruleset: { enabledConcepts: 5, suppressed: 3, uncovered: ['style.no-var'], unknownKeys: [] },
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
