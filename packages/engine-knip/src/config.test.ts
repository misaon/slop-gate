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
  // `not-package.json` and `package.json.bak` both end in text a naive `endsWith` would match. The
  // workspace map is what makes knip treat a directory as its own package, so a wrong entry is not a
  // cosmetic defect — it changes which files knip considers reachable from which entry points.
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
      ['exports', 'warn'],
      ['dependencies', 'error'],
      ['files', 'off'],
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

test("materializeConfig ignores slop-gate's own directory, and its config file when one was found", async () => {
  const withConfig = await materializeKnipConfig(new Map([['files', 'warn']]), context, {
    configFile: 'slop-gate.config.ts',
  })
  expect(await readConfig(withConfig.path)).toMatchObject({ ignore: ['.slop-gate/**', 'slop-gate.config.ts'] })
  await withConfig.dispose()

  const withoutConfig = await materializeKnipConfig(new Map([['files', 'warn']]), context, {})
  expect(await readConfig(withoutConfig.path)).toMatchObject({ ignore: ['.slop-gate/**'] })
  await withoutConfig.dispose()
})

test('rulesetHash is stable for the same selection and changes when the selection does', async () => {
  const a = await materializeKnipConfig(new Map([['exports', 'warn']]), context, {})
  const b = await materializeKnipConfig(new Map([['exports', 'error']]), context, {})
  const c = await materializeKnipConfig(new Map([['exports', 'warn'], ['files', 'warn']]), context, {})

  // Only inclusion is expressible in knip's own config — knip has no per-issue-type severity — so
  // `warn` and `error` must produce the *same* ruleset hash. Anything else would invalidate the whole
  // project cache entry on a level change knip itself cannot act on.
  expect(b.rulesetHash).toBe(a.rulesetHash)
  expect(c.rulesetHash).not.toBe(a.rulesetHash)

  await a.dispose()
  await b.dispose()
  await c.dispose()
})

test('dispose removes the materialised config', async () => {
  const handle = await materializeKnipConfig(new Map([['files', 'warn']]), context, {})
  await expect(stat(handle.path)).resolves.toBeDefined()
  await handle.dispose()
  await expect(stat(handle.path)).rejects.toThrow(/^ENOENT/)
})

test('mergeWorkspacesIntoConfig adds the synthesized map to an already-materialised config in place', async () => {
  const handle = await materializeKnipConfig(new Map([['files', 'warn']]), context, {})

  const merged = await mergeWorkspacesIntoConfig(handle.path, ['.', 'tech-docs'])

  const config = await readConfig(handle.path)
  expect(config['workspaces']).toEqual({ '.': {}, 'tech-docs': {} })
  // The issue-type half materializeConfig wrote must survive the merge untouched, and be handed back
  // so `run()` can check what knip actually reported against what was elected.
  expect(config['include']).toEqual(['files'])
  expect(merged.include).toEqual(['files'])
  await handle.dispose()
})
