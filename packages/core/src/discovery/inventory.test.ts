import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { buildInventory, createGitFileSource, createWalkFileSource, selectFileSource, type FileSource } from './inventory.ts'

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

test('.slopignore lines are real gitignore patterns, not bare globs', async () => {
  await write('vendor/a.ts')
  await write('vendor/nested/b.ts')
  await write('keep.md')
  await write('.slopignore', ['vendor', 'vendor/', '/vendor'].join('\n') + '\n')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const paths = inventory.files.map((f) => f.path)
  expect(paths).not.toContain('vendor/a.ts')
  expect(paths).not.toContain('vendor/nested/b.ts')
  expect(paths).toContain('keep.md')

  await write('.slopignore', 'vendor/**\n')
  const globStyle = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const globStylePaths = globStyle.files.map((f) => f.path)
  expect(globStylePaths).not.toContain('vendor/a.ts')
  expect(globStylePaths).not.toContain('vendor/nested/b.ts')
  expect(globStylePaths).toContain('keep.md')
})

test('an unrooted .slopignore glob matches at every depth, like a gitignore pattern', async () => {
  await write('root.ts')
  await write('src/nested.ts')
  await write('.slopignore', '*.ts\n')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const paths = inventory.files.map((f) => f.path)
  expect(paths).not.toContain('root.ts')
  expect(paths).not.toContain('src/nested.ts')
})

test('.slopignore negation re-includes a path an earlier pattern excluded', async () => {
  await write('src/a.ts')
  await write('src/keep.ts')
  await write('.slopignore', ['src/*.ts', '!src/keep.ts'].join('\n') + '\n')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const paths = inventory.files.map((f) => f.path)
  expect(paths).not.toContain('src/a.ts')
  expect(paths).toContain('src/keep.ts')
})

test('a config ignore pattern without a trailing ** still excludes a directory nested deep beneath it', async () => {
  await write('vendor/deep/nested/file.ts')
  await write('src/a.ts')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource(), ignore: ['vendor'] })
  const paths = inventory.files.map((f) => f.path)
  expect(paths).not.toContain('vendor/deep/nested/file.ts')
  expect(paths).toContain('src/a.ts')
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

test('the walker applies a root .gitignore even outside a git repository', async () => {
  await write('.gitignore', 'dist/\n')
  await write('dist/out.js')
  await write('src/a.ts')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const paths = inventory.files.map((f) => f.path)
  expect(paths).not.toContain('dist/out.js')
  expect(paths).toContain('src/a.ts')
})

test('the walker applies a nested .gitignore scoped to its own directory, not the whole tree', async () => {
  await write('packages/app/.gitignore', 'build/\n')
  await write('packages/app/build/out.js')
  await write('packages/app/src/a.ts')
  await write('other/build/keep.ts')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const paths = inventory.files.map((f) => f.path)
  expect(paths).not.toContain('packages/app/build/out.js')
  expect(paths).toContain('packages/app/src/a.ts')
  expect(paths).toContain('other/build/keep.ts')
})

test('the walker lets a nested .gitignore negate a pattern an ancestor .gitignore excluded', async () => {
  await write('.gitignore', '*.log\n')
  await write('root.log')
  await write('packages/app/.gitignore', '!important.log\n')
  await write('packages/app/debug.log')
  await write('packages/app/important.log')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const paths = inventory.files.map((f) => f.path)
  expect(paths).not.toContain('root.log')
  expect(paths).not.toContain('packages/app/debug.log')
  expect(paths).toContain('packages/app/important.log')
})

test('the walker cannot resurrect a file whose parent directory is itself excluded', async () => {
  await write('.gitignore', 'generated/\n')
  await write('generated/a.ts')
  await write('packages/app/.gitignore', '!generated/keep.ts\n')
  await write('packages/app/generated/a.ts')
  await write('packages/app/generated/keep.ts')

  const inventory = await buildInventory({ rootDir: dir, source: createWalkFileSource() })
  const paths = inventory.files.map((f) => f.path)
  expect(paths).not.toContain('generated/a.ts')
  expect(paths).not.toContain('packages/app/generated/a.ts')
  expect(paths).not.toContain('packages/app/generated/keep.ts')
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

test('the git source excludes .slop-gate/cache even though it is untracked and not gitignored', async () => {
  await run('git', ['init', '-q'], { cwd: dir })
  await run('git', ['config', 'user.email', 't@t.test'], { cwd: dir })
  await run('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await write('src/a.ts')
  await run('git', ['add', '.'], { cwd: dir })
  await run('git', ['commit', '-qm', 'init'], { cwd: dir })
  await write('.slop-gate/cache/results/oxlint/ab/deadbeef.json', '{}')
  await write('.slop-gate/cache/stat-index.json', '{}')

  const inventory = await buildInventory({ rootDir: dir, source: createGitFileSource() })
  const paths = inventory.files.map((f) => f.path)

  expect(paths).toContain('src/a.ts')
  expect(paths.some((p) => p === '.slop-gate' || p.startsWith('.slop-gate/'))).toBe(false)
})

test('buildInventory excludes .slop-gate regardless of which FileSource produced the path list', async () => {
  await write('src/a.ts')
  await write('.slop-gate/cache/results/oxlint/ab/deadbeef.json', '{}')
  const sourceThatIgnoresNothing: FileSource = {
    id: 'walk',
    list: async () => ['src/a.ts', '.slop-gate/cache/results/oxlint/ab/deadbeef.json'],
  }

  const inventory = await buildInventory({ rootDir: dir, source: sourceThatIgnoresNothing })
  expect(inventory.files.map((f) => f.path)).toEqual(['src/a.ts'])
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
