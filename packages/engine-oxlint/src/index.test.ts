import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { EngineRuleSetting, InventoryFile, RawDiagnostic } from '@misaon/slop-gate-core'
import { createOxlintEngine } from './index.ts'

let dir: string
let context: { rootDir: string; tmpDir: string }

const file = (path: string): InventoryFile => ({
  path,
  language: 'ts',
  workspace: '',
  size: 0,
  mtimeMs: 0,
})

const collect = async (iterable: AsyncIterable<RawDiagnostic>): Promise<RawDiagnostic[]> => {
  const out: RawDiagnostic[] = []
  for await (const item of iterable) out.push(item)
  return out
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-oxlint-'))
  context = { rootDir: dir, tmpDir: join(dir, '.slop-gate', 'tmp') }
  await mkdir(join(dir, 'src'), { recursive: true })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('reports its version', async () => {
  expect(await createOxlintEngine().version()).toMatch(/^\d+\.\d+\.\d+/)
})

test('declares file granularity and script languages', () => {
  const engine = createOxlintEngine()
  expect(engine.capabilities.granularity).toBe('file')
  expect(engine.capabilities.languages).toContain('ts')
  expect(engine.id).toBe('oxlint')
})

test('materialises a config containing only the selected rules', async () => {
  const handle = await createOxlintEngine().materializeConfig(
    new Map([
      ['no-debugger', ['error'] as const],
      ['no-var', ['off'] as const],
    ]),
    context,
  )
  const written = JSON.parse(await readFile(handle.path, 'utf8')) as { rules: Record<string, string>; categories: unknown }

  expect(written.rules).toEqual({ 'no-debugger': 'error' })
  expect(written.categories).toEqual({
    correctness: 'off',
    suspicious: 'off',
    pedantic: 'off',
    perf: 'off',
    style: 'off',
    restriction: 'off',
    nursery: 'off',
  })
  await handle.dispose()
})

test('never writes the synthetic parse-error rule id into the materialised config', async () => {
  const handle = await createOxlintEngine().materializeConfig(
    new Map([
      ['no-debugger', ['error'] as const],
      ['parse-error', ['error'] as const],
    ]),
    context,
  )
  const written = JSON.parse(await readFile(handle.path, 'utf8')) as { rules: Record<string, string> }

  expect(written.rules).toEqual({ 'no-debugger': 'error' })
  expect(handle.ruleCount).toBe(1)
  await handle.dispose()
})

test('a rule set to off with options is still off', async () => {
  const handle = await createOxlintEngine().materializeConfig(
    new Map([
      ['no-debugger', ['error'] as const],
      ['eqeqeq', ['off', 'smart'] as const],
    ]),
    context,
  )

  expect(JSON.parse(await readFile(handle.path, 'utf8')).rules).toEqual({ 'no-debugger': 'error' })
  expect(handle.ruleCount).toBe(1)
  await handle.dispose()
})

test('writes a rule\'s options into the config as oxlint\'s positional option list', async () => {
  const handle = await createOxlintEngine().materializeConfig(new Map([['eqeqeq', ['warn', 'smart'] as const]]), context)
  const written = JSON.parse(await readFile(handle.path, 'utf8')) as { rules: Record<string, unknown> }

  expect(written.rules).toEqual({ eqeqeq: ['warn', 'smart'] })
  await handle.dispose()
})

test('the ruleset hash changes when only a rule\'s options change', async () => {
  const engine = createOxlintEngine()
  const smart = await engine.materializeConfig(new Map([['eqeqeq', ['warn', 'smart'] as const]]), context)
  const always = await engine.materializeConfig(new Map([['eqeqeq', ['warn', 'always'] as const]]), context)
  const bare = await engine.materializeConfig(new Map([['eqeqeq', ['warn'] as const]]), context)

  expect(smart.rulesetHash).not.toBe(always.rulesetHash)
  expect(smart.rulesetHash).not.toBe(bare.rulesetHash)
  await smart.dispose()
  await always.dispose()
  await bare.dispose()
})

test('an option-free selection writes the bare level, as it did before options existed', async () => {
  const handle = await createOxlintEngine().materializeConfig(new Map([['no-debugger', ['error'] as const]]), context)

  expect(JSON.parse(await readFile(handle.path, 'utf8')).rules).toEqual({ 'no-debugger': 'error' })
  await handle.dispose()
})

test('runs a rule at its configured options against the real binary', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const f = (a: unknown, b: unknown) => a == null || a == b\n')
  const engine = createOxlintEngine()

  const strict = await engine.materializeConfig(new Map([['eqeqeq', ['warn'] as const]]), context)
  const strictFindings = await collect(engine.run({ files: [file('src/a.ts')] }, strict, context, new AbortController().signal))
  await strict.dispose()

  const smart = await engine.materializeConfig(new Map([['eqeqeq', ['warn', 'smart'] as const]]), context)
  const smartFindings = await collect(engine.run({ files: [file('src/a.ts')] }, smart, context, new AbortController().signal))
  await smart.dispose()

  expect(strictFindings).toHaveLength(2)
  expect(smartFindings).toHaveLength(1)
})

