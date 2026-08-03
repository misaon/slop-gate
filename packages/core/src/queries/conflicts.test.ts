import { expect, test } from 'vitest'
import { createRuleSetResolver } from '../config/resolve.ts'
import { EMPTY_DETECTION } from '../frameworks/detect.ts'
import { electOwners } from '../registry/elect.ts'
import type { RuleEntry } from '../registry/types.ts'
import type { ResolvedRun } from '../run/resolve-run.ts'
import { buildRulesConflicts } from './conflicts.ts'

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

test('surfaces both a rule overlap and a dead override from an already-resolved run', () => {
  const entries = [
    entry({ engine: 'oxlint', engineRuleId: 'no-unused-vars', concepts: ['dead-code.unused-variable'], tier: 0 }),
    entry({ engine: 'eslint', engineRuleId: 'no-unused-vars', concepts: ['dead-code.unused-variable'], tier: 2 }),
  ]
  const resolver = createRuleSetResolver({
    config: { rules: { 'dead-code.unused-variable': 'warn', 'oxlint/no-such-rule': 'error' } },
  })
  const election = electOwners({
    entries,
    enabledConcepts: resolver.anyEnabledConcepts,
    capabilities: new Set(),
    languages: new Set(['ts' as never]),
    participatingEngines: new Set(['oxlint', 'eslint']),
    pinnedOwners: resolver.base.pinnedOwners,
  })
  const resolved: ResolvedRun = {
    resolver,
    election,
    entries,
    inventory: { root: '/fixture', files: [], languages: new Set(), workspaces: [] },
    frameworks: EMPTY_DETECTION,
    unavailableEngines: [],
  }

  const conflicts = buildRulesConflicts(resolved)

  expect(conflicts.overlaps).toEqual([
    {
      concept: 'dead-code.unused-variable',
      languages: ['ts'],
      loser: { engine: 'eslint', engineRuleId: 'no-unused-vars' },
      winner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' },
      reason: 'lower-tier',
    },
  ])
  expect(conflicts.deadOverrides).toEqual(['oxlint/no-such-rule'])
})

test('reports both as empty on a run with no overlaps and no dead overrides', () => {
  const resolver = createRuleSetResolver({ config: {} })
  const election = electOwners({
    entries: [],
    enabledConcepts: resolver.anyEnabledConcepts,
    capabilities: new Set(),
    languages: new Set(),
    participatingEngines: new Set(),
    pinnedOwners: resolver.base.pinnedOwners,
  })
  const resolved: ResolvedRun = {
    resolver,
    election,
    entries: [],
    inventory: { root: '/fixture', files: [], languages: new Set(), workspaces: [] },
    frameworks: EMPTY_DETECTION,
    unavailableEngines: [],
  }

  const conflicts = buildRulesConflicts(resolved)
  expect(conflicts.overlaps).toEqual([])
  expect(conflicts.deadOverrides).toEqual([])
})
