import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { buildInventory, createGitFileSource, createWalkFileSource, selectFileSource } from './inventory.ts'

const run = promisify(execFile)
let dir: string

const write = async (relative: string, content = 'export const a = 1\n'): Promise<void> => {
  const target = join(dir, relative)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, content)
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-inv-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('collects files with language and workspace attribution', async () => {
  await write('src/a.ts')
  await write('src/b.css', 'a{}')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const paths = inventory.files.map((f) => f.path).sort()

  expect(paths).toContain('src/a.ts')
  expect(inventory.files.find((f) => f.path === 'src/a.ts')?.language).toBe('ts')
  expect(inventory.files.find((f) => f.path === 'src/b.css')?.language).toBe('css')
  expect(inventory.files.every((f) => f.workspace === '')).toBe(true)
})

test('reports the set of languages present', async () => {
  await write('src/a.ts')
  await write('src/a.vue', '<template />')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  expect(inventory.languages.has('ts')).toBe(true)
  expect(inventory.languages.has('vue')).toBe(true)
  expect(inventory.languages.has('scss')).toBe(false)
})

test('records size and mtime for the cache pre-check', async () => {
  await write('src/a.ts', 'const a = 1\n')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const file = inventory.files.find((f) => f.path === 'src/a.ts')
  expect(file?.size).toBe(12)
  expect(file?.mtimeMs).toBeGreaterThan(0)
})

test('applies ignore patterns', async () => {
  await write('src/a.ts')
  await write('generated/b.ts')

  const inventory = await buildInventory({
    rootDir: dir,
    source: createWalkFileSource(),
    ignore: ['generated/**'],
  })
  expect(inventory.files.map((f) => f.path)).not.toContain('generated/b.ts')
  expect(inventory.files.map((f) => f.path)).toContain('src/a.ts')
})

test('a .slopignore file excludes matching paths', async () => {
  await write('src/a.ts')
  await write('generated/b.ts')
  await write('.slopignore', 'generated/**\n')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  expect(inventory.files.map((f) => f.path)).not.toContain('generated/b.ts')
  expect(inventory.files.map((f) => f.path)).toContain('src/a.ts')
})

test('.slopignore skips blank lines and # comments', async () => {
  await write('src/a.ts')
  await write('generated/b.ts')
  await write('.slopignore', '\n# generated output, not source\ngenerated/**\n\n')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  expect(inventory.files.map((f) => f.path)).not.toContain('generated/b.ts')
  expect(inventory.files.map((f) => f.path)).toContain('src/a.ts')
})

test('.slopignore patterns combine with config ignore rather than replacing it', async () => {
  await write('src/a.ts')
  await write('generated/b.ts')
  await write('vendor/c.ts')
  await write('.slopignore', 'generated/**\n')

  const inventory = await buildInventory({
    rootDir: dir,
    source: createWalkFileSource(),
    ignore: ['vendor/**'],
  })
  const paths = inventory.files.map((f) => f.path)
  expect(paths).not.toContain('generated/b.ts')
  expect(paths).not.toContain('vendor/c.ts')
  expect(paths).toContain('src/a.ts')
})

test('.slopignore lines are glob patterns, not gitignore syntax', async () => {
  // Pins the documented (packages/core/src/discovery/inventory.ts) contract: `.slopignore` is
  // matched by picomatch, so the gitignore idioms a user would naturally reach for from muscle
  // memory — a bare directory name, a trailing slash, a leading slash — match nothing here. Only
  // an explicit `dir/**` glob excludes a directory's contents.
  await write('vendor/a.ts')
  await write('vendor/nested/b.ts')
  await write('keep.md')
  await write('.slopignore', ['vendor', 'vendor/', '/vendor'].join('\n') + '\n')

  const gitignoreStyle = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const gitignoreStylePaths = gitignoreStyle.files.map((f) => f.path)
  expect(gitignoreStylePaths).toContain('vendor/a.ts')
  expect(gitignoreStylePaths).toContain('vendor/nested/b.ts')
  expect(gitignoreStylePaths).toContain('keep.md')

  await write('.slopignore', 'vendor/**\n')
  const globStyle = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const globStylePaths = globStyle.files.map((f) => f.path)
  expect(globStylePaths).not.toContain('vendor/a.ts')
  expect(globStylePaths).not.toContain('vendor/nested/b.ts')
  expect(globStylePaths).toContain('keep.md')
})

test('an unrooted .slopignore glob matches by depth, unlike a gitignore pattern', async () => {
  // gitignore treats a slash-free pattern as matching at any depth (`*.ts` behaves like
  // `**/*.ts`). picomatch does not: `*.ts` only matches a `.ts` file with no directory prefix.
  await write('root.ts')
  await write('src/nested.ts')
  await write('.slopignore', '*.ts\n')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const paths = inventory.files.map((f) => f.path)
  expect(paths).not.toContain('root.ts')
  expect(paths).toContain('src/nested.ts')
})

test('an absent .slopignore changes nothing', async () => {
  await write('src/a.ts')
  await write('generated/b.ts')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const paths = inventory.files.map((f) => f.path)
  expect(paths).toContain('src/a.ts')
  expect(paths).toContain('generated/b.ts')
})

test('the walker skips node_modules and .git without being told to', async () => {
  await write('node_modules/dep/index.js')
  await write('src/a.ts')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  expect(inventory.files.some((f) => f.path.startsWith('node_modules/'))).toBe(false)
})

test('always emits repo-relative POSIX paths', async () => {
  await write('src/nested/deep/a.ts')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  expect(inventory.files.map((f) => f.path)).toContain('src/nested/deep/a.ts')
  expect(inventory.files.every((f) => !f.path.includes('\\'))).toBe(true)
  expect(inventory.files.every((f) => !f.path.startsWith('/'))).toBe(true)
})

test('the git source respects .gitignore and includes untracked files', async () => {
  await run('git', ['init', '-q'], { cwd: dir })
  await run('git', ['config', 'user.email', 't@t.test'], { cwd: dir })
  await run('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await write('.gitignore', 'ignored/\n')
  await write('src/tracked.ts')
  await run('git', ['add', '.'], { cwd: dir })
  await run('git', ['commit', '-qm', 'init'], { cwd: dir })
  await write('src/untracked.ts')
  await write('ignored/hidden.ts')

  const inventory = await buildInventory({ rootDir: dir, source: createGitFileSource() })
  const paths = inventory.files.map((f) => f.path)

  expect(paths).toContain('src/tracked.ts')
  expect(paths).toContain('src/untracked.ts')
  expect(paths).not.toContain('ignored/hidden.ts')
})

test('selects the git source inside a repository and the walker outside one', async () => {
  expect((await selectFileSource(dir)).id).toBe('walk')
  await run('git', ['init', '-q'], { cwd: dir })
  expect((await selectFileSource(dir)).id).toBe('git')
})

test('selects the git source from a subdirectory of a repository', async () => {
  await run('git', ['init', '-q'], { cwd: dir })
  await write('packages/app/src/a.ts')

  expect((await selectFileSource(join(dir, 'packages/app'))).id).toBe('git')
})

test('the git source respects .gitignore when run from a subdirectory', async () => {
  await run('git', ['init', '-q'], { cwd: dir })
  await write('.gitignore', 'packages/app/build/\n')
  await write('packages/app/src/a.ts')
  await write('packages/app/build/out.ts')

  const inventory = await buildInventory({ rootDir: join(dir, 'packages/app') })
  const paths = inventory.files.map((f) => f.path)

  expect(paths).toContain('src/a.ts')
  expect(paths).not.toContain('build/out.ts')
})
