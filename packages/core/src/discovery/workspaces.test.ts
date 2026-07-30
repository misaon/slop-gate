import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { buildWorkspaceGraph } from './workspaces.ts'

let dir: string

const writePackage = async (relative: string, name: string): Promise<void> => {
  const target = join(dir, relative)
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'package.json'), JSON.stringify({ name }))
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-ws-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('a repo with no workspaces has only the root', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'solo' }))
  const graph = await buildWorkspaceGraph(dir)
  expect(graph.nodes).toEqual([{ name: 'solo', dir: '' }])
})

test('reads pnpm-workspace.yaml', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root' }))
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  await writePackage('packages/app', '@x/app')
  await writePackage('packages/ui', '@x/ui')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.nodes.map((n) => n.dir).sort()).toEqual(['', 'packages/app', 'packages/ui'])
})

test('honours a negated pnpm pattern', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root' }))
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - "!packages/private"\n')
  await writePackage('packages/app', '@x/app')
  await writePackage('packages/private', '@x/private')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.nodes.map((n) => n.dir).sort()).toEqual(['', 'packages/app'])
})

test('reads package.json workspaces', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['apps/*'] }))
  await writePackage('apps/web', '@x/web')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.nodes.map((n) => n.dir).sort()).toEqual(['', 'apps/web'])
})

test('attributes a file to the longest matching workspace', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['packages/*', 'packages/app/plugins/*'] }))
  await writePackage('packages/app', '@x/app')
  await writePackage('packages/app/plugins/auth', '@x/auth')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.attribute('packages/app/plugins/auth/src/a.ts').dir).toBe('packages/app/plugins/auth')
  expect(graph.attribute('packages/app/src/a.ts').dir).toBe('packages/app')
  expect(graph.attribute('scripts/build.ts').dir).toBe('')
})

test('does not attribute a file to a workspace it merely shares a name prefix with', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['packages/*'] }))
  await writePackage('packages/app', '@x/app')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.attribute('packages/app-legacy/src/a.ts').dir).toBe('')
})

test('falls back to the directory name when a package has no name', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }))
  const target = join(dir, 'packages', 'anon')
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'package.json'), '{}')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.nodes.find((n) => n.dir === 'packages/anon')?.name).toBe('anon')
})

test('rejects a malformed pnpm-workspace.yaml instead of silently finding no workspaces', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root' }))
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - "unclosed\n   bad: [')

  await expect(buildWorkspaceGraph(dir)).rejects.toThrow(/pnpm-workspace\.yaml/)
})

test('accepts a pnpm-workspace.yaml that parses but declares no packages', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root' }))
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'onlyBuiltDependencies:\n  - esbuild\n')

  expect((await buildWorkspaceGraph(dir)).nodes).toEqual([{ name: 'root', dir: '' }])
})

test('rejects a workspace pattern that escapes the repository root', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root' }))
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - "../outside/*"\n')
  await writePackage('../outside/leaked', '@x/leaked')

  // The leaked directory is a sibling of `dir`, not nested inside it, so the shared afterEach
  // cannot reach it — clean it up locally regardless of assertion outcome.
  try {
    await expect(buildWorkspaceGraph(dir)).rejects.toThrow(/outside the repository root/)
  } finally {
    await rm(join(dir, '..', 'outside'), { recursive: true, force: true })
  }
})

test('reads the object form of package.json workspaces', async () => {
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'root', workspaces: { packages: ['apps/*'] } }))
  await writePackage('apps/web', '@x/web')

  const graph = await buildWorkspaceGraph(dir)
  expect(graph.nodes.map((n) => n.dir).sort()).toEqual(['', 'apps/web'])
})
