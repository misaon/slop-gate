import type { ConceptWhy } from '@misaon/slop-gate-core'
import { expect, test } from 'vitest'
import { displayWidth, hasWideOrFullwidthCharacter } from '../display-width.ts'
import type { RulesReporterContext } from './context.ts'
import { renderRulesWhyJson, renderRulesWhyPretty, RULES_WHY_JSON_VERSION } from './why.ts'

const explanation = (over: Partial<ConceptWhy> = {}): ConceptWhy => ({
  concept: 'correctness.no-debugger',
  isKnownConcept: true,
  servicedBySlopGate: false,
  enablement: { enabled: true, level: 'error', baseProvenance: [{ layer: 'preset', source: 'recommended', setting: 'error' }], overrides: [] },
  pinnedOwner: undefined,
  candidates: [],
  owner: undefined,
  suppressed: [],
  ineligible: [],
  uncovered: false,
  ...over,
})

const capture = (result: ConceptWhy, contextOver: Partial<RulesReporterContext> = {}): string => {
  let output = ''
  const context: RulesReporterContext = { write: (chunk) => (output += chunk), color: false, unicode: true, width: 80, version: '0.0.0', ...contextOver }
  renderRulesWhyPretty(result, context)
  return output
}

/** Collapses runs of whitespace (including the newline/indent a wrapped ineligibility explanation
 *  now introduces — see `wrapText`'s use in `why.ts`) so a phrase-level assertion still matches
 *  regardless of exactly where the renderer happened to wrap the line it appears in. */
const flat = (output: string): string => output.replace(/\s+/g, ' ')

test('reports an unknown concept without throwing, and does not attempt to describe it', () => {
  const output = capture(explanation({ concept: 'not.a.concept', isKnownConcept: false, enablement: { enabled: false, level: 'off', baseProvenance: [], overrides: [] } }))
  expect(output).toMatch(/not a recognised concept/i)
  expect(output).toContain('sgate rules list')
})

