import { expect, test } from 'vitest'
import { electOwners } from './elect.ts'
import type { RuleEntry } from './types.ts'

const entry = (over: Partial<RuleEntry> & Pick<RuleEntry, 'engine' | 'engineRuleId' | 'concepts'>): RuleEntry => ({
  tier: 0,
  priority: 100,
  severityDefault: 'warn',
  fixKind: 'none',
  fixTouches: [],
  requires: [],
  languages: ['ts'],
  docsUrl: 'https://example.test',
  since: '0.1.0',
  ...over,
})

const ALL_LANGUAGES = new Set(['ts' as const])
const NO_CAPABILITIES = new Set<never>()

test('elects the single candidate and selects it for its engine', () => {
  const result = electOwners({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    enabledConcepts: new Set(['correctness.no-debugger']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('correctness.no-debugger')).toEqual({ engine: 'oxlint', engineRuleId: 'no-debugger' })
  expect(result.selection.get('oxlint')).toEqual(new Set(['no-debugger']))
  expect(result.suppressed).toEqual([])
  expect(result.uncovered).toEqual([])
})

test('prefers the lower tier and records why the loser was suppressed', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'eslint', engineRuleId: 'no-unused-vars', concepts: ['dead-code.unused-variable'], tier: 2 }),
      entry({ engine: 'oxlint', engineRuleId: 'no-unused-vars', concepts: ['dead-code.unused-variable'], tier: 0 }),
    ],
    enabledConcepts: new Set(['dead-code.unused-variable']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('dead-code.unused-variable')?.engine).toBe('oxlint')
  expect(result.selection.has('eslint')).toBe(false)
  expect(result.suppressed).toEqual([
    {
      concept: 'dead-code.unused-variable',
      suppressed: { engine: 'eslint', engineRuleId: 'no-unused-vars' },
      winner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' },
      reason: 'lower-tier',
    },
  ])
})

test('breaks a tier tie by engine preference', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'astgrep', engineRuleId: 'a', concepts: ['style.no-var'] }),
      entry({ engine: 'oxlint', engineRuleId: 'b', concepts: ['style.no-var'] }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('style.no-var')?.engine).toBe('oxlint')
  expect(result.suppressed[0]?.reason).toBe('engine-preference')
})

test('breaks a same-engine tie by rule id so elections are total', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'zeta', concepts: ['style.no-var'] }),
      entry({ engine: 'oxlint', engineRuleId: 'alpha', concepts: ['style.no-var'] }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('style.no-var')?.engineRuleId).toBe('alpha')
  expect(result.suppressed[0]?.reason).toBe('rule-id-tiebreak')
})

test('is order-independent: shuffling the entries changes nothing', () => {
  const entries = [
    entry({ engine: 'eslint', engineRuleId: 'x', concepts: ['style.no-var'], tier: 2 }),
    entry({ engine: 'oxlint', engineRuleId: 'y', concepts: ['style.no-var'] }),
    entry({ engine: 'astgrep', engineRuleId: 'z', concepts: ['style.no-var'] }),
  ]
  const forward = electOwners({
    entries,
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })
  const reversed = electOwners({
    entries: [...entries].reverse(),
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(reversed.owners).toEqual(forward.owners)
  expect(reversed.suppressed).toEqual(forward.suppressed)
})

test('excludes candidates whose required capabilities are unavailable', () => {
  const result = electOwners({
    entries: [
      entry({
        engine: 'tsgolint',
        engineRuleId: 'typed',
        concepts: ['slop.as-any-cast'],
        tier: 1,
        requires: ['types'],
      }),
      entry({ engine: 'astgrep', engineRuleId: 'untyped', concepts: ['slop.as-any-cast'] }),
    ],
    enabledConcepts: new Set(['slop.as-any-cast']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('slop.as-any-cast')?.engine).toBe('astgrep')
  expect(result.suppressed).toEqual([])
})

test('admits a capability-requiring candidate once the capability is present', () => {
  const result = electOwners({
    entries: [
      entry({
        engine: 'tsgolint',
        engineRuleId: 'typed',
        concepts: ['slop.as-any-cast'],
        tier: 1,
        requires: ['types'],
      }),
      entry({ engine: 'astgrep', engineRuleId: 'untyped', concepts: ['slop.as-any-cast'], tier: 2 }),
    ],
    enabledConcepts: new Set(['slop.as-any-cast']),
    capabilities: new Set(['types'] as const),
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('slop.as-any-cast')?.engine).toBe('tsgolint')
})

test('excludes candidates whose languages are absent from the repository', () => {
  const result = electOwners({
    entries: [entry({ engine: 'biome-css', engineRuleId: 'css-rule', concepts: ['style.no-var'], languages: ['css'] })],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['ts' as const]),
  })

  expect(result.owners.size).toBe(0)
  expect(result.uncovered).toEqual(['style.no-var'])
})

test('honours a pinned owner even when a faster candidate exists', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['dead-code.unused-variable'] }),
      entry({ engine: 'knip', engineRuleId: 'slow', concepts: ['dead-code.unused-variable'], tier: 2 }),
    ],
    enabledConcepts: new Set(['dead-code.unused-variable']),
    pinnedOwners: { 'dead-code.unused-variable': 'knip' },
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.get('dead-code.unused-variable')?.engine).toBe('knip')
  expect(result.suppressed[0]).toEqual({
    concept: 'dead-code.unused-variable',
    suppressed: { engine: 'oxlint', engineRuleId: 'fast' },
    winner: { engine: 'knip', engineRuleId: 'slow' },
    reason: 'pinned-owner',
  })
})

