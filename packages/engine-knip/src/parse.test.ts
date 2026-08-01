import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { RawDiagnostic } from '@misaon/slop-gate-core'
import { parseKnipOutput } from './parse.ts'

let dir: string

const collect = async (iterable: AsyncIterable<RawDiagnostic>): Promise<RawDiagnostic[]> => {
  const out: RawDiagnostic[] = []
  for await (const item of iterable) out.push(item)
  return out
}

/** Every row knip's JSON reporter emits carries a key per *reported* issue type, empty or not. */
const row = (file: string, issues: Record<string, unknown>): Record<string, unknown> => ({ file, ...issues })

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-knip-parse-'))
  await mkdir(join(dir, 'src'), { recursive: true })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('throws rather than silently reporting nothing when knip produced no output', async () => {
  await expect(collect(parseKnipOutput('', dir))).rejects.toThrow(/no output/)
  await expect(collect(parseKnipOutput('   \n', dir))).rejects.toThrow(/no output/)
})

test('throws on output that is not json, and on json with no issues array', async () => {
  await expect(collect(parseKnipOutput('ERROR: Unable to find package.json', dir))).rejects.toThrow(/no json output/)
  await expect(collect(parseKnipOutput('{"nope":1}', dir))).rejects.toThrow(/no issues array/)
  await expect(collect(parseKnipOutput('{"issues":[', dir))).rejects.toThrow(/could not parse/)
})

test('yields nothing for a clean repository', async () => {
  expect(await collect(parseKnipOutput('{"issues":[]}', dir))).toEqual([])
})

test('an unused file becomes a whole-file diagnostic at offset zero', async () => {
  await writeFile(join(dir, 'src/dead.ts'), 'export const dead = 1\n')
  const stdout = JSON.stringify({ issues: [row('src/dead.ts', { files: [{ name: 'src/dead.ts' }] })] })

  const found = await collect(parseKnipOutput(stdout, dir))

  expect(found).toEqual([
    {
      engineRuleId: 'files',
      message: 'Unused file: not reachable from any entry point.',
      severity: 'warning',
      file: 'src/dead.ts',
      range: { start: 0, end: 0 },
    },
  ])
})

test('an unlisted binary has no position either, and is attributed to package.json', async () => {
  await writeFile(join(dir, 'package.json'), '{"name":"x","scripts":{"build":"nest build"}}\n')
  const stdout = JSON.stringify({ issues: [row('package.json', { binaries: [{ name: 'nest' }] })] })

  const [found] = await collect(parseKnipOutput(stdout, dir))

  expect(found?.engineRuleId).toBe('binaries')
  expect(found?.file).toBe('package.json')
  expect(found?.range).toEqual({ start: 0, end: 0 })
  expect(found?.message).toContain('`nest`')
})

test("converts knip's UTF-16 line/column into a byte range, one character wide", async () => {
  // The discriminating case: an astral-plane emoji (2 UTF-16 units, 4 bytes) plus three two-byte
  // characters ahead of the reported symbol, so UTF-16, byte and codepoint columns all differ.
  // Captured from the real binary against exactly this line: knip reported col 43, where the UTF-16
  // column is 43, the byte column 49 and the codepoint column 42.
  const source = 'const emoji = "\u{1F680}žluťoučký"; export const afterWide = emoji\n'
  await writeFile(join(dir, 'src/wide.ts'), source)
  const stdout = JSON.stringify({
    issues: [row('src/wide.ts', { exports: [{ name: 'afterWide', line: 1, col: 43, pos: 42 }] })],
  })

  const [found] = await collect(parseKnipOutput(stdout, dir))

  const byteOffset = Buffer.byteLength(source.slice(0, source.indexOf('afterWide')), 'utf8')
  expect(byteOffset).toBe(48)
  expect(found?.range).toEqual({ start: byteOffset, end: byteOffset + 1 })
})