test('produces the same ruleset hash regardless of selection order', async () => {
  const engine = createOxlintEngine()
  const a = await engine.materializeConfig(new Map([['no-debugger', ['error'] as const], ['no-var', ['warn'] as const]]), context)
  const b = await engine.materializeConfig(new Map([['no-var', ['warn'] as const], ['no-debugger', ['error'] as const]]), context)

  expect(b.rulesetHash).toBe(a.rulesetHash)
  await a.dispose()
  await b.dispose()
})

test('finds a real violation in a real file', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export function f() {\n  debugger\n}\n')
  const engine = createOxlintEngine()
  const handle = await engine.materializeConfig(new Map([['no-debugger', ['error'] as const]]), context)

  const found = await collect(engine.run({ files: [file('src/a.ts')] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found).toHaveLength(1)
  expect(found[0]?.engineRuleId).toBe('no-debugger')
  expect(found[0]?.file).toBe('src/a.ts')
  await handle.dispose()
})

test('does not report a default-on rule the registry did not elect', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'export const dupe = { a: 1, a: 2 }\nexport function f() {\n  debugger\n}\n')
  const engine = createOxlintEngine()
  const handle = await engine.materializeConfig(new Map([['no-debugger', ['error'] as const]]), context)

  const found = await collect(engine.run({ files: [file('src/a.ts')] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found.map((d) => d.engineRuleId)).toEqual(['no-debugger'])
  await handle.dispose()
})

test('yields nothing for a clean file', async () => {
  await writeFile(join(dir, 'src/clean.ts'), 'export const a = 1\n')
  const engine = createOxlintEngine()
  const handle = await engine.materializeConfig(new Map([['no-debugger', ['error'] as const]]), context)

  expect(await collect(engine.run({ files: [file('src/clean.ts')] }, handle, context, AbortSignal.timeout(30_000)))).toEqual([])
  await handle.dispose()
})

test('yields nothing for an empty batch without spawning a process', async () => {
  const engine = createOxlintEngine()
  const handle = await engine.materializeConfig(new Map([['no-debugger', ['error'] as const]]), context)

  expect(await collect(engine.run({ files: [] }, handle, context, AbortSignal.timeout(1000)))).toEqual([])
  await handle.dispose()
})

test('surfaces a genuine parse error instead of silently dropping the file', async () => {
  await writeFile(join(dir, 'src/broken.ts'), 'export function f() {\n  const x: = 5\n  return x\n}\n')
  const engine = createOxlintEngine()
  const handle = await engine.materializeConfig(new Map([['no-debugger', ['error'] as const]]), context)

  const found = await collect(engine.run({ files: [file('src/broken.ts')] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found).toHaveLength(1)
  expect(found[0]?.engineRuleId).toBe('parse-error')
  expect(found[0]?.severity).toBe('error')
  expect(found[0]?.file).toBe('src/broken.ts')
  await handle.dispose()
})

test('fires each of a representative sample of the M0 registry expansion against the real binary', async () => {
  await writeFile(
    join(dir, 'src/a.ts'),
    [
      'export function selfAssign(x: number) {',
      '  x = x',
      '  return x',
      '}',
      '',
      'export function badEval(code: string) {',
      '  return eval(code)',
      '}',
      '',
      'export function nanCheck(a: number) {',
      "  return a === NaN",
      '}',
      '',
      'export function unreachable() {',
      '  return 1',
      "  console.log('never runs')",
      '}',
      '',
      'export function extendsNative() {',
      '  // @ts-expect-error demo only',
      '  Array.prototype.customThing = function () { return 1 }',
      '}',
      '',
      'export function discardsCause() {',
      '  try {',
      '    JSON.parse("not json")',
      '  } catch (e) {',
      "    throw new Error('parsing failed')",
      '  }',
      '}',
      '',
    ].join('\n'),
  )
  const engine = createOxlintEngine()
  const selection = new Map<string, EngineRuleSetting>([
    ['no-self-assign', ['error'] as const],
    ['no-eval', ['error'] as const],
    ['use-isnan', ['error'] as const],
    ['no-unreachable', ['error'] as const],
    ['no-extend-native', ['warn'] as const],
    ['preserve-caught-error', ['warn'] as const],
  ])
  const handle = await engine.materializeConfig(selection, context)

  const found = await collect(engine.run({ files: [file('src/a.ts')] }, handle, context, AbortSignal.timeout(30_000)))

  expect(new Set(found.map((d) => d.engineRuleId))).toEqual(new Set(selection.keys()))
  await handle.dispose()
})

test('reports a binding that shadows an outer-scope declaration', async () => {
  await writeFile(
    join(dir, 'src/a.ts'),
    [
      'export function shadowsOuterScope(condition: boolean) {',
      '  if (condition) {',
      '    const condition = true',
      '    return condition',
      '  }',
      '  return condition',
      '}',
      '',
    ].join('\n'),
  )
  const engine = createOxlintEngine()
  const handle = await engine.materializeConfig(new Map([['no-shadow', ['warn'] as const]]), context)

  const found = await collect(engine.run({ files: [file('src/a.ts')] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found).toHaveLength(1)
  expect(found[0]?.engineRuleId).toBe('no-shadow')
  expect(found[0]?.file).toBe('src/a.ts')
  await handle.dispose()
})

test('anchors a multi-label finding on the offending node against the real binary', async () => {
  await writeFile(
    join(dir, 'src/a.ts'),
    [
      'export function outerNamedScope(input: number[]) {',
      '  const items = input.map((x) => x * 2)',
      '',
      '  function innerHelper(value: number) {',
      '    return value + 1',
      '  }',
      '',
      '  return items.map(innerHelper)',
      '}',
      '',
    ].join('\n'),
  )
  const engine = createOxlintEngine()
  const handle = await engine.materializeConfig(new Map([['unicorn/consistent-function-scoping', ['warn'] as const]]), context)

  const found = await collect(engine.run({ files: [file('src/a.ts')] }, handle, context, AbortSignal.timeout(30_000)))

  expect(found).toHaveLength(1)
  const source = await readFile(join(dir, 'src/a.ts'), 'utf8')
  expect(source.slice(found[0]!.range.start, found[0]!.range.end)).toBe('innerHelper')
  await handle.dispose()
})

test('raises an EngineError when the binary is missing', async () => {
  const engine = createOxlintEngine({ binaryPath: join(dir, 'does-not-exist') })
  const handle = await engine.materializeConfig(new Map([['no-debugger', ['error'] as const]]), context)
  await writeFile(join(dir, 'src/a.ts'), 'export const a = 1\n')

  await expect(
    collect(engine.run({ files: [file('src/a.ts')] }, handle, context, AbortSignal.timeout(30_000))),
  ).rejects.toThrow(/oxlint/)
  await handle.dispose()
})
