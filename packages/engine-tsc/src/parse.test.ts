import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { RawDiagnostic } from '@misaon/slop-gate-core'
import { parseTscOutput, TYPE_ERROR_RULE_ID } from './parse.ts'

let dir: string

const collect = async (iterable: AsyncIterable<RawDiagnostic>): Promise<RawDiagnostic[]> => {
  const out: RawDiagnostic[] = []
  for await (const item of iterable) out.push(item)
  return out
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-tsc-parse-'))
  await mkdir(join(dir, 'src'), { recursive: true })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('returns nothing for empty stdout (a clean compile)', async () => {
  expect(await collect(parseTscOutput('', dir))).toEqual([])
  expect(await collect(parseTscOutput('   \n  \n', dir))).toEqual([])
})

test('parses a plain single-line diagnostic', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export function f(): number {\n  const x: number = "hello"\n  return x\n}\n')
  const stdout = "src/a.ts(2,9): error TS2322: Type 'string' is not assignable to type 'number'.\n"

  const found = await collect(parseTscOutput(stdout, dir))

  expect(found).toHaveLength(1)
  expect(found[0]?.engineRuleId).toBe(TYPE_ERROR_RULE_ID)
  expect(found[0]?.severity).toBe('error')
  expect(found[0]?.file).toBe('src/a.ts')
  expect(found[0]?.message).toBe("TS2322: Type 'string' is not assignable to type 'number'.")
})

test('computes a byte range anchored at the reported (line, column), one character wide', async () => {
  const source = 'export function f(): number {\n  const x: number = "hello"\n  return x\n}\n'
  await writeFile(join(dir, 'src/a.ts'), source)
  const stdout = "src/a.ts(2,9): error TS2322: Type 'string' is not assignable to type 'number'.\n"

  const [found] = await collect(parseTscOutput(stdout, dir))

  const columnXOffset = source.indexOf('const x') + 'const '.length
  expect(found?.range.start).toBe(columnXOffset)
  expect(found?.range.end).toBe(columnXOffset + 1)
})

test('joins a multi-line diagnostic (indented continuation lines) into one message', async () => {
  await writeFile(join(dir, 'src/g.ts'), 'function pick(x: string): void\nfunction pick(x: boolean): void\nfunction pick(x: string | boolean): void {}\n\npick(42)\n')
  const stdout = [
    'src/g.ts(5,6): error TS2769: No overload matches this call.',
    "  Overload 1 of 2, '(x: string): void', gave the following error.",
    "    Argument of type 'number' is not assignable to parameter of type 'string'.",
    "  Overload 2 of 2, '(x: boolean): void', gave the following error.",
    "    Argument of type 'number' is not assignable to parameter of type 'boolean'.",
    '',
  ].join('\n')

  const [found] = await collect(parseTscOutput(stdout, dir))

  expect(found?.file).toBe('src/g.ts')
  expect(found?.message).toBe(
    [
      'TS2769: No overload matches this call.',
      "Overload 1 of 2, '(x: string): void', gave the following error.",
      "Argument of type 'number' is not assignable to parameter of type 'string'.",
      "Overload 2 of 2, '(x: boolean): void', gave the following error.",
      "Argument of type 'number' is not assignable to parameter of type 'boolean'.",
    ].join('\n'),
  )
})

test('a line-based parser is not fooled into inventing a second diagnostic from a continuation line', async () => {
  await writeFile(join(dir, 'src/g.ts'), 'pick(42)\n')
  const stdout = [
    'src/g.ts(1,1): error TS2769: No overload matches this call.',
    "  Overload 1 of 2, '(x: string): void', gave the following error.",
    '',
  ].join('\n')

  const found = await collect(parseTscOutput(stdout, dir))
  expect(found).toHaveLength(1)
})

test('reports several diagnostics across several files, each attributed to its own file', async () => {
  await writeFile(join(dir, 'src/a-first.ts'), 'export const a: number = "bad"\n')
  await writeFile(join(dir, 'src/z-last.ts'), 'export const z: number = "bad"\n')
  const stdout = [
    "src/a-first.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.",
    "src/z-last.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.",
  ].join('\n')

  const found = await collect(parseTscOutput(stdout, dir))

  expect(found.map((d) => d.file)).toEqual(['src/a-first.ts', 'src/z-last.ts'])
})