test('explains a concept no layer ever enables', () => {
  const output = capture(
    explanation({
      enablement: { enabled: false, level: 'off', baseProvenance: [], overrides: [] },
      candidates: [{ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'], tier: 0, priority: 100, severityDefault: 'error', fixKind: 'none', fixTouches: [], requires: [], languages: ['ts'], docsUrl: 'https://x.test', since: '0.1.0' } as never],
    }),
  )
  expect(output).toMatch(/enabled: no/i)
  expect(output).toMatch(/no preset or config layer ever enables/i)
  expect(output).toContain('oxlint/no-debugger')
  expect(output).toMatch(/produces no findings: not enabled/i)
})

test('explains a layer that enabled a concept and a later one that turned it off', () => {
  const output = capture(
    explanation({
      enablement: {
        enabled: false,
        level: 'off',
        baseProvenance: [
          { layer: 'preset', source: 'recommended', setting: 'error' },
          { layer: 'root-config', source: 'slop-gate.config.ts', setting: 'off' },
        ],
        overrides: [],
      },
    }),
  )
  expect(output).toMatch(/preset `recommended` enabled this at `error`, but root config `slop-gate\.config\.ts` turned it off/)
})

test('shows the owner and an ineligible non-participating engine — the real oxlint/eslint case', () => {
  const output = capture(
    explanation({
      concept: 'dead-code.unused-variable',
      owner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' },
      candidates: [
        { engine: 'oxlint', engineRuleId: 'no-unused-vars', tier: 0 } as never,
        { engine: 'eslint', engineRuleId: '@typescript-eslint/no-unused-vars', tier: 2 } as never,
      ],
      ineligible: [
        { concept: 'dead-code.unused-variable', candidate: { engine: 'eslint', engineRuleId: '@typescript-eslint/no-unused-vars' }, reason: 'engine-not-participating' },
      ],
    }),
  )

  expect(output).toContain('Owner:')
  expect(output).toContain('oxlint/no-unused-vars')
  expect(output).toContain('eslint/@typescript-eslint/no-unused-vars')
  expect(flat(output)).toMatch(/no `eslint` engine is registered in this run/)
  expect(output).toMatch(/produces findings via `oxlint\/no-unused-vars`/i)
})

test('explains a type-aware candidate blocked on a missing capability, citing the M2 blocker', () => {
  const output = capture(
    explanation({
      concept: 'correctness.no-floating-promises',
      uncovered: true,
      candidates: [{ engine: 'oxlint', engineRuleId: 'no-floating-promises', tier: 1 } as never],
      ineligible: [
        {
          concept: 'correctness.no-floating-promises',
          candidate: { engine: 'oxlint', engineRuleId: 'no-floating-promises' },
          reason: 'missing-capability',
          capability: 'types',
        },
      ],
    }),
  )

  expect(output).toMatch(/uncovered/i)
  expect(flat(output)).toContain('type-aware support is not wired up')
  expect(flat(output)).toContain('2026-07-31-m0-followups.md')

  // Measured printing this against a real type-aware concept (`correctness.no-floating-promises`
  // with `rules why`, capability text included): the unwrapped line ran to 228 characters — this
  // reason's explanation must never be handed to the terminal as one raw line the way it used to be.
  const lines = output.split('\n')
  const candidateLine = lines.find((line) => line.includes('oxlint/no-floating-promises'))
  expect(candidateLine).toBeDefined()
  const candidateLineIndex = lines.indexOf(candidateLine!)
  // Collect every subsequent line up to the next blank line (the wrapped continuation of this
  // candidate's explanation, before `writeUnit`'s own unit-separating blank line).
  const continuationLines: string[] = []
  for (let i = candidateLineIndex + 1; i < lines.length && lines[i] !== ''; i++) continuationLines.push(lines[i]!)
  expect(continuationLines.length).toBeGreaterThan(0) // long enough to actually wrap

  // `wrapText`'s own contract (see its doc comment) breaks only at whitespace: a single token wider
  // than the budget — here, the doc path itself, with no internal whitespace to break on — is
  // emitted whole rather than split mid-character. So every line must fit the frame *unless* it is
  // exactly one such unsplittable token, which is what actually happens on the last line below.
  for (const line of [candidateLine!, ...continuationLines]) {
    if (displayWidth(line) <= 80) continue
    expect(line.trim().split(/\s+/), line).toHaveLength(1)
  }

  // Wrapping must not drop, duplicate or reorder words from the underlying explanation text —
  // `ineligibilityText` itself is not exported, so this pins the literal wording `why.ts` builds for
  // this reason rather than reaching into the private helper that produces it.
  const rejoined = [candidateLine!.slice(candidateLine!.indexOf('—')), ...continuationLines]
    .map((line) => line.trim())
    .join(' ')
  expect(rejoined).toBe(
    '— requires type information (`types`), which no participating engine provides yet — type-aware ' +
      'support is not wired up (see "Blocks M2" in docs/superpowers/specs/2026-07-31-m0-followups.md)',
  )
})

test('explains a language mismatch without implying a genuine coverage gap', () => {
  // Reproduces a real bug found running this against the actual registry: the owner section used
  // to print nothing at all for this state (neither the "Owner:" nor the "Uncovered" branch
  // fired), and the closing verdict claimed "no capable engine owns it" — indistinguishable from a
  // real gap. Both are fixed to say plainly that this is not a coverage gap.
  const output = capture(
    explanation({
      concept: 'style.no-var',
      uncovered: false,
      candidates: [{ engine: 'oxlint', engineRuleId: 'vue-rule', tier: 0 } as never],
      ineligible: [{ concept: 'style.no-var', candidate: { engine: 'oxlint', engineRuleId: 'vue-rule' }, reason: 'language-mismatch' }],
    }),
  )
  expect(flat(output)).toMatch(/no files in a language this rule applies to/)
  expect(output).toMatch(/not applicable/i)
  expect(output).not.toMatch(/uncovered/i)
  expect(output).toMatch(/no matching-language files in this repository/i) // the closing verdict

  // The verdict line must actually fit the frame at the default width, unlike the first version of
  // this fix (91 characters against a 78-column budget), which truncated mid-sentence.
  const verdictLine = output.split('\n').find((line) => line.includes('Produces no findings'))
  expect(verdictLine).toBeDefined()
  expect(verdictLine).not.toContain('…')
})

test('reports a concept serviced by slop-gate itself distinctly from an ordinary uncovered concept', () => {
  const output = capture(explanation({ concept: 'config.rule-overlap', servicedBySlopGate: true }))
  expect(output).toMatch(/emitted directly by slop-gate itself/i)
  expect(output).toMatch(/emitted by slop-gate itself/i)
})

test('never puts a wide or fullwidth character in a framed line', () => {
  const busy = explanation({
    concept: 'dead-code.unused-variable',
    owner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' },
    suppressed: [{ concept: 'dead-code.unused-variable', suppressed: { engine: 'eslint', engineRuleId: 'x' }, winner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' }, reason: 'lower-tier' }],
    ineligible: [{ concept: 'dead-code.unused-variable', candidate: { engine: 'eslint', engineRuleId: 'x' }, reason: 'engine-not-participating' }],
  })
  const outputs = [capture(explanation()), capture(busy), capture(explanation({ isKnownConcept: false }))]

  for (const output of outputs) {
    const framedLines = output.split('\n').filter((line) => /^ {2}[│╭╰]/.test(line))
    expect(framedLines.length).toBeGreaterThan(0)
    for (const line of framedLines) expect(hasWideOrFullwidthCharacter(line), line).toBe(false)
  }
})

test('json output is versioned and carries the full explanation', () => {
  let output = ''
  const context: RulesReporterContext = { write: (chunk) => (output += chunk), color: false, unicode: true, width: 80, version: '0.0.0' }
  const result = explanation()
  renderRulesWhyJson(result, context)

  const parsed = JSON.parse(output) as { version: number; concept: string }
  expect(parsed.version).toBe(RULES_WHY_JSON_VERSION)
  expect(parsed.concept).toBe(result.concept)
})
