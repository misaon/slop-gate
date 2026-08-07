import { expect, test } from 'vitest'
import { createRuleSetResolver } from '../config/resolve.ts'
import type { RuleSetting } from '../config/types.ts'
import type { InventoryFile } from '../discovery/types.ts'
import type { Engine } from '../engine/types.ts'
import { electOwners } from '../registry/elect.ts'
import type { RuleEntry } from '../registry/types.ts'
import { buildPlan } from './plan.ts'

const file = (path: string, language: InventoryFile['language']): InventoryFile => ({
  path,
  language,
  workspace: '',
  size: 1,
  mtimeMs: 1,
})

const fakeEngine = (id: Engine['id'], languages: InventoryFile['language'][]): Engine =>
  ({
    id,
    capabilities: { languages, granularity: 'file', provides: [], fixes: false },
    version: async () => '1.0.0',
    materializeConfig: async () => ({ path: '', rulesetHash: '', dispose: async () => {} }),
    run: () => (async function* () {})(),
  }) satisfies Engine

const entry = (over: Pick<RuleEntry, 'engine' | 'engineRuleId' | 'concepts'> & Partial<RuleEntry>): RuleEntry => ({
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

const planWith = (args: {
  entries: RuleEntry[]
  engines: Engine[]
  files: InventoryFile[]
  rules: Record<string, RuleSetting>
  electAlso?: readonly string[]
}) => {
  const resolver = createRuleSetResolver({ config: { rules: args.rules } })
  const election = electOwners({
    entries: args.entries,
    enabledConcepts: new Set([...resolver.anyEnabledConcepts, ...(args.electAlso ?? [])]),
    capabilities: new Set(),
    languages: new Set(args.files.map((f) => f.language)),
    participatingEngines: new Set(args.engines.map((e) => e.id)),
  })
  return buildPlan({
    engines: args.engines,
    election,
    resolver,
    inventory: {
      root: '/repo',
      files: args.files,
      languages: new Set(args.files.map((f) => f.language)),
      workspaces: [{ name: 'root', dir: '' }],
    },
  })
}

test('assigns a rule to its engine with the resolved level', () => {
  const plan = planWith({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    engines: [fakeEngine('oxlint', ['ts'])],
    files: [file('a.ts', 'ts')],
    rules: { 'correctness.no-debugger': 'error' },
  })

  expect(plan).toHaveLength(1)
  expect(plan[0]?.engineId).toBe('oxlint')
  expect(plan[0]?.selection.get('no-debugger')).toEqual(['error'])
  expect(plan[0]?.files.map((f) => f.path)).toEqual(['a.ts'])
})

test('skips an engine with no elected rules', () => {
  const plan = planWith({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    engines: [fakeEngine('oxlint', ['ts']), fakeEngine('biome-css', ['css'])],
    files: [file('a.ts', 'ts')],
    rules: { 'correctness.no-debugger': 'error' },
  })

  expect(plan.map((p) => p.engineId)).toEqual(['oxlint'])
})

test('gives an engine only files in languages it supports', () => {
  const plan = planWith({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    engines: [fakeEngine('oxlint', ['ts'])],
    files: [file('a.ts', 'ts'), file('b.css', 'css'), file('c.md', 'markdown')],
    rules: { 'correctness.no-debugger': 'error' },
  })

  expect(plan[0]?.files.map((f) => f.path)).toEqual(['a.ts'])
})

test('omits an engine that supports no file in the inventory', () => {
  const plan = planWith({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'r', concepts: ['correctness.no-debugger'] })],
    engines: [fakeEngine('oxlint', ['css'])],
    files: [file('a.ts', 'ts')],
    rules: { 'correctness.no-debugger': 'error' },
  })

  expect(plan).toEqual([])
})

test('configures a multi-concept rule at the strongest resolved level', () => {
  const plan = planWith({
    entries: [
      entry({
        engine: 'oxlint',
        engineRuleId: 'no-unused-vars',
        concepts: ['dead-code.unused-variable', 'dead-code.unused-import'],
        classify: [{ messagePattern: 'import', concept: 'dead-code.unused-import' }],
      }),
    ],
    engines: [fakeEngine('oxlint', ['ts'])],
    files: [file('a.ts', 'ts')],
    rules: { 'dead-code.unused-variable': 'info', 'dead-code.unused-import': 'error' },
  })

  expect(plan[0]?.selection.get('no-unused-vars')).toEqual(['error'])
})

test('carries a rule\'s configured options through to its engine', () => {
  const plan = planWith({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'eqeqeq', concepts: ['pedantic.eqeqeq'] })],
    engines: [fakeEngine('oxlint', ['ts'])],
    files: [file('a.ts', 'ts')],
    rules: { 'pedantic.eqeqeq': ['warn', 'smart'] },
  })

  expect(plan[0]?.selection.get('eqeqeq')).toEqual(['warn', 'smart'])
})

test('gives a rule with no options a setting holding nothing but its level', () => {
  const plan = planWith({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    engines: [fakeEngine('oxlint', ['ts'])],
    files: [file('a.ts', 'ts')],
    rules: { 'correctness.no-debugger': 'error' },
  })

  expect(plan[0]?.selection.get('no-debugger')).toEqual(['error'])
})

test('never puts an off rule in the selection, so no adapter can read one as enabled', () => {
  const plan = planWith({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] }),
      entry({ engine: 'oxlint', engineRuleId: 'eqeqeq', concepts: ['pedantic.eqeqeq'] }),
    ],
    engines: [fakeEngine('oxlint', ['ts'])],
    files: [file('a.ts', 'ts')],
    rules: { 'correctness.no-debugger': 'error', 'pedantic.eqeqeq': ['off', 'smart'] },
    electAlso: ['pedantic.eqeqeq'],
  })

  expect([...(plan[0]?.selection ?? [])]).toEqual([['no-debugger', ['error']]])
})

test('resolves a multi-concept rule\'s options in sorted concept order', () => {
  const entries = [
    entry({
      engine: 'oxlint',
      engineRuleId: 'no-unused-vars',
      concepts: ['dead-code.unused-variable', 'dead-code.unused-import'],
      classify: [{ messagePattern: 'import', concept: 'dead-code.unused-import' }],
    }),
  ]
  const rules = {
    'dead-code.unused-variable': ['warn', { from: 'variable' }],
    'dead-code.unused-import': ['warn', { from: 'import' }],
  } satisfies Record<string, RuleSetting>

  const plan = planWith({ entries, engines: [fakeEngine('oxlint', ['ts'])], files: [file('a.ts', 'ts')], rules })

  expect(plan[0]?.selection.get('no-unused-vars')).toEqual(['warn', { from: 'import' }])
})

test('is deterministic in engine order', () => {
  const entries = [
    entry({ engine: 'oxlint', engineRuleId: 'a', concepts: ['correctness.no-debugger'] }),
    entry({ engine: 'astgrep', engineRuleId: 'b', concepts: ['style.no-var'] }),
  ]
  const engines = [fakeEngine('astgrep', ['ts']), fakeEngine('oxlint', ['ts'])]
  const rules = { 'correctness.no-debugger': 'error', 'style.no-var': 'warn' } as const

  const first = planWith({ entries, engines, files: [file('a.ts', 'ts')], rules })
  const second = planWith({ entries, engines: [...engines].reverse(), files: [file('a.ts', 'ts')], rules })

  expect(second.map((p) => p.engineId)).toEqual(first.map((p) => p.engineId))
})
