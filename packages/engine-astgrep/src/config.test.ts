import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { EngineRuleSetting, RunContext } from '@misaon/slop-gate-core'
import { buildAstGrepConfig, materializeAstGrepConfig } from './config.ts'
import { ASTGREP_RULES } from './rules.ts'

let dir: string
let context: RunContext

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-astgrep-config-'))
  context = { rootDir: dir, tmpDir: join(dir, '.slop-gate', 'tmp') }
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('emits one document per declared language, not one per rule', () => {
  const config = buildAstGrepConfig(new Map([['slop-swallowed-error', ['warn'] as const]]))

  expect(config.documents.map((d) => d.language)).toEqual(['TypeScript', 'Tsx', 'JavaScript'])
  expect(config.text.split('\n---\n')).toHaveLength(3)
  expect(config.documents.every((d) => d.engineRuleId === 'slop-swallowed-error')).toBe(true)
})

test('reuses one rule id across every language document', () => {
  const config = buildAstGrepConfig(new Map([['slop-narrative-comment', ['warn'] as const]]))
  const ids = [...config.text.matchAll(/^id: (.+)$/gm)].map((match) => match[1])

  expect(new Set(ids)).toEqual(new Set(['slop-narrative-comment']))
  expect(ids).toHaveLength(3)
})

test('omits a rule set to off', () => {
  const config = buildAstGrepConfig(
    new Map<string, EngineRuleSetting>([
      ['slop-double-cast', ['warn'] as const],
      ['slop-emoji-in-code', ['off'] as const],
    ]),
  )

  expect(config.text).not.toContain('slop-emoji-in-code')
  expect(config.documents.map((d) => d.engineRuleId)).toEqual(['slop-double-cast', 'slop-double-cast'])
})

test('a rule set to off with options is still off', () => {
  const config = buildAstGrepConfig(
    new Map<string, EngineRuleSetting>([
      ['slop-double-cast', ['warn']],
      ['slop-emoji-in-code', ['off', { ignore: [] }]],
    ]),
  )

  expect(config.text).not.toContain('slop-emoji-in-code')
  expect(config.documents.map((document) => document.engineRuleId)).toEqual(['slop-double-cast', 'slop-double-cast'])
})

test('writes the elected level in ast-grep spelling', () => {
  expect(buildAstGrepConfig(new Map([['slop-double-cast', ['warn'] as const]])).text).toContain('severity: warning')
  expect(buildAstGrepConfig(new Map([['slop-double-cast', ['error'] as const]])).text).toContain('severity: error')
  expect(buildAstGrepConfig(new Map([['slop-double-cast', ['info'] as const]])).text).toContain('severity: info')
})

test('throws rather than silently dropping an elected id this package has no rule for', () => {
  expect(() => buildAstGrepConfig(new Map([['slop-invented-rule', ['warn'] as const]]))).toThrow(/slop-invented-rule/)
})

test('produces an empty document set for an empty selection', () => {
  const config = buildAstGrepConfig(new Map())
  expect(config.text).toBe('')
  expect(config.documents).toEqual([])
})

test('produces the same ruleset hash regardless of selection order', async () => {
  const a = await materializeAstGrepConfig(
    new Map<string, EngineRuleSetting>([
      ['slop-double-cast', ['warn'] as const],
      ['slop-emoji-in-code', ['warn'] as const],
    ]),
    context,
  )
  const b = await materializeAstGrepConfig(
    new Map<string, EngineRuleSetting>([
      ['slop-emoji-in-code', ['warn'] as const],
      ['slop-double-cast', ['warn'] as const],
    ]),
    context,
  )

  expect(b.rulesetHash).toBe(a.rulesetHash)
  await a.dispose()
  await b.dispose()
})

test('ruleCount counts documents, which is what --inspect summary reports back', async () => {
  const handle = await materializeAstGrepConfig(
    new Map<string, EngineRuleSetting>([
      ['slop-double-cast', ['warn'] as const],
      ['slop-swallowed-error', ['warn'] as const],
    ]),
    context,
  )

  expect(handle.ruleCount).toBe(5)
  await handle.dispose()
})

test('writes the rule file and removes it on dispose', async () => {
  const handle = await materializeAstGrepConfig(new Map([['slop-double-cast', ['warn'] as const]]), context)

  expect(await readFile(handle.path, 'utf8')).toContain('id: slop-double-cast')
  await handle.dispose()
  await expect(readFile(handle.path, 'utf8')).rejects.toThrow(/ENOENT/)
})

test('escapes a message or note containing an apostrophe', () => {
  const config = buildAstGrepConfig(new Map(ASTGREP_RULES.map((rule) => [rule.engineRuleId, ['warn'] as const])))
  for (const line of config.text.split('\n')) {
    if (!line.startsWith('message: ') && !line.startsWith('note: ')) continue
    const scalar = line.slice(line.indexOf("'"))
    expect(scalar.startsWith("'") && scalar.endsWith("'")).toBe(true)
    expect(scalar.slice(1, -1).replaceAll("''", '')).not.toContain("'")
  }
})
