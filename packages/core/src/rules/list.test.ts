import { expect, test } from 'vitest'
import { createRuleSetResolver } from '../config/resolve.ts'
import type { SlopGateConfig } from '../config/types.ts'
import { electOwners } from '../registry/elect.ts'
import type { EngineId, RuleEntry } from '../registry/types.ts'
import type { ResolvedRun } from '../run/resolve-run.ts'
import { buildRulesList } from './list.ts'

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

const resolved = (config: SlopGateConfig, entries: RuleEntry[], participatingEngines: EngineId[] = ['oxlint']): ResolvedRun => {
  const resolver = createRuleSetResolver({ config })
  const election = electOwners({
    entries,
    enabledConcepts: resolver.anyEnabledConcepts,
    capabilities: new Set(),
    languages: new Set(['ts' as never]),
    participatingEngines: new Set(participatingEngines),
    pinnedOwners: resolver.base.pinnedOwners,
  })
  return { resolver, election, entries, inventory: { root: '/fixture', files: [], languages: new Set(), workspaces: [] } }
}

const entries: RuleEntry[] = [
  entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] }),
  entry({ engine: 'oxlint', engineRuleId: 'no-unused-vars', concepts: ['dead-code.unused-variable'] }),
  entry({ engine: 'eslint', engineRuleId: 'no-unused-vars', concepts: ['dead-code.unused-variable'], tier: 2 }),
]

const config: SlopGateConfig = {
  rules: { 'correctness.no-debugger': 'error', 'dead-code.unused-variable': 'warn' },
}

test('lists one row per enabled concept, sorted, with its owner and level', () => {
  const rows = buildRulesList(resolved(config, entries, ['oxlint', 'eslint']))

  expect(rows.map((row) => row.concept)).toEqual(['correctness.no-debugger', 'dead-code.unused-variable'])
  expect(rows[0]).toMatchObject({ group: 'correctness', level: 'error', owner: { engine: 'oxlint', engineRuleId: 'no-debugger' } })
  expect(rows[1]).toMatchObject({ suppressedCount: 1, owner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' } })
})

test('does not list a concept no layer enables', () => {
  const rows = buildRulesList(resolved({ rules: { 'correctness.no-debugger': 'error' } }, entries))
  expect(rows.map((row) => row.concept)).toEqual(['correctness.no-debugger'])
})

test('marks a concept with no elected owner as uncovered when no participating engine can serve it', () => {
  const rows = buildRulesList(resolved({ rules: { 'correctness.no-debugger': 'error' } }, entries, ['eslint']))
  expect(rows[0]).toMatchObject({ concept: 'correctness.no-debugger', owner: null, uncovered: true })
})

test('filters by a concept glob via --only', () => {
  const rows = buildRulesList(resolved(config, entries, ['oxlint', 'eslint']), { only: 'dead-code.*' })
  expect(rows.map((row) => row.concept)).toEqual(['dead-code.unused-variable'])
})

test('filters to concepts a specific engine currently owns', () => {
  const rows = buildRulesList(resolved(config, entries, ['oxlint', 'eslint']), { engine: 'eslint' })
  expect(rows).toEqual([])
})

test('filters to uncovered concepts only', () => {
  const requiresTypes = entry({ engine: 'oxlint', engineRuleId: 'typed', concepts: ['slop.as-any-cast'], requires: ['types'] })
  const rows = buildRulesList(
    resolved({ rules: { 'correctness.no-debugger': 'error', 'slop.as-any-cast': 'warn' } }, [...entries, requiresTypes]),
    { uncoveredOnly: true },
  )
  expect(rows.map((row) => row.concept)).toEqual(['slop.as-any-cast'])
})
