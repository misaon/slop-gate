import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { InventoryFile, RunContext } from '@misaon/slop-gate-core'
import { materializeKnipConfig, mergeWorkspacesIntoConfig, synthesizeKnipWorkspaces } from './config.ts'
import { KNIP_ISSUE_TYPES } from './issue-types.ts'

let dir: string
let context: RunContext

const file = (path: string): InventoryFile => ({
  path,
  language: path.endsWith('.json') ? 'json' : 'ts',
  workspace: '',
  size: 0,
  mtimeMs: 0,
})

const readConfig = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-knip-config-'))
  context = { rootDir: dir, tmpDir: join(dir, '.slop-gate', 'tmp') }
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('synthesizes one workspace per nested package.json the inventory contains', () => {
  const workspaces = synthesizeKnipWorkspaces([
    file('package.json'),
    file('src/main.ts'),
    file('tech-docs/package.json'),
    file('packages/core/package.json'),
  ])

  expect(workspaces).toEqual(['.', 'packages/core', 'tech-docs'])
})

test('always includes the root workspace even when the inventory has no root package.json', () => {
  expect(synthesizeKnipWorkspaces([file('apps/api/package.json')])).toEqual(['.', 'apps/api'])
})

test('ignores a file merely named like a manifest rather than being one', () => {
  expect(synthesizeKnipWorkspaces([file('lib/not-package.json'), file('lib/package.json.bak')])).toEqual(['.'])
})

test('deduplicates and sorts with compareStrings so the same inventory always yields the same config', () => {
  const a = synthesizeKnipWorkspaces([file('b/package.json'), file('a/package.json'), file('b/package.json')])
  const b = synthesizeKnipWorkspaces([file('a/package.json'), file('b/package.json')])
  expect(a).toEqual(b)
  expect(a).toEqual(['.', 'a', 'b'])
})

test('materializeConfig writes only the elected issue types into include, and every other one into exclude', async () => {
  const handle = await materializeKnipConfig(
    new Map([
      ['exports', ['warn'] as const],
      ['dependencies', ['error'] as const],
      ['files', ['off'] as const],
    ]),
    context,
    {},
  )

  const config = await readConfig(handle.path)
  expect(config['include']).toEqual(['dependencies', 'exports'])
  expect(config['exclude']).toEqual(KNIP_ISSUE_TYPES.filter((t) => t !== 'dependencies' && t !== 'exports').toSorted())
  expect(handle.ruleCount).toBe(2)

  await handle.dispose()
})

test('materializeConfig keeps an issue type set to off out of include even when it carries options', async () => {
  const handle = await materializeKnipConfig(
    new Map([
      ['exports', ['warn'] as const],
      ['files', ['off', { probe: true }] as const],
    ]),
    context,
    {},
  )

  const config = await readConfig(handle.path)
  expect(config['include']).toEqual(['exports'])
  expect(config['exclude']).toContain('files')
  expect(handle.ruleCount).toBe(1)

  await handle.dispose()
})

test("materializeConfig ignores slop-gate's own directory, and its config file when one was found", async () => {
  const withConfig = await materializeKnipConfig(new Map([['files', ['warn'] as const]]), context, {
    configFile: 'slop-gate.config.ts',
  })
  expect(await readConfig(withConfig.path)).toMatchObject({ ignore: ['.slop-gate/**', 'slop-gate.config.ts'] })
  await withConfig.dispose()

  const withoutConfig = await materializeKnipConfig(new Map([['files', ['warn'] as const]]), context, {})
  expect(await readConfig(withoutConfig.path)).toMatchObject({ ignore: ['.slop-gate/**'] })
  await withoutConfig.dispose()
})

test('rulesetHash is stable for the same selection and changes when the selection does', async () => {
  const a = await materializeKnipConfig(new Map([['exports', ['warn'] as const]]), context, {})
  const b = await materializeKnipConfig(new Map([['exports', ['error'] as const]]), context, {})
  const c = await materializeKnipConfig(new Map([['exports', ['warn'] as const], ['files', ['warn'] as const]]), context, {})

  expect(b.rulesetHash).toBe(a.rulesetHash)
  expect(c.rulesetHash).not.toBe(a.rulesetHash)

  await a.dispose()
  await b.dispose()
  await c.dispose()
})

test('dispose removes the materialised config', async () => {
  const handle = await materializeKnipConfig(new Map([['files', ['warn'] as const]]), context, {})
  await expect(stat(handle.path)).resolves.toBeDefined()
  await handle.dispose()
  await expect(stat(handle.path)).rejects.toThrow(/^ENOENT/)
})

test('mergeWorkspacesIntoConfig adds the synthesized map to an already-materialised config in place', async () => {
  const handle = await materializeKnipConfig(new Map([['files', ['warn'] as const]]), context, {})

  const merged = await mergeWorkspacesIntoConfig(handle.path, ['.', 'tech-docs'])

  const config = await readConfig(handle.path)
  expect(config['workspaces']).toEqual({ '.': {}, 'tech-docs': {} })
  expect(config['include']).toEqual(['files'])
  expect(merged.include).toEqual(['files'])
  await handle.dispose()
})

test("materializeConfig passes the user's own ignore patterns through to knip", async () => {
  const handle = await materializeKnipConfig(new Map([['files', ['warn'] as const]]), context, {
    configFile: 'slop-gate.config.ts',
    ignore: ['fixtures/**', 'packages/*/fixtures/**'],
  })

  expect(await readConfig(handle.path)).toMatchObject({
    ignore: ['.slop-gate/**', 'fixtures/**', 'packages/*/fixtures/**', 'slop-gate.config.ts'],
  })
  await handle.dispose()
})

test('user ignore patterns are deduplicated and sorted, so an equivalent config hashes the same', async () => {
  const a = await materializeKnipConfig(new Map([['files', ['warn'] as const]]), context, {
    ignore: ['b/**', 'a/**', 'b/**'],
  })
  const b = await materializeKnipConfig(new Map([['files', ['warn'] as const]]), context, { ignore: ['a/**', 'b/**'] })

  expect(a.rulesetHash).toBe(b.rulesetHash)
  expect(await readConfig(a.path)).toMatchObject({ ignore: ['.slop-gate/**', 'a/**', 'b/**'] })
  await a.dispose()
  await b.dispose()
})
