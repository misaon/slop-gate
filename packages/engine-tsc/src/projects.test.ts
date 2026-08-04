import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { discoverTscProjects } from './projects.ts'

let root: string

const write = async (relative: string, contents: unknown): Promise<string> => {
  const path = join(root, relative)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, typeof contents === 'string' ? contents : JSON.stringify(contents))
  return path
}

const discover = (workspaceDirs: readonly string[] = []) =>
  discoverTscProjects({ rootDir: root, tsconfigPath: join(root, 'tsconfig.json'), workspaceDirs })

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sgate-tsc-projects-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

test('a plain root tsconfig is the only project', async () => {
  const tsconfig = await write('tsconfig.json', { include: ['src'] })

  expect(await discover()).toEqual([tsconfig])
})

test('a solution root resolves to the projects it references, not to itself', async () => {
  await write('tsconfig.json', { files: [], references: [{ path: 'apps/api' }, { path: 'packages/utils' }] })
  const api = await write('apps/api/tsconfig.json', { include: ['src'] })
  const utils = await write('packages/utils/tsconfig.json', { include: ['src'] })

  expect(await discover()).toEqual([api, utils].sort())
})

test('a reference naming the config file directly resolves the same as one naming its directory', async () => {
  await write('tsconfig.json', { files: [], references: [{ path: 'apps/api/tsconfig.json' }] })
  const api = await write('apps/api/tsconfig.json', { include: ['src'] })

  expect(await discover()).toEqual([api])
})

test('references are followed through a nested solution', async () => {
  await write('tsconfig.json', { files: [], references: [{ path: 'apps' }] })
  await write('apps/tsconfig.json', { files: [], references: [{ path: 'api' }] })
  const api = await write('apps/api/tsconfig.json', { include: ['src'] })

  expect(await discover()).toEqual([api])
})

test('a project two solutions both reference is listed once', async () => {
  await write('tsconfig.json', { files: [], references: [{ path: 'a' }, { path: 'b' }] })
  await write('a/tsconfig.json', { files: [], references: [{ path: '../shared' }] })
  await write('b/tsconfig.json', { files: [], references: [{ path: '../shared' }] })
  const shared = await write('shared/tsconfig.json', { include: ['src'] })

  expect(await discover()).toEqual([shared])
})

test('a config that both declares inputs and references others contributes itself and them', async () => {
  const rootConfig = await write('tsconfig.json', { include: ['src'], references: [{ path: 'apps/api' }] })
  const api = await write('apps/api/tsconfig.json', { include: ['src'] })

  expect(await discover()).toEqual([api, rootConfig].sort())
})

test('with no root tsconfig, each workspace package that has one is a project', async () => {
  const api = await write('apps/api/tsconfig.json', { include: ['src'] })
  await write('apps/docs/package.json', { name: 'docs' })

  expect(await discover([join(root, 'apps/api'), join(root, 'apps/docs')])).toEqual([api])
})

test('a root tsconfig that exists suppresses the workspace search, even when it references nothing readable', async () => {
  await write('tsconfig.json', { files: [], references: [{ path: 'apps/gone' }] })
  await write('apps/api/tsconfig.json', { include: ['src'] })

  expect(await discover([join(root, 'apps/api')])).toEqual([])
})

test('nothing to read yields no projects rather than a guess', async () => {
  expect(await discover([join(root, 'apps/api')])).toEqual([])
})

test('comments and trailing commas do not hide the references', async () => {
  await write('tsconfig.json', '{\n  // the real projects\n  "files": [],\n  "references": [{ "path": "apps/api" },]\n}')
  const api = await write('apps/api/tsconfig.json', { include: ['src'] })

  expect(await discover()).toEqual([api])
})
