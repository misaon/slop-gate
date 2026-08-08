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
  overlaps: [],
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

const flat = (output: string): string => output.replaceAll(/\s+/g, ' ')

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

  const ownerLine = output.split('\n').find((line) => line.includes('Owner'))
  expect(ownerLine).toMatch(/^\s+\S+\s+Owner: oxlint\/no-unused-vars \(tier 0\)$/)
  expect(output).toContain('eslint/@typescript-eslint/no-unused-vars')
  expect(flat(output)).toMatch(/no `eslint` engine is registered in this run/)
  expect(output).toMatch(/produces findings via `oxlint\/no-unused-vars`/i)
})

test('explains a type-aware candidate blocked on a missing capability, and names what provides it', () => {
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
  expect(flat(output)).toContain('oxlint-tsgolint')
  expect(flat(output)).toContain('type-aware-audit')

  const lines = output.split('\n')
  const candidateLine = lines.find((line) => line.includes('oxlint/no-floating-promises'))
  expect(candidateLine).toBeDefined()
  const candidateLineIndex = lines.indexOf(candidateLine!)
  const continuationLines: string[] = []
  for (let i = candidateLineIndex + 1; i < lines.length && lines[i] !== ''; i++) continuationLines.push(lines[i]!)
  expect(continuationLines.length).toBeGreaterThan(0)

  for (const line of [candidateLine!, ...continuationLines]) {
    if (displayWidth(line) <= 80) continue
    expect(line.trim().split(/\s+/), line).toHaveLength(1)
  }

  const rejoined = [candidateLine!.slice(candidateLine!.indexOf('—')), ...continuationLines]
    .map((line) => line.trim())
    .join(' ')
  expect(rejoined).toBe(
    '— requires type information (`types`). oxlint provides it once `oxlint-tsgolint` is installed — add ' +
      'it as a dev dependency. It is not bundled: it costs 21 MB and takes a run on this repository from ' +
      '3.1 s to 5.9 s (docs/measurements.md#type-aware-audit)',
  )
})

test('explains a language mismatch without implying a genuine coverage gap', () => {
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
  expect(output).toMatch(/no matching-language files in this repository/i)

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
    overlaps: [
      {
        concept: 'dead-code.unused-variable',
        languages: ['ts'],
        loser: { engine: 'eslint', engineRuleId: 'x' },
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
  expect(output).not.toContain('A profile is a default')
})

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
  expect(block).toHaveLength(4)
})

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

test('a long path scope is shortened for display, in the provenance line and the profile line alike', () => {
  const globs = Array.from({ length: 115 }, (_, i) => `packages/p${String(i).padStart(3, '0')}/**`)
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
          overrides: [{ layer: 'framework-override', source: `framework nextjs (${globs.join(', ')})`, setting: 'off' }],
        },
        frameworks: [
          {
            id: 'nextjs',
            summary: 'Next.js',
            reason: 'No `next` dependency in these workspaces.',
            setting: 'off',
            paths: globs,
            evidence: Array.from({ length: 11 }, (_, i) => ({ kind: 'path-present' as const, file: `apps/a${i}/next.config.mjs` })),
          },
        ],
      }),
    ),
  )
  expect(output).toContain('framework nextjs (packages/p000/**, packages/p001/**, packages/p002/**, +112 more)')
  expect(output).toContain('under `packages/p000/**`, `packages/p001/**`, `packages/p002/**`, +112 more')
  expect(output).toContain('and 7 more detection sites')
  expect(output).not.toContain('packages/p114/**')
})

test('a short path scope is printed in full, with no count appended', () => {
  const output = flat(
    capture(
      explanation({
        enablement: {
          enabled: true,
          level: 'error',
          options: [],
          optionsFrom: undefined,
          baseProvenance: [{ layer: 'preset', source: 'recommended', setting: 'error' }],
          overrides: [{ layer: 'framework-override', source: 'framework nextjs (packages/ui/**)', setting: 'off' }],
        },
      }),
    ),
  )
  expect(output).toContain('framework nextjs (packages/ui/**) -> off')
  expect(output).not.toContain('more')
})
