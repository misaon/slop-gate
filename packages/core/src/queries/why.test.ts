import { expect, test } from 'vitest'
import { createRuleSetResolver } from '../config/resolve.ts'
import type { SlopGateConfig } from '../config/types.ts'
import { EMPTY_DETECTION } from '../frameworks/detect.ts'
import { electOwners } from '../registry/elect.ts'
import type { EngineId, RuleEntry } from '../registry/types.ts'
import type { ResolvedRun } from '../run/resolve-run.ts'
import { explainConcept } from './why.ts'

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

const resolved = (
  config: SlopGateConfig,
  entries: RuleEntry[],
  options: { participatingEngines?: EngineId[]; capabilities?: readonly string[]; languages?: readonly string[] } = {},
): ResolvedRun => {
  const resolver = createRuleSetResolver({ config })
  const election = electOwners({
    entries,
    enabledConcepts: resolver.anyEnabledConcepts,
    capabilities: new Set((options.capabilities ?? []) as never[]),
    languages: new Set((options.languages ?? ['ts']) as never[]),
    participatingEngines: new Set(options.participatingEngines ?? ['oxlint']),
    pinnedOwners: resolver.base.pinnedOwners,
  })
  return {
    resolver,
    election,
    entries,
    inventory: { root: '/fixture', files: [], languages: new Set(), workspaces: [] },
    frameworks: EMPTY_DETECTION,
    unavailableEngines: [],
  }
}

test('reports an unknown concept id as such, without throwing', () => {
  const explanation = explainConcept('not.a.real.concept', resolved({}, []))
  expect(explanation.isKnownConcept).toBe(false)
  expect(explanation.enablement.enabled).toBe(false)
  expect(explanation.candidates).toEqual([])
})

test('reports a slop-gate-serviced concept as such, with no candidates and no owner', () => {
  const explanation = explainConcept('config.rule-overlap', resolved({ rules: { 'config.rule-overlap': 'warn' } }, []))
  expect(explanation.isKnownConcept).toBe(true)
  expect(explanation.servicedBySlopGate).toBe(true)
  expect(explanation.candidates).toEqual([])
  expect(explanation.ownership).toEqual([])
  expect(explanation.uncovered).toBe(false)
})

test('reports a concept no layer enables, even when a registry entry could serve it', () => {
  const entries = [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })]
  const explanation = explainConcept('correctness.no-debugger', resolved({}, entries))

  expect(explanation.enablement.enabled).toBe(false)
  expect(explanation.candidates).toHaveLength(1)
  expect(explanation.ownership).toEqual([])
  // Never enabled, so arbitration never ran for it — no owner, no overlap, not ineligible,
  // not uncovered. The whole story is `enablement.enabled === false`.
  expect(explanation.overlaps).toEqual([])
  expect(explanation.ineligible).toEqual([])
  expect(explanation.uncovered).toBe(false)
})

test('reports the owner and an ineligible non-participating candidate — the real eslint/oxlint case', () => {
  // Mirrors the registry's own shipped `dead-code.unused-variable` overlap (entries.uncatalogued.ts):
  // both an oxlint and an eslint entry declare it, only oxlint actually participates in a real run.
  const entries = [
    entry({ engine: 'oxlint', engineRuleId: 'no-unused-vars', concepts: ['dead-code.unused-variable'], tier: 0 }),
    entry({ engine: 'eslint', engineRuleId: '@typescript-eslint/no-unused-vars', concepts: ['dead-code.unused-variable'], tier: 2 }),
  ]
  const explanation = explainConcept(
    'dead-code.unused-variable',
    resolved({ rules: { 'dead-code.unused-variable': 'warn' } }, entries, { participatingEngines: ['oxlint'] }),
  )

  expect(explanation.ownership.map((o) => o.owner)).toEqual([{ engine: 'oxlint', engineRuleId: 'no-unused-vars' }])
  expect(explanation.overlaps).toEqual([])
  expect(explanation.ineligible).toEqual([
    {
      concept: 'dead-code.unused-variable',
      candidate: { engine: 'eslint', engineRuleId: '@typescript-eslint/no-unused-vars' },
      reason: 'engine-not-participating',
    },
  ])
})

test('reports an overlap loser when both engines actually participate', () => {
  const entries = [
    entry({ engine: 'oxlint', engineRuleId: 'no-unused-vars', concepts: ['dead-code.unused-variable'], tier: 0 }),
    entry({ engine: 'eslint', engineRuleId: 'no-unused-vars', concepts: ['dead-code.unused-variable'], tier: 2 }),
  ]
  const explanation = explainConcept(
    'dead-code.unused-variable',
    resolved({ rules: { 'dead-code.unused-variable': 'warn' } }, entries, { participatingEngines: ['oxlint', 'eslint'] }),
  )

  expect(explanation.ownership[0]?.owner.engine).toBe('oxlint')
  expect(explanation.overlaps).toEqual([
    {
      concept: 'dead-code.unused-variable',
      languages: ['ts'],
      loser: { engine: 'eslint', engineRuleId: 'no-unused-vars' },
      winner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' },
      reason: 'lower-tier',
    },
  ])
  expect(explanation.ineligible).toEqual([])
})

test('reports uncovered with a missing-capability reason for a type-aware-only concept', () => {
  const entries = [
    entry({ engine: 'oxlint', engineRuleId: 'no-floating-promises', concepts: ['correctness.no-floating-promises'], requires: ['types'] }),
  ]
  const explanation = explainConcept(
    'correctness.no-floating-promises',
    resolved({ rules: { 'correctness.no-floating-promises': 'warn' } }, entries, { capabilities: [] }),
  )

  expect(explanation.ownership).toEqual([])
  expect(explanation.uncovered).toBe(true)
  expect(explanation.ineligible).toEqual([
    {
      concept: 'correctness.no-floating-promises',
      candidate: { engine: 'oxlint', engineRuleId: 'no-floating-promises' },
      reason: 'missing-capability',
      capability: 'types',
    },
  ])
})

test('reports a language mismatch without marking the concept uncovered', () => {
  const entries = [entry({ engine: 'oxlint', engineRuleId: 'vue-rule', concepts: ['style.no-var'], languages: ['vue'] })]
  const explanation = explainConcept(
    'style.no-var',
    resolved({ rules: { 'style.no-var': 'warn' } }, entries, { languages: ['ts'] }),
  )

  expect(explanation.ownership).toEqual([])
  expect(explanation.uncovered).toBe(false)
  expect(explanation.ineligible).toEqual([
    { concept: 'style.no-var', candidate: { engine: 'oxlint', engineRuleId: 'vue-rule' }, reason: 'language-mismatch' },
  ])
})

test('reports the pinned owner alongside the election outcome', () => {
  const entries = [
    entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['dead-code.unused-variable'] }),
    entry({ engine: 'knip', engineRuleId: 'slow', concepts: ['dead-code.unused-variable'], tier: 2 }),
  ]
  const explanation = explainConcept(
    'dead-code.unused-variable',
    resolved(
      { rules: { 'dead-code.unused-variable': 'warn' }, owners: { 'dead-code.unused-variable': 'knip' } },
      entries,
      { participatingEngines: ['oxlint', 'knip'] },
    ),
  )

  expect(explanation.pinnedOwner).toBe('knip')
  expect(explanation.ownership[0]?.owner.engine).toBe('knip')
})
