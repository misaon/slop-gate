import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createWalkFileSource } from '../discovery/inventory.ts'
import type { Engine } from '../engine/types.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import type { RuleEntry } from '../registry/types.ts'
import { resolveRun } from './resolve-run.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-resolve-run-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  await mkdir(join(dir, 'src'), { recursive: true })
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const ENTRIES: RuleEntry[] = [
  {
    engine: 'oxlint',
    engineRuleId: 'no-debugger',
    concepts: ['correctness.no-debugger'],
    tier: 0,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts'],
    docsUrl: 'https://example.test/no-debugger',
    since: '0.1.0',
  },
]

/**
 * `version`, `materializeConfig` and `run` all throw — the actual test. `resolveRun` reads only
 * `.id` and `.capabilities` (see its own doc comment); if it ever starts calling any of these
 * three, every test below fails loudly instead of silently starting to spawn a real engine.
 */
const neverInvokedEngine = (): Engine => ({
  id: 'oxlint',
  capabilities: { languages: ['ts'], granularity: 'file', provides: [], fixes: false },
  version: () => {
    throw new Error('resolveRun must never call engine.version()')
  },
  materializeConfig: () => {
    throw new Error('resolveRun must never call engine.materializeConfig()')
  },
  run: () => {
    throw new Error('resolveRun must never call engine.run()')
  },
})

test('resolves an election and ruleset without ever invoking the engine', async () => {
  const resolved = await resolveRun({
    rootDir: dir,
    config: { rules: { 'correctness.no-debugger': 'error' } } as never,
    entries: ENTRIES,
    engines: [neverInvokedEngine()],
  })

  expect(resolved.election.owners.get('correctness.no-debugger')).toEqual([
    { owner: { engine: 'oxlint', engineRuleId: 'no-debugger' }, languages: ['ts'] },
  ])
  expect(resolved.resolver.anyEnabledConcepts.has('correctness.no-debugger')).toBe(true)
})

test('runs a real discovery pass, so language applicability reflects the actual repository', async () => {
  await mkdir(join(dir, 'styles'), { recursive: true })
  await writeFile(join(dir, 'styles/a.css'), 'a { color: red; }\n')

  const resolved = await resolveRun({
    rootDir: dir,
    config: {},
    entries: ENTRIES,
    fileSource: createWalkFileSource(),
    engines: [neverInvokedEngine()],
  })

  expect(resolved.inventory.files.map((f) => f.path).sort()).toEqual(['package.json', 'src/a.ts', 'styles/a.css'])
  expect(resolved.inventory.languages.has('css')).toBe(true)
  expect(resolved.inventory.languages.has('ts')).toBe(true)
})

test('defaults entries to the shipped registry when none are given', async () => {
  const resolved = await resolveRun({
    rootDir: dir,
    config: {},
    engines: [neverInvokedEngine()],
  })

  expect(resolved.entries).toBe(RULE_ENTRIES)
})

test('excludes a candidate whose engine is absent from the given engines list, matching a real run', async () => {
  // The same registry-level regression `elect.test.ts` and `entries.test.ts` cover directly:
  // reproduced here end-to-end through `resolveRun` because this is the boundary the CLI's `rules`
  // commands actually call, and it must carry the same `participatingEngines` contract through.
  const withOverlap: RuleEntry[] = [
    ...ENTRIES,
    { ...ENTRIES[0]!, engine: 'eslint', engineRuleId: 'no-debugger-eslint', tier: 2 },
  ]

  const resolved = await resolveRun({
    rootDir: dir,
    config: { rules: { 'correctness.no-debugger': 'error' } } as never,
    entries: withOverlap,
    engines: [neverInvokedEngine()],
  })

  expect(resolved.election.owners.get('correctness.no-debugger')?.[0]?.owner.engine).toBe('oxlint')
  expect(resolved.election.suppressed).toEqual([])
})
