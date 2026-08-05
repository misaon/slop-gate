import { execFileSync } from 'node:child_process'
import { existsSync, globSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { compareStrings } from './ordering.ts'

// A stale cross-reference compiles, passes every other test, and is only found by the reader who
// followed it. Nothing else checks these.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SPEC = 'docs/superpowers/specs/2026-07-30-slop-gate-design.md'

// Dot-directories a comment may name that this repository does not track: the one `sgate` creates in
// the repo it analyses, a git internal, and a temp tree a test builds.
const FOREIGN_ROOTS = new Set(['.git', '.nuxt', '.slop-gate', '.test-tmp'])

type Pointer = { readonly at: string; readonly text: string }

function commentLines(source: string): readonly { readonly line: number; readonly text: string }[] {
  const found: { line: number; text: string }[] = []
  let inBlock = false
  source.split('\n').forEach((raw, index) => {
    const trimmed = raw.trim()
    if (inBlock) {
      found.push({ line: index + 1, text: raw })
      if (trimmed.includes('*/')) inBlock = false
      return
    }
    if (trimmed.startsWith('//')) {
      found.push({ line: index + 1, text: raw })
      return
    }
    if (trimmed.startsWith('/*')) {
      found.push({ line: index + 1, text: raw })
      if (!trimmed.includes('*/')) inBlock = true
    }
  })
  return found
}

function scannedFiles(): readonly string[] {
  const sources = globSync('packages/*/src/**/*.ts', { cwd: repoRoot })
  return [...sources, 'vitest.config.ts', 'slop-gate.config.ts'].sort(compareStrings)
}

function pathPointers(): readonly Pointer[] {
  const found: Pointer[] = []
  const shape = /(?<![\w/.@-])(?:docs|packages|fixtures|scripts)\/[A-Za-z0-9._*/{},-]*[A-Za-z0-9_*}]/g
  for (const file of scannedFiles()) {
    for (const { line, text } of commentLines(readFileSync(resolve(repoRoot, file), 'utf8'))) {
      for (const match of text.matchAll(shape)) {
        // Upstream rule documentation supplies most `docs/…` strings and none of it is ours.
        if (/https?:\/\/\S*$/.test(text.slice(0, match.index))) continue
        found.push({ at: `${file}:${line}`, text: match[0] })
      }
    }
  }
  return found
}

// A path may be written relative to the package that mentions it, which is the natural way to write
// it from inside that package.
function resolves(pointer: Pointer): boolean {
  const bases = [repoRoot]
  const owner = /^(packages\/[^/]+)\//.exec(pointer.at)
  if (owner) bases.push(resolve(repoRoot, owner[1] as string))
  else bases.push(...globSync('packages/*/', { cwd: repoRoot }).map((dir) => resolve(repoRoot, dir)))
  for (const base of bases) {
    if (existsSync(resolve(base, pointer.text))) return true
    if (globSync(pointer.text, { cwd: base }).length > 0) return true
  }
  return false
}

test('every repo-relative path in a comment resolves', () => {
  const broken = pathPointers()
    .filter((pointer) => !resolves(pointer))
    .map((pointer) => `${pointer.at} -> ${pointer.text}`)
  expect([...new Set(broken)].sort(compareStrings)).toEqual([])
})

// `existsSync` cannot catch this: a gitignored scratch directory resolves on the machine that wrote
// the comment and on no other clone. Asked of git rather than the filesystem.
test('no comment points into a dot-directory this repository does not track', () => {
  const tracked = new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\0')
      .filter((path) => path !== '')
      .map((path) => path.split('/')[0] as string),
  )
  const shape = /(?<![\w/.@-])(\.[A-Za-z0-9_-]+)\//g

  const broken: string[] = []
  for (const file of scannedFiles()) {
    for (const { line, text } of commentLines(readFileSync(resolve(repoRoot, file), 'utf8'))) {
      for (const match of text.matchAll(shape)) {
        const root = match[1] as string
        if (FOREIGN_ROOTS.has(root) || tracked.has(root)) continue
        broken.push(`${file}:${line} -> ${root}`)
      }
    }
  }

  expect([...new Set(broken)].sort(compareStrings)).toEqual([])
})

test('every section reference inside the design spec resolves to a heading in it', () => {
  const source = readFileSync(resolve(repoRoot, SPEC), 'utf8')
  const ids = (pattern: RegExp): Set<string> =>
    new Set([...source.matchAll(pattern)].flatMap(([, id]) => (id === undefined ? [] : [id])))
  const headings = ids(/^#{2,4}\s+(\d+(?:\.\d+)*)/gm)
  const referenced = ids(/§\s?(\d+(?:\.\d+)*)/g)

  expect([...referenced].filter((id) => !headings.has(id)).sort(compareStrings)).toEqual([])
})

test('every repo-relative link in the README resolves on disk', () => {
  const source = readFileSync(resolve(repoRoot, 'README.md'), 'utf8')
  const targets = [...source.matchAll(/\]\((?!https?:|#)([^)#]+)/g)].flatMap(([, path]) => (path === undefined ? [] : [path]))

  expect(targets.filter((path) => !existsSync(resolve(repoRoot, path))).sort(compareStrings)).toEqual([])
})