test('never reports a concept slop-gate services itself as uncovered', () => {
  // `config.rule-overlap`, `config.dead-override` and `config.unused-suppression` are emitted by
  // the orchestrator (packages/core/src/run/check.ts), not by any engine rule — no `RuleEntry` will
  // ever claim them, so without this exclusion every user sees "N enabled concepts have no capable
  // engine" about the tool's own diagnostics on every single run.
  const result = electOwners({
    entries: [],
    enabledConcepts: new Set(['config.rule-overlap', 'config.dead-override', 'config.unused-suppression']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.uncovered).toEqual([])
})

test('reports a concept as uncovered when the pinned engine offers no rule', () => {
  const result = electOwners({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['style.no-var'] })],
    enabledConcepts: new Set(['style.no-var']),
    pinnedOwners: { 'style.no-var': 'eslint' },
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.uncovered).toEqual(['style.no-var'])
  expect(result.owners.size).toBe(0)
})

test('skips deprecated entries', () => {
  const result = electOwners({
    entries: [
      entry({
        engine: 'oxlint',
        engineRuleId: 'old',
        concepts: ['style.no-var'],
        deprecated: { since: '0.2.0' },
      }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.uncovered).toEqual(['style.no-var'])
})

test('enables a rule once even when it wins several concepts', () => {
  const multi = entry({
    engine: 'oxlint',
    engineRuleId: 'no-unused-vars',
    concepts: ['dead-code.unused-variable', 'dead-code.unused-import'],
  })
  const result = electOwners({
    entries: [multi],
    enabledConcepts: new Set(['dead-code.unused-variable', 'dead-code.unused-import']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.selection.get('oxlint')).toEqual(new Set(['no-unused-vars']))
  expect(result.owners.size).toBe(2)
})

test('ignores concepts that are not enabled', () => {
  const result = electOwners({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    enabledConcepts: new Set(),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.owners.size).toBe(0)
  expect(result.selection.size).toBe(0)
  expect(result.uncovered).toEqual([])
})

test('suppression order is independent of entry order in the pinned path', () => {
  const entries = [
    entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['style.no-var'] }),
    entry({ engine: 'astgrep', engineRuleId: 'mid', concepts: ['style.no-var'] }),
    entry({ engine: 'tsc', engineRuleId: 'other', concepts: ['style.no-var'] }),
    entry({ engine: 'knip', engineRuleId: 'slow', concepts: ['style.no-var'], tier: 2 }),
  ]
  const suppressedFor = (list: RuleEntry[]): string[] =>
    electOwners({
      entries: list,
      enabledConcepts: new Set(['style.no-var']),
      pinnedOwners: { 'style.no-var': 'knip' },
      capabilities: NO_CAPABILITIES,
      languages: ALL_LANGUAGES,
    }).suppressed.map((s) => `${s.suppressed.engine}/${s.suppressed.engineRuleId}`)

  expect(suppressedFor([...entries].reverse())).toEqual(suppressedFor(entries))
})

test('labels a pinned suppression only when the pin is what rejected the rule', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['style.no-var'] }),
      entry({ engine: 'knip', engineRuleId: 'zeta', concepts: ['style.no-var'], tier: 2 }),
      entry({ engine: 'knip', engineRuleId: 'alpha', concepts: ['style.no-var'], tier: 2 }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    pinnedOwners: { 'style.no-var': 'knip' },
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })
  const reasonByRule = new Map(result.suppressed.map((s) => [s.suppressed.engineRuleId, s.reason]))

  expect(result.owners.get('style.no-var')?.engineRuleId).toBe('alpha')
  expect(reasonByRule.get('fast')).toBe('pinned-owner')
  expect(reasonByRule.get('zeta')).toBe('rule-id-tiebreak')
})

test('a pin that agrees with arbitration still reports the real reason', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['style.no-var'] }),
      entry({ engine: 'eslint', engineRuleId: 'slow', concepts: ['style.no-var'], tier: 2 }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    pinnedOwners: { 'style.no-var': 'oxlint' },
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.suppressed[0]?.reason).toBe('lower-tier')
})

test('never records the winner as its own loser', () => {
  const duplicated = entry({ engine: 'oxlint', engineRuleId: 'dupe', concepts: ['style.no-var'] })
  const result = electOwners({
    entries: [duplicated, { ...duplicated, languages: ['ts', 'vue'] }],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  expect(result.suppressed).toEqual([])
})

test('orders rule ids by code unit rather than locale collation', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'apple', concepts: ['style.no-var'] }),
      entry({ engine: 'oxlint', engineRuleId: 'Zebra', concepts: ['style.no-var'] }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
  })

  // 'Z' (U+005A) precedes 'a' (U+0061) by code unit; locale collation would invert this.
  expect(result.owners.get('style.no-var')?.engineRuleId).toBe('Zebra')
})
