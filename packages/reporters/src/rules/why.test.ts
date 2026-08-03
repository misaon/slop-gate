import type { ConceptWhy } from '@misaon/slop-gate-core'
import { expect, test } from 'vitest'
import { displayWidth, hasWideOrFullwidthCharacter } from '../display-width.ts'
import type { RulesReporterContext } from './context.ts'
import { renderRulesWhyJson, renderRulesWhyPretty, RULES_WHY_JSON_VERSION } from './why.ts'

const explanation = (over: Partial<ConceptWhy> = {}): ConceptWhy => ({
  concept: 'correctness.no-debugger',
  isKnownConcept: true,
  servicedBySlopGate: false,
  enablement: { enabled: true, level: 'error', options: [], optionsFrom: undefined, baseProvenance: [{ layer: 'preset', source: 'recommended', setting: 'error' }], overrides: [] },
  pinnedOwner: undefined,
  candidates: [],
  ownership: [],
  displaced: [],
  suppressed: [],
  ineligible: [],
  uncovered: false,
  frameworks: [],
  rejectedFrameworkAdditions: [],
  inapplicableFrameworks: [],
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
  const output = capture(explanation({ concept: 'not.a.concept', isKnownConcept: false, enablement: { enabled: false, level: 'off', options: [], optionsFrom: undefined, baseProvenance: [], overrides: [] } }))
  expect(output).toMatch(/not a recognised concept/i)
  expect(output).toContain('sgate rules list')
})