test('throws an EngineError for a global diagnostic with no location (e.g. a missing tsconfig)', async () => {
  const stdout = "error TS5058: The specified path does not exist: 'tsconfig.json'.\n"

  await expect(collect(parseTscOutput(stdout, dir))).rejects.toThrow(/TS5058/)
})

test('throws an EngineError for "no inputs were found", another global diagnostic', async () => {
  const stdout =
    "error TS18003: No inputs were found in config file '/repo/tsconfig.json'. " +
    "Specified 'include' paths were '[\"nowhere/**/*\"]' and 'exclude' paths were '[]'.\n"

  await expect(collect(parseTscOutput(stdout, dir))).rejects.toThrow(/TS18003/)
})

test('a malformed tsconfig is parsed as an ordinary located diagnostic against tsconfig.json itself', async () => {
  await writeFile(join(dir, 'tsconfig.json'), '{ "compilerOptions": { "strict": true, ] }\n')
  const stdout = ['tsconfig.json(1,40): error TS1136: Property assignment expected.', "tsconfig.json(2,1): error TS1005: '}' expected."].join(
    '\n',
  )

  const found = await collect(parseTscOutput(stdout, dir))

  expect(found).toHaveLength(2)
  expect(found.every((d) => d.file === 'tsconfig.json')).toBe(true)
  expect(found[0]?.message).toBe('TS1136: Property assignment expected.')
})

test('recognises a synthetic "warning" severity line, even though real tsc 5.9.3 was never observed to emit one', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  const stdout = 'src/a.ts(1,1): warning TS0000: synthetic warning for parser coverage.\n'

  const [found] = await collect(parseTscOutput(stdout, dir))
  expect(found?.severity).toBe('warning')
})

test('converts a Windows-style backslash path to POSIX before returning it', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')
  const stdout = 'src\\a.ts(1,1): error TS2322: fake message.\n'

  const [found] = await collect(parseTscOutput(stdout, dir))
  expect(found?.file).toBe('src/a.ts')
})

test('drops TS2307 for a single-file component that is really there', async () => {
  await writeFile(join(dir, 'src/Card.vue'), '<template><div /></template>\n')
  await writeFile(join(dir, 'src/Card.test.ts'), "import Card from './Card.vue'\nexport default Card\n")
  const stdout = `src/Card.test.ts(8,19): error TS2307: Cannot find module './Card.vue' or its corresponding type declarations.\n`

  expect(await collect(parseTscOutput(stdout, dir))).toEqual([])
})

test('keeps TS2307 for a single-file component that is not there', async () => {
  await writeFile(join(dir, 'src/Card.test.ts'), "import Card from './Missing.vue'\nexport default Card\n")
  const stdout = `src/Card.test.ts(8,19): error TS2307: Cannot find module './Missing.vue' or its corresponding type declarations.\n`

  const found = await collect(parseTscOutput(stdout, dir))
  expect(found).toHaveLength(1)
  expect(found[0]?.message).toContain('TS2307')
})

test('keeps TS2307 for an ordinary module, however it is spelled', async () => {
  await writeFile(join(dir, 'src/helper.ts'), 'export const a = 1\n')
  await writeFile(join(dir, 'src/a.ts'), "import { a } from './helper'\nexport default a\n")
  const stdout = `src/a.ts(1,20): error TS2307: Cannot find module './helper' or its corresponding type declarations.\n`

  expect(await collect(parseTscOutput(stdout, dir))).toHaveLength(1)
})

test('drops TS2307 for a Svelte or Astro component that exists', async () => {
  await writeFile(join(dir, 'src/A.svelte'), '<div />\n')
  await writeFile(join(dir, 'src/B.astro'), '<div />\n')
  await writeFile(join(dir, 'src/a.ts'), "import A from './A.svelte'\nimport B from './B.astro'\nexport default [A, B]\n")
  const stdout =
    `src/a.ts(1,20): error TS2307: Cannot find module './A.svelte' or its corresponding type declarations.\n` +
    `src/a.ts(2,20): error TS2307: Cannot find module './B.astro' or its corresponding type declarations.\n`

  expect(await collect(parseTscOutput(stdout, dir))).toEqual([])
})
