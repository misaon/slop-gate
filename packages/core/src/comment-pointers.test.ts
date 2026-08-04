import { execFileSync } from 'node:child_process'
import { existsSync, globSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { compareStrings } from './ordering.ts'

/**
 * Comments here carry cross-references — `§13.1` into the design spec, and repo-relative paths to
 * files that hold the other half of an explanation. Nothing else checks them, and nothing else can:
 * a stale pointer compiles, passes every test, and is only discovered by the reader who followed it
 * and found nothing. Renaming a spec section or moving a file is enough to break dozens at once.
 *
 * This is the only guard, so it deliberately covers test files too, and resolves against the real
 * filesystem rather than a fixture.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SPEC = 'docs/superpowers/specs/2026-07-30-slop-gate-design.md'

/**
 * Paths that describe *a user's* repository, not ours: illustrative layouts in prose and fixture
 * trees built in memory. They are supposed not to exist. Listed rather than pattern-matched because
 * no syntax distinguishes them from a real pointer — `packages/ui/**` and `packages/core/src` are
 * written identically — so the decision has to be made once, by hand, per path.
 */
const ILLUSTRATIVE = new Set([
  'docs/.vitepress',
  'docs/package.json',
  'packages/../../shared/*',
  'packages/admin/admin-bundler',
  'packages/admin/dashboard',
  'packages/app',
  'packages/app/generated/keep.ts',
  'packages/emails',
  'packages/ui/**',
])

/**
 * Dot-directory roots a comment may name that are not part of this repository: the directory `sgate`
 * creates in the repo it analyses, a git internal, a temp tree a test builds, a user's docs tooling,
 * and `.json` as prose about a file extension. `.github` needs no entry — this repo tracks one.
 */
const FOREIGN_ROOTS = new Set(['.git', '.json', '.slop-gate', '.test-tmp', '.vitepress'])

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

/**
 * Every spec-section reference mentioned in a comment, with where it was mentioned.
 *
 * `spec 5.3` and `section 7` are matched as well as `§5.3`, because both spellings are in use and a
 * reference that escapes the check is exactly the one that rots unnoticed.
 */
function sectionPointers(): readonly Pointer[] {
  const found: Pointer[] = []
  const shapes = [/§\s?(\d+(?:\.\d+)*)/g, /\b(?:spec|section)\s+(\d+(?:\.\d+)*)/gi]
  for (const file of scannedFiles()) {
    for (const { line, text } of commentLines(readFileSync(resolve(repoRoot, file), 'utf8'))) {
      for (const shape of shapes) {
        for (const match of text.matchAll(shape)) found.push({ at: `${file}:${line}`, text: match[1] as string })
      }
    }
  }
  return found
}

/**
 * Every repo-relative path mentioned in a comment. The four roots are the only ones comments point
 * at; a bare `src/...` is excluded because it is ambiguous between eleven packages.
 *
 * URLs are skipped by looking left for a scheme — upstream rule documentation supplies most of the
 * `docs` paths in this repository (`.../actionlint/blob/v1.7.12/docs/checks.md`) and none of it is ours.
 *
 * A match may not *end* in `.`, which drops both the sentence-final period a path picks up in prose
 * and an elided path written with an ellipsis.
 */
function pathPointers(): readonly Pointer[] {
  const found: Pointer[] = []
  const shape = /(?<![\w/.@-])(?:docs|packages|fixtures|scripts)\/[A-Za-z0-9._*/{},-]*[A-Za-z0-9_*}]/g
  for (const file of scannedFiles()) {
    for (const { line, text } of commentLines(readFileSync(resolve(repoRoot, file), 'utf8'))) {
      for (const match of text.matchAll(shape)) {
        if (/https?:\/\/\S*$/.test(text.slice(0, match.index))) continue
        found.push({ at: `${file}:${line}`, text: match[0] })
      }
    }
  }
  return found
}

/**
 * A path resolves if it exists, matches something as a glob, or exists relative to the package that
 * mentions it — `packages/core/src/concepts/catalogue.ts` says `scripts/generate-registry.ts` and
 * means its own package's, which is the natural way to write it from inside that package.
 *
 * A root-level config file belongs to no package and talks about all of them, so it gets every
 * package root as a fallback.
 */
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