test('the same logical finding reported against three files stays three diagnostics', async () => {
  // The measured `express` case (spec §13.2): knip emits an unlisted dependency once per referencing
  // file. Collapsing them would have to pick one file arbitrarily and would break per-line inline
  // suppression at the other two sites — see parse.ts's module doc comment.
  for (const name of ['a', 'b', 'c']) {
    await writeFile(join(dir, `src/${name}.ts`), "import type { Request } from 'express'\nexport type R = Request\n")
  }
  const stdout = JSON.stringify({
    issues: ['a', 'b', 'c'].map((name) =>
      row(`src/${name}.ts`, { unlisted: [{ name: 'express', line: 1, col: 30, pos: 29 }] }),
    ),
  })

  const found = await collect(parseKnipOutput(stdout, dir))

  expect(found).toHaveLength(3)
  expect(found.map((diagnostic) => diagnostic.file)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts'])
  expect(new Set(found.map((diagnostic) => diagnostic.message)).size).toBe(1)
})

test('a duplicates group is flattened into one diagnostic per duplicated symbol', async () => {
  // `duplicates` and `cycles` are the only two types knip emits as arrays *of arrays*, one inner
  // array per group. Captured verbatim from the real binary against this exact source.
  const source = 'export function duped(): number {\n  return 1\n}\nexport default duped\n'
  await writeFile(join(dir, 'src/dupes.ts'), source)
  const stdout = JSON.stringify({
    issues: [
      row('src/dupes.ts', {
        duplicates: [
          [
            { name: 'duped', line: 1, col: 17, pos: 16 },
            { name: 'default', line: 4, col: 16, pos: 60 },
          ],
        ],
      }),
    ],
  })

  const found = await collect(parseKnipOutput(stdout, dir))

  expect(found.map((diagnostic) => diagnostic.message)).toEqual([
    'Duplicate export `duped`.',
    'Duplicate export `default`.',
  ])
  expect(found[0]?.range.start).toBe(source.indexOf('duped'))
})

test("an unused enum member is qualified with knip's parent symbol", async () => {
  await writeFile(join(dir, 'src/e.ts'), 'export enum Colour {\n  Red = 1,\n  Blue = 2,\n}\n')
  const stdout = JSON.stringify({
    issues: [row('src/e.ts', { enumMembers: [{ name: 'Blue', namespace: 'Colour', line: 3, col: 3, pos: 33 }] })],
  })

  const [found] = await collect(parseKnipOutput(stdout, dir))

  expect(found?.message).toBe('Unused exported enum member `Colour.Blue`.')
})

test('never yields a diagnostic for an excluded issue type, even when knip reports one', async () => {
  await writeFile(join(dir, 'src/n.ts'), 'export namespace N {\n  export const a = 1\n}\n')
  const stdout = JSON.stringify({
    issues: [
      row('src/n.ts', {
        nsExports: [{ name: 'a', line: 2, col: 16, pos: 36 }],
        namespaceMembers: [{ name: 'a', namespace: 'N', line: 2, col: 16, pos: 36 }],
        cycles: [[{ name: 'src/n.ts' }]],
        optionalPeerDependencies: [{ name: 'react', line: 1, col: 1, pos: 0 }],
      }),
    ],
  })

  expect(await collect(parseKnipOutput(stdout, dir))).toEqual([])
})

test('converts an absolute path back to a repo-relative one', async () => {
  await writeFile(join(dir, 'src/dead.ts'), 'export const dead = 1\n')
  const stdout = JSON.stringify({ issues: [row(join(dir, 'src/dead.ts'), { files: [{ name: 'dead.ts' }] })] })

  const [found] = await collect(parseKnipOutput(stdout, dir))

  expect(found?.file).toBe('src/dead.ts')
})

test('raises when knip reported a different set of issue types than was elected', async () => {
  const stdout = JSON.stringify({ issues: [row('src/a.ts', { files: [], exports: [] })] })

  await expect(collect(parseKnipOutput(stdout, dir, { issueTypes: ['files'] }))).rejects.toThrow(
    /expected knip to report \[files\], it reported \[exports, files\]/,
  )
})

test('does not check the reported type set when there is nothing to check it against', async () => {
  // A clean repository yields `issues: []` — no row, so no key set, so no evidence either way. That
  // must not be read as a mismatch, or every clean run would fail.
  expect(await collect(parseKnipOutput('{"issues":[]}', dir, { issueTypes: ['files'] }))).toEqual([])
})

test('accepts the elected type set in any order', async () => {
  const stdout = JSON.stringify({ issues: [row('src/a.ts', { exports: [], files: [] })] })
  expect(await collect(parseKnipOutput(stdout, dir, { issueTypes: ['files', 'exports'] }))).toEqual([])
})
