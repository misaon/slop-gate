import { expect, test } from 'vitest'
import type { CheckEvent, CheckResult, Diagnostic, UnavailableEngine } from '@misaon/slop-gate-core'
import { AGENT_REPORT_VERSION, createAgentReporter, summariseAgentGroups } from './agent.ts'
import { createReporter } from './index.ts'
import type { ReporterContext } from './index.ts'

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
  counts: { error: 0, warn: 0, info: 0 },
  engineFailures: [],
  unavailableEngines: [],
  baseline: null,
  stats: { filesScanned: 3, filesAnalysed: 3, filesFromCache: 2, enginesRun: 1, durationMs: 42 },
  ruleset: { enabledConcepts: 5, suppressed: 0, uncovered: [], unknownKeys: [] },
  ...over,
})

/** One absent engine that cost the run two concepts: one nothing else covers, one a lower-ranked
 *  rule picked up. Both halves matter — a hole and a downgrade are different facts. */
const absentEngine = (over: Partial<UnavailableEngine> = {}): UnavailableEngine => ({
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

const capture = (events: readonly CheckEvent[], contextOver: Partial<ReporterContext> = {}): string => {
  let output = ''
  const reporter = createReporter('agent', {
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

const done = (diagnostics: readonly Diagnostic[], over: Partial<CheckResult> = {}): Extract<CheckEvent, { type: 'done' }> => ({
  type: 'done',
  result: result({
    diagnostics: [...diagnostics],
    counts: {
      error: diagnostics.filter((d) => d.severity === 'error').length,
      warn: diagnostics.filter((d) => d.severity === 'warn').length,
      info: diagnostics.filter((d) => d.severity === 'info').length,
    },
    ...over,
  }),
})

const repeat = (count: number, over: (index: number) => Partial<Diagnostic>): Diagnostic[] =>
  Array.from({ length: count }, (_, index) => diagnostic(over(index)))

/** The reporter's own accounting, restated here so a budget assertion is measured the way the
 *  reporter measures — not against a second, looser idea of what a token is. */
const estimate = (text: string): number => Math.ceil(new TextEncoder().encode(text).length / 3)

const coverageLine = (output: string): string => output.split('\n').find((line) => line.startsWith('coverage:')) ?? ''

test('writes nothing before done, so a partial run never looks like a complete report', () => {
  const output = capture([
    { type: 'diagnostic', diagnostic: diagnostic() },
    { type: 'engine-failed', engine: 'oxlint', message: 'boom' },
  ])
  expect(output).toBe('')
})

test('a clean run says so and asks for nothing', () => {
  const output = capture([done([])])
  expect(output).toContain(`slop-gate agent report v${AGENT_REPORT_VERSION}`)
  expect(output).toContain('findings: 0')
  expect(output).toContain('coverage: no findings. Nothing was omitted.')
  expect(output).toContain('1. Nothing to do.')
})

test('splits findings by whether `sgate fix` handles them and names the flag needed', () => {
  const output = capture([
    done([
      diagnostic({ ruleId: 'oxlint/unicorn/no-useless-spread', concept: 'correctness.no-useless-spread' }),
      diagnostic({ ruleId: 'oxlint/vitest/no-conditional-expect', concept: 'correctness.vitest-no-conditional-expect' }),
    ]),
  ])

  expect(output).toContain('## automated — `sgate fix` rewrites these. Do not edit them by hand.')
  expect(output).toContain('Run: `sgate fix --unsafe`')
  expect(output).toContain('tier unsafe')
  expect(output).toContain('## judgement — no fix is declared for these.')
  expect(output.indexOf('## automated')).toBeLessThan(output.indexOf('## judgement'))
})

test('a rule the run arbitrated against decides the tier, not the shipped registry', () => {
  // `CheckOptions.entries` is a real seam (`resolveRun` takes it), so a run that narrowed or
  // replaced the registry must not have the reporter quietly consult the shipped one instead and
  // promise `sgate fix` will handle something this run's registry calls unfixable.
  const fixable = done([diagnostic({ ruleId: 'oxlint/unicorn/no-useless-spread', concept: 'correctness.no-useless-spread' })])
  expect(capture([fixable], { readSource: () => null })).toContain('## automated')

  let narrowed = ''
  createAgentReporter(
    {
      write: (chunk) => (narrowed += chunk),
      color: false,
      unicode: true,
      width: 80,
      version: '0.0.0',
      readSource: () => null,
    },
    { entries: [] },
  ).onEvent(fixable)

  expect(narrowed).not.toContain('## automated')
  expect(narrowed).toContain('## judgement')
})

test('a concept whose findings do not all carry a declared fix is judgement, not automated', () => {
  // Arbitration elects one owning rule per concept, so this shape does not arise in a real run — but
  // the fold has to fail closed if it ever does. An agent told `sgate fix` has a finding covered
  // leaves it alone, and nothing comes back for it.
  const output = capture([
    done([
      diagnostic({ concept: 'correctness.no-useless-spread', ruleId: 'oxlint/unicorn/no-useless-spread' }),
      diagnostic({ concept: 'correctness.no-useless-spread', ruleId: 'oxlint/vitest/no-conditional-expect', file: 'src/b.ts' }),
    ]),
  ])

  expect(output).not.toContain('## automated')
  expect(output).toContain('rule: oxlint/unicorn/no-useless-spread, oxlint/vitest/no-conditional-expect')
})

test('states the reason once per concept instead of once per finding', () => {
  const output = capture([
    done(
      repeat(3, (index) => ({
        concept: 'config.unused-suppression',
        ruleId: 'slop-gate/config.unused-suppression',
        engine: 'slop-gate',
        severity: 'warn',
        message: 'This suppression does not match any diagnostic on this line.',
        help: 'Remove the suppression, or fix its target so it matches again.',
        file: `src/${index}.ts`,
        position: { startLine: index + 1, startColumn: 1, endLine: index + 1, endColumn: 9 },
      })),
    ),
  ])

  expect(output.match(/^why: /gm)).toHaveLength(1)
  expect(output.match(/^message: /gm)).toHaveLength(1)
  expect(output.match(/^help: /gm)).toHaveLength(1)
  expect(output).toContain('### config.unused-suppression — 3 findings in 3 files · warn')
})

test('omits the reason for a concept whose description is generator boilerplate, and says so once', () => {
  // `pedantic.accessor-pairs` is one of the concepts the registry generator named *and* described,
  // so its description restates the rule id back at the reader ("Generated from oxlint's ... rule").
  // Printing that under `why:` would be worse than printing nothing, so the line is dropped — and a
  // single note explains the absence, because a missing `why:` on most groups otherwise reads as a
  // bug in the reporter. Kept synthetic on purpose: `agent.captured.test.ts` covers the other side
  // with real findings, and every concept a real run produces now has a rationale.
  const output = capture([
    done([
      diagnostic({ concept: 'pedantic.accessor-pairs', ruleId: 'oxlint/accessor-pairs', file: 'src/a.ts' }),
      diagnostic({ concept: 'correctness.no-debugger', ruleId: 'oxlint/no-debugger', file: 'src/b.ts' }),
    ]),
  ])

  expect(output).not.toContain('Generated from')
  expect(output).toContain('note: `why:` appears only where the concept has a curated rationale; 1 of 2 below are')
  expect(output.match(/^why: /gm)).toHaveLength(1)
  expect(output).toContain('why: A `debugger` statement halts execution wherever it is reached.')
})

test('keeps a differing message on the finding rather than hoisting a wrong one', () => {
  const output = capture([
    done([
      diagnostic({ message: 'first problem', file: 'src/a.ts' }),
      diagnostic({ message: 'second problem', file: 'src/b.ts' }),
    ]),
  ])

  expect(output).not.toContain('\nmessage: ')
  expect(output).toContain('- src/a.ts:2:3-11 — first problem')
  expect(output).toContain('- src/b.ts:2:3-11 — second problem')
})

test('shows the offending line beneath each finding', () => {
  const output = capture([done([diagnostic()])])
  expect(output).toContain('    2 |   debugger')
})

test('windows a long line around the finding instead of truncating its head', () => {
  const filler = 'x'.repeat(400)
  const output = capture([done([diagnostic({ position: { startLine: 1, startColumn: 380, endLine: 1, endColumn: 390 } })])], {
    readSource: () => `${filler}NEEDLE${filler}\n`,
  })

  expect(output).toContain('NEEDLE')
  expect(output).toContain('…')
})

test('says how many further lines a multi-line finding spans', () => {
  const output = capture([done([diagnostic({ position: { startLine: 1, startColumn: 1, endLine: 4, endColumn: 2 } })])], {
    readSource: () => 'one\ntwo\nthree\nfour\n',
  })

  expect(output).toContain('- src/a.ts:1:1..4:2')
  expect(output).toContain('    1 | one  (+3 more lines)')
})

test('renders a suggested change as a unified diff, built the way `sgate fix` builds it', () => {
  const source = 'export const a = 1\nexport const b = 2\n'
  const output = capture(
    [
      done([
        diagnostic({
          fix: { kind: 'safe', description: 'Use 3 instead.', edits: [{ range: { start: 17, end: 18 }, replacement: '3' }] },
          position: { startLine: 1, startColumn: 18, endLine: 1, endColumn: 19 },
        }),
      ]),
    ],
    { readSource: () => source },
  )

  expect(output).toContain('  fix: Use 3 instead. (tier safe)')
  expect(output).toContain('--- a/src/a.ts')
  expect(output).toContain('-export const a = 1')
  expect(output).toContain('+export const a = 3')
})

test('says the diff is unavailable rather than silently dropping an edit it cannot apply', () => {
  const output = capture(
    [
      done([
        diagnostic({
          fix: { kind: 'safe', description: 'Rewrite.', edits: [{ range: { start: 9_000, end: 9_001 }, replacement: 'x' }] },
        }),
      ]),
    ],
    { readSource: () => 'short\n' },
  )

  expect(output).toContain('diff unavailable')
  expect(output).toContain('out of range')
})

test('an orchestrator-level finding with no file is located, not skipped', () => {
  const output = capture([
    done([diagnostic({ concept: 'config.dead-override', ruleId: 'slop-gate/config.dead-override', engine: 'slop-gate', file: null })]),
  ])

  expect(output).toContain('### config.dead-override')
  expect(output).toContain('\n- (configuration)\n')
})

test('an engine failure is declared before anything else, because it makes the report incomplete', () => {
  const output = capture([
    done([diagnostic()], { engineFailures: [{ engine: 'tsc', message: 'exited 2' }] }),
  ])

  const lines = output.split('\n')
  expect(lines[3]).toContain('INCOMPLETE: engine `tsc` failed — exited 2.')
  expect(lines[3]).toContain('do not read a clean section as clean')
})

test('a run with no findings and a missing engine is never reported as clean', () => {
  // The failure this whole mechanism exists to prevent: an agent reads a report, sees no findings,
  // and concludes the files that engine owned are fine. Every place the report could be read as
  // "clean" has to say otherwise.
  const output = capture([done([], { unavailableEngines: [absentEngine()] })])

  expect(output).toContain(
    'INCOMPLETE: engine `astgrep` is registered but could not run here — `ast-grep` was not found on PATH. ' +
      'Nothing it would have reported appears below; do not read a clean section as clean. ' +
      'Resolve it with `brew install ast-grep`.',
  )
  expect(output).toContain('  unchecked: slop.stub-implementation — no other engine here covers it.')
  expect(output).toContain(
    '  downgraded: correctness.no-debugger — `oxlint/no-debugger` owns it instead, which arbitration ranks below `astgrep/no-debugger`.',
  )
  expect(coverageLine(output)).toBe(
    'coverage: 1 engine could not run (see INCOMPLETE above), so this is not a clean result. ' +
      'No findings from what did run, and nothing was omitted.',
  )
  expect(output).toContain('1. Make `astgrep` runnable here (`brew install ast-grep`) and re-run — 2 concept(s) went unchecked or to a lower-ranked rule.')
  expect(output).not.toContain('Nothing to do.')
})

test('the gap is stated even when findings were also produced', () => {
  const output = capture([done([diagnostic()], { unavailableEngines: [absentEngine()] })])

  expect(coverageLine(output)).toBe(
    'coverage: 1 engine could not run (see INCOMPLETE above), so this is not the whole picture. ' +
      '1 of 1 findings shown, 0 omitted (no --max-tokens set).',
  )
})

test('an absent engine with no install command still declares the gap', () => {
  const { install, ...withoutInstall } = absentEngine()
  expect(install).toBeDefined()
  const output = capture([done([], { unavailableEngines: [withoutInstall] })])

  expect(output).toContain(
    'INCOMPLETE: engine `astgrep` is registered but could not run here — `ast-grep` was not found on PATH. ' +
      'Nothing it would have reported appears below; do not read a clean section as clean.\n',
  )
  expect(output).not.toContain('Resolve it with')
  expect(output).toContain('1. Make `astgrep` runnable here and re-run — 2 concept(s) went unchecked or to a lower-ranked rule.')
})

test('an absent engine that would have owned nothing is a note, not a gap', () => {
  // Deliberately *not* INCOMPLETE. Nothing was lost: this engine would have lost every contest it
  // entered, so calling the run incomplete would be crying wolf, and an `INCOMPLETE` that fires when
  // nothing is missing is how a reader learns to skip the word.
  const output = capture([done([], { unavailableEngines: [absentEngine({ displaced: [] })] })])

  expect(output).not.toContain('INCOMPLETE')
  expect(output).toContain(
    'note: engine `astgrep` could not run here — `ast-grep` was not found on PATH. It would have owned ' +
      'nothing in this run, so no coverage was lost.',
  )
  expect(coverageLine(output)).toBe('coverage: no findings. Nothing was omitted.')
  expect(output).toContain('1. Nothing to do.')
})

test('a budget too small for any finding still cannot drop the gap', () => {
  const output = capture([done(repeat(40, (index) => ({ file: `src/${index}.ts` })), { unavailableEngines: [absentEngine()] })], {
    maxTokens: 200,
  })

  expect(output).toContain('INCOMPLETE: engine `astgrep` is registered but could not run here')
  expect(coverageLine(output)).toContain('1 engine could not run (see INCOMPLETE above)')
})

test('names concepts nothing could check and config keys that resolve to nothing', () => {
  const output = capture([
    done([diagnostic()], {
      ruleset: { enabledConcepts: 5, suppressed: 0, uncovered: ['a11y.alt-text', 'style.quotes'], unknownKeys: ['oxlint/nope'] },
    }),
  ])

  expect(output).toContain('config: 1 rule key(s) in the config name nothing')
  expect(output).toContain('uncovered: 2 enabled concept(s) have no capable engine here')
  expect(output).toContain('a11y.alt-text, style.quotes')
})

test('is byte-identical across two runs over the same result', () => {
  const diagnostics = [
    diagnostic({ file: 'src/a.ts' }),
    diagnostic({ file: 'src/b.ts', concept: 'style.x', ruleId: 'oxlint/style-x', severity: 'warn' }),
    diagnostic({ file: 'src/c.ts', fix: { kind: 'safe', description: 'd', edits: [{ range: { start: 0, end: 1 }, replacement: 'y' }] } }),
  ]

  expect(capture([done(diagnostics)])).toBe(capture([done(diagnostics)]))
  expect(capture([done(diagnostics)], { maxTokens: 900 })).toBe(capture([done(diagnostics)], { maxTokens: 900 }))
})

test('orders groups by concept when severity and size tie, whatever order they arrived in', () => {
  // The guard against map iteration order reaching the output. Two groups that tie on every earlier
  // key differ only by concept id, so a reporter that emitted them in insertion order would produce
  // different bytes for the same repository depending on which file an engine happened to visit
  // first — and the whole value of this format as an agent input rests on that never happening.
  const alpha = repeat(2, (index) => ({ concept: 'style.alpha', ruleId: 'oxlint/alpha', severity: 'warn' as const, file: `src/a${index}.ts` }))
  const beta = repeat(2, (index) => ({ concept: 'style.beta', ruleId: 'oxlint/beta', severity: 'warn' as const, file: `src/b${index}.ts` }))

  const forward = capture([done([...alpha, ...beta])])
  const reversed = capture([done([...beta, ...alpha])])

  expect(forward).toBe(reversed)
  expect(forward.indexOf('### style.alpha')).toBeLessThan(forward.indexOf('### style.beta'))
})

test('reports exactly what the token budget dropped, per concept and in total', () => {
  const many = [
    ...repeat(10, (index) => ({ concept: 'style.alpha', ruleId: 'oxlint/alpha', severity: 'warn' as const, file: `src/a${index}.ts` })),
    ...repeat(10, (index) => ({ concept: 'style.beta', ruleId: 'oxlint/beta', severity: 'warn' as const, file: `src/b${index}.ts` })),
  ]

  const output = capture([done(many)], { maxTokens: 400 })
  const coverage = coverageLine(output)
  const shown = Number(/coverage: (\d+) of/.exec(coverage)?.[1])
  const omitted = Number(/, (\d+) omitted/.exec(coverage)?.[1])

  expect(shown + omitted).toBe(20)
  expect(omitted).toBeGreaterThan(0)
  expect(output).toContain('omitted:')

  const perConcept = [...output.matchAll(/^ {2}(\S+) — (\d+) of (\d+) not shown$/gm)]
  expect(perConcept.reduce((sum, match) => sum + Number(match[2]), 0)).toBe(omitted)

  // The property that makes a truncated report safe to act on: the concept and its *true* count
  // survive even when every one of its findings was dropped.
  expect(output).toContain('### style.alpha — 10 findings in 10 files')
  expect(output).toContain('### style.beta — 10 findings in 10 files')
  expect(output).toContain(`Re-run with a larger \`--max-tokens\` than 400, or without it, to see the ${omitted} finding(s) omitted above.`)
})

test('keeps a worked example for every concept before deepening any one of them', () => {
  const many = [
    ...repeat(6, (index) => ({ concept: 'style.alpha', ruleId: 'oxlint/alpha', severity: 'warn' as const, file: `src/a${index}.ts` })),
    ...repeat(6, (index) => ({ concept: 'style.beta', ruleId: 'oxlint/beta', severity: 'warn' as const, file: `src/b${index}.ts` })),
  ]

  // Swept across every budget rather than pinned to one, so the assertion is the rotation invariant
  // itself and not a number that has to be re-tuned whenever a line of the fixed sections changes.
  // Every finding here renders to the same size, so rotation admits them strictly alternately and
  // the two groups can never differ by more than one.
  const full = estimate(capture([done(many)], { maxTokens: 100_000 }))
  let sawBoth = false
  for (let budget = 200; budget <= full; budget += 40) {
    const output = capture([done(many)], { maxTokens: budget })
    const shown = [...output.matchAll(/^- src\/([ab])\d+\.ts:/gm)].map((match) => match[1])
    const alpha = shown.filter((group) => group === 'a').length
    const beta = shown.filter((group) => group === 'b').length

    expect(Math.abs(alpha - beta), `budget ${budget}`).toBeLessThanOrEqual(1)
    sawBoth ||= alpha > 0 && beta > 0
  }
  expect(sawBoth).toBe(true)
})

test('fits every budget it can, and says so plainly for the ones it cannot', () => {
  const many = repeat(40, (index) => ({ concept: 'style.alpha', ruleId: 'oxlint/alpha', severity: 'warn' as const, file: `src/a${index}.ts` }))

  // The whole contract in one sweep, with no floor constant to keep in step with the prose: below
  // the floor the report overruns and declares it; at or above, it fits. A report that overran
  // without declaring it would fail here at whichever budget it happened at.
  //
  // Swept with and without a coverage gap, because the gap block is the newest thing the sizing
  // render has to bound: it is printed identically in both passes, and an asymmetry there would let
  // the finished document exceed a budget the reservation said it fitted.
  for (const unavailableEngines of [[], [absentEngine()]]) {
    let overran = 0
    for (let budget = 100; budget <= 4_000; budget += 25) {
      const output = capture([done(many, { unavailableEngines })], { maxTokens: budget })
      if (estimate(output) <= budget) continue
      overran += 1
      expect(output, `budget ${budget}`).toContain('note: the fixed sections alone estimate above the requested budget.')
    }
    expect(overran).toBeGreaterThan(0)
  }
})

test('counts a multi-byte message in bytes, so non-ASCII text cannot overrun the budget', () => {
  // Three UTF-8 bytes per CJK character and roughly one token each: counting `String.length` here
  // would under-count by threefold and blow straight through the budget, which is the one direction
  // the estimate must never err in.
  const many = repeat(30, (index) => ({
    concept: 'style.alpha',
    ruleId: 'oxlint/alpha',
    severity: 'warn' as const,
    file: `src/a${index}.ts`,
    message: `変数の宣言が重複しています ${index}`,
  }))

  const output = capture([done(many)], { maxTokens: 700, readSource: () => '変数の宣言が重複しています\n' })
  expect(estimate(output)).toBeLessThanOrEqual(700)
})

test('prints the fixed sections in full and admits it when the budget cannot even hold them', () => {
  const output = capture([done(repeat(4, (index) => ({ file: `src/a${index}.ts` })))], { maxTokens: 5 })

  expect(output).toContain('note: the fixed sections alone estimate above the requested budget.')
  expect(coverageLine(output)).toContain('0 of 4 findings shown, 4 omitted')
  expect(output).toContain('### correctness.no-debugger — 4 findings in 4 files')
})

test('never drops a finding the complete report would have fitted', () => {
  // The complete report carries none of the bookkeeping a truncated one needs, so it can be smaller
  // than the space that would be reserved to truncate it. Reserving first made a budget in that band
  // produce a *larger* document than a generous budget did, and claim findings were dropped.
  const many = repeat(12, (index) => ({ concept: 'style.alpha', ruleId: 'oxlint/alpha', severity: 'warn' as const, file: `src/a${index}.ts` }))
  const complete = capture([done(many)], { maxTokens: 100_000 })

  for (const budget of [estimate(complete), estimate(complete) + 1, estimate(complete) + 200]) {
    const output = capture([done(many)], { maxTokens: budget })
    expect(coverageLine(output), `budget ${budget}`).toContain('12 of 12 findings shown, 0 omitted')
    expect(estimate(output), `budget ${budget}`).toBeLessThanOrEqual(budget)
  }
})

test('says nothing was omitted when the budget held everything', () => {
  const output = capture([done([diagnostic()])], { maxTokens: 5_000 })

  expect(coverageLine(output)).toBe('coverage: 1 of 1 findings shown, 0 omitted (--max-tokens 5000).')
  expect(output).not.toContain('omitted:')
  expect(output).not.toContain('showing ')
})

test('reports no timing or cache figures, which would differ between two runs of the same repository', () => {
  const output = capture([done([diagnostic()])])
  expect(output).toContain('scope: 3 files scanned, 3 analysed')
  expect(output).not.toContain('42')
  expect(output).not.toContain('cached')
})

// --- `summariseAgentGroups`: the same grouping, without the prose ---------------------------------

test('the summary lists the same concepts, in the same order and on the same side of the split, as the report', () => {
  // The point of exporting this at all. A caller that renders the report *and* the summary — the MCP
  // `check` tool does both — must not be able to show a concept as `automated` in one and
  // `judgement` in the other, so both read one grouping rather than two agreeing implementations.
  const diagnostics = [
    diagnostic({ concept: 'correctness.no-useless-spread', ruleId: 'oxlint/unicorn/no-useless-spread' }),
    diagnostic({ concept: 'config.unused-suppression', ruleId: 'slop-gate/config.unused-suppression', severity: 'warn', file: 'src/b.ts' }),
    diagnostic({ concept: 'config.unused-suppression', ruleId: 'slop-gate/config.unused-suppression', severity: 'warn', file: 'src/c.ts' }),
  ]
  const event = done(diagnostics)
  const output = capture([event])
  const summaries = summariseAgentGroups(event.result)

  const headings = output
    .split('\n')
    .filter((line) => line.startsWith('### '))
    .map((line) => line.slice(4).split(' — ')[0])
  expect(summaries.map((group) => group.concept)).toEqual(headings)

  expect(summaries).toEqual([
    {
      concept: 'correctness.no-useless-spread',
      section: 'automated',
      tier: 'unsafe',
      severity: 'error',
      findings: 1,
      files: 1,
      ruleIds: ['oxlint/unicorn/no-useless-spread'],
      docsUrl: 'https://example.test/no-debugger',
    },
    {
      concept: 'config.unused-suppression',
      section: 'judgement',
      tier: null,
      severity: 'warn',
      findings: 2,
      files: 2,
      ruleIds: ['slop-gate/config.unused-suppression'],
      docsUrl: 'https://example.test/no-debugger',
    },
  ])
})

test('the summary states true counts even for a concept the budget dropped every finding of', () => {
  // The structural half of "a group header is never dropped". A caller that bounds the prose still
  // gets the complete inventory here, so a truncated report and its summary can never disagree about
  // how much was found.
  const many = repeat(40, (index) => ({ file: `src/${index}.ts`, fingerprint: `f${index}` }))
  const event = done(many)

  expect(capture([event], { maxTokens: 700 })).toContain('showing ')
  expect(summariseAgentGroups(event.result)[0]?.findings).toBe(40)
})

test('the summary reads the run\'s own registry entries, the same seam the reporter does', () => {
  const event = done([diagnostic({ ruleId: 'oxlint/unicorn/no-useless-spread', concept: 'correctness.no-useless-spread' })])

  expect(summariseAgentGroups(event.result)[0]?.section).toBe('automated')
  expect(summariseAgentGroups(event.result, { entries: [] })[0]?.section).toBe('judgement')
})

test('the summary is plain JSON — no Map or Set survives into it', () => {
  const event = done([diagnostic()])
  const [group] = summariseAgentGroups(event.result)

  expect(group).toBeDefined()
  expect(JSON.parse(JSON.stringify(group))).toEqual(group)
})

const baselineSummary = (over: Partial<NonNullable<CheckResult['baseline']>> = {}): NonNullable<CheckResult['baseline']> => ({
  path: '.slop-gate/baseline.json',
  entries: 609,
  accepted: 609,
  acceptedBySeverity: { error: 211, warn: 398, info: 0 },
  acceptedByConcept: [
    { concept: 'correctness.shadows-outer-binding', count: 128 },
    { concept: 'slop.double-cast', count: 54 },
  ],
  stale: [],
  ...over,
})

test('a run with no findings left is not a clean result when a baseline accepted them', () => {
  // The cardinal sin of this format, in its sharpest form: a model reads an empty report and concludes
  // the repository is clean while 609 real findings sit in a file it never saw.
  const output = capture([done([], { baseline: baselineSummary() })])

  expect(output).toContain('INCOMPLETE: a baseline accepted 609 findings — .slop-gate/baseline.json')
  expect(output).toContain('do not read a clean file or section as clean')
  expect(coverageLine(output)).toContain('a baseline accepted 609 findings (see INCOMPLETE above)')
  expect(coverageLine(output)).toContain('so this is not a clean result')
})

test('names the accepted concepts, so a model does not report a baselined concept as absent', () => {
  const output = capture([done([], { baseline: baselineSummary() })])
  expect(output).toContain('  accepted: correctness.shadows-outer-binding — 128')
  expect(output).toContain('  accepted: slop.double-cast — 54')
})

test('points at the flag that reveals the accepted findings, not at the one that accepts more', () => {
  const output = capture([done([], { baseline: baselineSummary() })])
  expect(output).toContain('`sgate check --no-baseline`')
  expect(output).not.toContain('sgate baseline create')
})

test('caps the accepted-concept list and says how many it did not name', () => {
  const many = Array.from({ length: 12 }, (_, index) => ({ concept: `c.${index}`, count: 12 - index }))
  const output = capture([done([], { baseline: baselineSummary({ acceptedByConcept: many }) })])
  expect(output).toContain('  accepted: +4 more concepts')
})

test('a baseline and an absent engine both correct the coverage line, in one sentence', () => {
  const output = capture([done([], { unavailableEngines: [absentEngine()], baseline: baselineSummary() })])
  expect(coverageLine(output)).toContain('1 engine could not run (see INCOMPLETE above) and a baseline accepted 609 findings')
})

test('corrects the coverage line on a run that also has findings of its own', () => {
  const output = capture([done([diagnostic()], { baseline: baselineSummary({ accepted: 1 }) })])
  expect(coverageLine(output)).toContain('a baseline accepted 1 finding (see INCOMPLETE above), so this is not the whole picture')
})

test('reports a stale entry as a fixed finding, without calling the report incomplete for it', () => {
  const output = capture([
    done([], {
      baseline: baselineSummary({
        accepted: 0,
        acceptedByConcept: [],
        stale: [{ file: 'src/gone.ts', concept: 'slop.double-cast', fingerprint: 'zzzz' }],
      }),
    }),
  ])
  expect(output).toContain('baseline: 1 accepted finding is fixed — `sgate baseline update` prunes it.')
  expect(output).not.toContain('INCOMPLETE')
  expect(coverageLine(output)).toBe('coverage: no findings. Nothing was omitted.')
})

test('says nothing about a baseline when no baseline was read', () => {
  expect(capture([done([])])).not.toContain('baseline')
})

test('a baseline that withheld nothing prints nothing, because there is no omission to correct', () => {
  const output = capture([done([], { baseline: baselineSummary({ accepted: 0, acceptedByConcept: [], entries: 4 }) })])
  expect(output).not.toContain('baseline')
  expect(coverageLine(output)).toBe('coverage: no findings. Nothing was omitted.')
})