test('explains a concept no layer ever enables', () => {
  const output = capture(
    explanation({
      enablement: { enabled: false, level: 'off', options: [], optionsFrom: undefined, baseProvenance: [], overrides: [] },
      candidates: [{ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'], tier: 0, priority: 100, severityDefault: 'error', fixKind: 'none', fixTouches: [], requires: [], languages: ['ts'], docsUrl: 'https://x.test', since: '0.1.0' } as never],
    }),
  )
  expect(output).toMatch(/enabled: no/i)
  expect(output).toMatch(/no preset or config layer ever enables/i)
  expect(output).toContain('oxlint/no-debugger')
  expect(output).toMatch(/produces no findings: not enabled/i)
})

test('names the layer that decided the options, separately from the one that decided the level', () => {
  // The arbitration question options introduce: a preset can settle the options while a config file
  // settles the level, and "what won" has to be answerable for each in one sentence.
  const output = flat(
    capture(
      explanation({
        concept: 'pedantic.eqeqeq',
        enablement: {
          enabled: true,
          level: 'error',
          options: ['smart'],
          optionsFrom: { layer: 'preset', source: 'recommended' },
          baseProvenance: [
            { layer: 'preset', source: 'recommended', setting: ['warn', 'smart'] },
            { layer: 'root-config', source: 'slop-gate.config.ts', setting: 'error' },
          ],
          overrides: [],
        },
      }),
    ),
  )

  expect(output).toContain('enabled at `error` by root config `slop-gate.config.ts`')
  expect(output).toContain('Options: ["smart"] — from preset `recommended`')
  expect(output).toContain('recommended -> warn ["smart"]')
})

test('distinguishes a layer that cleared the options from one that set only a level', () => {
  const output = flat(
    capture(
      explanation({
        enablement: {
          enabled: true,
          level: 'error',
          options: [],
          optionsFrom: { layer: 'root-config', source: 'slop-gate.config.ts' },
          baseProvenance: [
            { layer: 'preset', source: 'recommended', setting: ['warn', 'smart'] },
            { layer: 'root-config', source: 'slop-gate.config.ts', setting: ['error'] },
          ],
          overrides: [],
        },
      }),
    ),
  )

  expect(output).toContain('slop-gate.config.ts -> error (options cleared)')
  expect(output).not.toContain('Options:')
})

test('explains a layer that enabled a concept and a later one that turned it off', () => {
  const output = capture(
    explanation({
      enablement: {
        enabled: false,
        level: 'off',
        options: [],
        optionsFrom: undefined,
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
      ownership: [{ owner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' }, languages: ['ts'] }],
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
    ownership: [{ owner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' }, languages: ['ts'] }],
    suppressed: [
      {
        concept: 'dead-code.unused-variable',
        languages: ['ts'],
        suppressed: { engine: 'eslint', engineRuleId: 'x' },
        winner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' },
        reason: 'lower-tier',
      },
    ],
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

test('names the framework, the evidence file and the reason when a profile turned a concept off', () => {
  const output = flat(
    capture(
      explanation({
        concept: 'suspicious.no-extraneous-class',
        enablement: {
          enabled: false,
          level: 'off',
          options: [],
          optionsFrom: undefined,
          baseProvenance: [
            { layer: 'preset', source: 'recommended', setting: 'warn' },
            { layer: 'framework', source: 'nestjs', setting: 'off' },
          ],
          overrides: [],
        },
        frameworks: [
          {
            id: 'nestjs',
            setting: 'off',
            summary: 'NestJS \u2014 decorator-driven dependency injection',
            reason: 'NestJS requires an empty class body.',
            evidence: [
              { kind: 'manifest-dependency', file: 'package.json', workspace: '', name: '@nestjs/core', field: 'dependencies' },
            ],
          },
        ],
      }),
    ),
  )

  expect(output).toContain('framework nestjs -> off')
  expect(output).toContain('detected via `@nestjs/core` in package.json (dependencies)')
  expect(output).toContain('NestJS requires an empty class body.')
  expect(output).toContain('framework `nestjs` turned it off')
})

const NEXT_EVIDENCE = [
  { kind: 'manifest-dependency', file: 'apps/app-console/package.json', workspace: 'apps/app-console', name: 'next', field: 'dependencies' },
] as const

const nextRaise = {
  id: 'nestjs' as const,
  setting: 'error' as const,
  summary: 'A framework that raises a concept the preset already had on',
  reason: 'A component redefined every render remounts and loses its state, which is a bug here rather than a style.',
  measured: { repository: 'a 145k-line Next.js monorepo', findings: 35, falsePositives: 0 },
  evidence: NEXT_EVIDENCE,
}

/**
 * The additive half of spec \u00a723.2, rendered. Two things have to be legible at a glance and neither
 * was needed while profiles could only subtract: which direction the profile pushed, and the count
 * that entitled it to.
 */
test('a profile that turns a concept on says so, and shows the measurement that earned it', () => {
  const output = flat(
    capture(
      explanation({
        concept: 'suspicious.no-unstable-nested-components',
        enablement: {
          enabled: true,
          level: 'error',
          options: [],
          optionsFrom: undefined,
          baseProvenance: [
            { layer: 'preset', source: 'recommended', setting: 'warn' },
            { layer: 'framework', source: 'nestjs', setting: 'error' },
          ],
          overrides: [],
        },
        frameworks: [nextRaise],
      }),
    ),
  )

  expect(output).toContain('enabled at `error` by framework `nestjs`')
  expect(output).toContain('preset recommended -> warn')
  expect(output).toContain('framework nestjs -> error')
  expect(output).toContain('Framework: nestjs asks for `error`')
  expect(output).toContain('measured on a 145k-line Next.js monorepo: 35 findings, 0 false')
  // No overruling happened, so the precedence line stays out of the way entirely.
  expect(output).not.toContain('A profile is a default')
})

/**
 * The property the task called non-negotiable, as the reader sees it. The provenance table shows the
 * profile asking and the config answering; the one added line names the winner, so nobody has to
 * infer a precedence rule from the order of two rows.
 */
test('a user`s own `off` beats a profile enabling the concept, and the output says which won', () => {
  const output = flat(
    capture(
      explanation({
        concept: 'suspicious.no-unstable-nested-components',
        enablement: {
          enabled: false,
          level: 'off',
          options: [],
          optionsFrom: undefined,
          baseProvenance: [
            { layer: 'framework', source: 'nestjs', setting: 'error' },
            { layer: 'root-config', source: 'slop-gate.config.ts', setting: 'off' },
          ],
          overrides: [],
        },
        frameworks: [nextRaise],
      }),
    ),
  )

  expect(output).toContain('framework `nestjs` enabled this at `error`, but root config `slop-gate.config.ts` turned it off')
  expect(output).toContain('A profile is a default: root config `slop-gate.config.ts` set `off` and beats `nestjs`.')
  // The profile wanted this concept *on*, so attributing the silence to it would name the one party
  // that argued against it.
  expect(output).not.toContain('framework `nestjs` turned it off')
  expect(output).toContain('Produces no findings: not enabled by any layer.')
})

test('an addition refused for want of a measurement names the number that was short', () => {
  const output = flat(
    capture(
      explanation({
        concept: 'suspicious.no-unstable-nested-components',
        enablement: { enabled: false, level: 'off', options: [], optionsFrom: undefined, baseProvenance: [], overrides: [] },
        rejectedFrameworkAdditions: [
          { id: 'nestjs', level: 'error', refusal: 'an addition at `error` fails a build on its own, so it needs a clean measurement' },
        ],
      }),
    ),
  )

  expect(output).toContain('Framework additions refused for want of a measurement')
  expect(output).toContain('nestjs wanted `error` \u2014 an addition at `error` fails a build on its own')
})

test('says which detected profile stood down, and why, rather than staying silent', () => {
  const output = flat(
    capture(
      explanation({
        concept: 'dead-code.unused-file',
        inapplicableFrameworks: [
          {
            id: 'mikro-orm',
            summary: 'MikroORM \u2014 migrations are loaded by the ORM, never imported',
            evidence: [],
            blocked: '`migrations.path` in mikro-orm.config.ts is not a plain string literal',
          },
        ],
      }),
    ),
  )

  expect(output).toContain('Frameworks detected but not applied')
  expect(output).toContain('mikro-orm')
  expect(output).toContain('not a plain string literal')
})

test('an absent better owner is one extra line inside the owners block', () => {
  // The readability bar this has to clear: the split-ownership block is two lines and legible at a
  // glance. Saying "and actionlint would own it if installed" must cost one more line, not a
  // paragraph — if it needs three, the model is too complicated, not the output too small.
  const output = capture(
    explanation({
      concept: 'correctness.parse-error',
      ownership: [
        { owner: { engine: 'oxlint', engineRuleId: 'parse-error' }, languages: ['ts'] },
        { owner: { engine: 'schema', engineRuleId: 'parse-error' }, languages: ['github-workflow'] },
      ],
      displaced: [
        {
          concept: 'correctness.parse-error',
          languages: ['github-workflow'],
          wouldOwn: { engine: 'actionlint', engineRuleId: 'syntax-check' },
          insteadOwnedBy: { engine: 'schema', engineRuleId: 'parse-error' },
        },
      ],
    }),
  )

  const block = output
    .split('\n')
    .filter((line) => /Owners:|\/parse-error|syntax-check/.test(line) && !line.includes('Produces findings'))
  expect(block.some((line) => line.includes('actionlint/syntax-check would own github-workflow — not installed'))).toBe(
    true,
  )
  // One header, two owners, one displaced note. Four lines for the whole ownership story.
  expect(block).toHaveLength(4)
})

/**
 * The path-scoped case, which has to read differently from the repository-wide one in two places: the
 * profile line has to say *where*, and the "a profile is a default" note must not fire. That note
 * compares the profile's level against `maxLevelOf` — the strongest level anywhere in the repository —
 * and a profile that only ever claimed its own globs was not overruled by a level outside them.
 */
test('a path-scoped framework level names its globs and is not reported as overruled', () => {
  const output = flat(
    capture(
      explanation({
        concept: 'correctness.no-img-element',
        enablement: {
          enabled: true,
          level: 'error',
          options: [],
          optionsFrom: undefined,
          baseProvenance: [{ layer: 'preset', source: 'recommended', setting: 'error' }],
          overrides: [
            {
              layer: 'framework-override',
              source: 'framework nextjs (packages/emails/**, packages/ui/**)',
              setting: 'off',
            },
          ],
        },
        frameworks: [
          {
            id: 'nextjs',
            summary: 'Next.js — scoped to the applications it describes',
            reason: 'These workspaces declare no `next` dependency.',
            setting: 'off',
            paths: ['packages/emails/**', 'packages/ui/**'],
            evidence: [
              { kind: 'manifest-dependency', file: 'apps/web/package.json', workspace: 'apps/web', name: 'next', field: 'dependencies' },
            ],
          },
        ],
      }),
    ),
  )
  expect(output).toContain('path-scoped framework framework nextjs (packages/emails/**, packages/ui/**) -> off')
  expect(output).toContain('nextjs turns this off under `packages/emails/**`, `packages/ui/**`')
  expect(output).not.toContain('A profile is a default')
})