test('every §-section reference in a comment names a section the design spec has', () => {
  const sections = new Set<string>()
  for (const heading of readFileSync(resolve(repoRoot, SPEC), 'utf8').matchAll(/^#{2,4}\s+(\d+(?:\.\d+)*)\.?\s/gm)) {
    sections.add(heading[1] as string)
  }
  expect(sections.size).toBeGreaterThan(20)

  const pointers = sectionPointers()
  expect(pointers.length).toBeGreaterThan(100)

  const broken = pointers.filter((pointer) => !sections.has(pointer.text)).map((pointer) => `${pointer.at} -> §${pointer.text}`)
  expect(broken).toEqual([])
})

test('every repo-relative path in a comment resolves, or is a declared illustration', () => {
  const pointers = pathPointers()
  expect(pointers.length).toBeGreaterThan(60)

  const broken = pointers
    .filter((pointer) => !ILLUSTRATIVE.has(pointer.text) && !resolves(pointer))
    .map((pointer) => `${pointer.at} -> ${pointer.text}`)
  expect([...new Set(broken)].sort(compareStrings)).toEqual([])
})

/**
 * `existsSync` cannot catch this class of pointer, so the check above cannot either: a gitignored
 * scratch directory resolves on the machine that wrote the comment and on no other clone, which reads
 * as a valid pointer here and as nothing anywhere else. Asked of git rather than the filesystem, so
 * the answer is the same on every checkout.
 */
test('no comment points into a dot-directory this repository does not track', () => {
  const tracked = new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\0')
      .filter((path) => path !== '')
      .map((path) => path.split('/')[0] as string),
  )
  const shape = /(?<![\w/.@-])(\.[A-Za-z0-9_-]+)\//g

  const mentioned = new Set<string>()
  const broken: string[] = []
  for (const file of scannedFiles()) {
    for (const { line, text } of commentLines(readFileSync(resolve(repoRoot, file), 'utf8'))) {
      for (const match of text.matchAll(shape)) {
        const root = match[1] as string
        mentioned.add(root)
        if (FOREIGN_ROOTS.has(root) || tracked.has(root)) continue
        broken.push(`${file}:${line} -> ${root}`)
      }
    }
  }

  expect([...new Set(broken)].sort(compareStrings)).toEqual([])
  expect([...FOREIGN_ROOTS].filter((root) => !mentioned.has(root)).sort(compareStrings)).toEqual([])
})

test('no illustration is listed that no comment mentions any more', () => {
  // Without this the list is write-only: an entry outlives the comment it excused, and the next real
  // pointer that happens to reuse the path is waved through.
  const mentioned = new Set(pathPointers().map((pointer) => pointer.text))
  const stale = [...ILLUSTRATIVE].filter((path) => !mentioned.has(path)).sort(compareStrings)
  expect(stale).toEqual([])
})

/**
 * The same rot, one level up: the spec cross-references its own sections ~48 times and the README links
 * into the spec. Renaming a heading breaks both silently, and both are the first thing a new reader opens.
 */
test('every section reference inside the design spec resolves to a heading in it', () => {
  const source = readFileSync(resolve(repoRoot, SPEC), 'utf8')
  const ids = (pattern: RegExp): Set<string> =>
    new Set([...source.matchAll(pattern)].flatMap(([, id]) => (id === undefined ? [] : [id])))
  const headings = ids(/^#{2,4}\s+(\d+(?:\.\d+)*)/gm)
  const referenced = ids(/§\s?(\d+(?:\.\d+)*)/g)

  const broken = [...referenced].filter((id) => !headings.has(id)).sort(compareStrings)

  expect(broken).toEqual([])
})

test('every repo-relative link in the README resolves on disk', () => {
  const source = readFileSync(resolve(repoRoot, 'README.md'), 'utf8')
  const targets = [...source.matchAll(/\]\((?!https?:|#)([^)#]+)/g)].flatMap(([, path]) => (path === undefined ? [] : [path]))

  const missing = targets.filter((path) => !existsSync(resolve(repoRoot, path))).sort(compareStrings)

  expect(missing).toEqual([])
})
