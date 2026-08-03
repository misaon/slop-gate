import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { applyEdits, decodeUtf8, encodeUtf8, type CandidateEdit, type FixTarget, type RunContext } from '@misaon/slop-gate-core'
import { deriveOxlintFixes, loadFixCatalogue } from './derive-fixes.ts'
import { resolveOxlintBinary } from './resolve-binary.ts'

// Non-null because every test here spawns the real bundled oxlint: an unresolvable one is a broken
// install of this package, which no assertion below could say anything useful about.
const invocation = resolveOxlintBinary()!
let dir: string

const context = (): RunContext => ({ rootDir: dir, tmpDir: join(dir, '.slop-gate', 'tmp') })

const target = (file: string, engineRuleId: string): FixTarget => ({ file, engineRuleId, range: { start: 0, end: 1 } })

const asCandidate = (file: string, edit: { range: { start: number; end: number }; replacement: string }): CandidateEdit => ({
  file,
  range: edit.range,
  replacement: edit.replacement,
  kind: 'safe',
  ruleId: 'oxlint/r',
  concept: 'correctness.m',
  priority: 50,
  severity: 'warn',
})

const applyDerived = async (file: string, edits: readonly { range: { start: number; end: number }; replacement: string }[]) =>
  decodeUtf8(applyEdits(encodeUtf8(await readFile(join(dir, file), 'utf8')), edits.map((edit) => asCandidate(file, edit))))

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-derive-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('the live catalogue reports a fix value for every rule it lists', async () => {
  const catalogue = await loadFixCatalogue(invocation)

  expect(catalogue.size).toBeGreaterThan(500)
  // Keyed exactly as an oxlint config keys `rules`: bare for eslint, `scope/rule` for a plugin.
  expect(catalogue.get('prefer-const')).toBeDefined()
  expect(catalogue.get('unicorn/no-useless-spread')).toBeDefined()
  expect(catalogue.get('eslint/prefer-const')).toBeUndefined()
})

test('a real safe fix is derived from the real binary and reproduces oxlint own rewrite', async () => {
  await writeFile(join(dir, 'a.ts'), 'let z = 3\nexport { z }\n')

  const derived = await deriveOxlintFixes({
    invocation,
    targets: [target('a.ts', 'prefer-const')],
    context: context(),
    signal: new AbortController().signal,
  })

  expect(derived).toHaveLength(1)
  expect(derived[0]?.engineRuleId).toBe('prefer-const')
  expect(await applyDerived('a.ts', derived[0]!.edits)).toBe('const z = 3\nexport { z }\n')
  // The user's file is only read, never written, by the derivation itself.
  expect(await readFile(join(dir, 'a.ts'), 'utf8')).toBe('let z = 3\nexport { z }\n')
})

// `unicorn/no-useless-spread` is `fixable_dangerous_fix` in the catalogue, so it needs
// `--fix-dangerously`; `--fix` happens to apply it too, but `--fix-suggestions` does not. Choosing
// the flag from the catalogue value rather than from the requested tier is what makes this work.
test('a dangerous fix is derived using the flag its catalogue entry calls for', async () => {
  await writeFile(join(dir, 'a.ts'), 'const copy = [...[1, 2, 3]]\nexport { copy }\n')

  const derived = await deriveOxlintFixes({
    invocation,
    targets: [target('a.ts', 'unicorn/no-useless-spread')],
    context: context(),
    signal: new AbortController().signal,
  })

  expect(await applyDerived('a.ts', derived[0]!.edits)).toBe('const copy = [1, 2, 3]\nexport { copy }\n')
})

test('two occurrences of one rule in a file become two separate edits, not one spanning both', async () => {
  await writeFile(join(dir, 'a.ts'), 'let a = 1\nconst spacer = 2\nlet b = 3\nexport { a, b, spacer }\n')

  const derived = await deriveOxlintFixes({
    invocation,
    targets: [target('a.ts', 'prefer-const')],
    context: context(),
    signal: new AbortController().signal,
  })

  // One edit per occurrence is what lets another rule's edit between them survive arbitration.
  expect(derived[0]!.edits.length).toBe(2)
  expect(await applyDerived('a.ts', derived[0]!.edits)).toBe(
    'const a = 1\nconst spacer = 2\nconst b = 3\nexport { a, b, spacer }\n',
  )
})

test('a rule with no fix in the catalogue is never run and yields nothing', async () => {
  await writeFile(join(dir, 'a.ts'), 'const x = 1\nexport { x }\n')

  const derived = await deriveOxlintFixes({
    invocation,
    targets: [target('a.ts', 'no-unused-vars')],
    context: context(),
    catalogue: new Map([['no-unused-vars', 'none']]),
    signal: new AbortController().signal,
  })

  expect(derived).toEqual([])
})

test('a rule whose fix does not apply to this file yields no edits rather than an empty rewrite', async () => {
  await writeFile(join(dir, 'a.ts'), 'const already = 1\nexport { already }\n')

  const derived = await deriveOxlintFixes({
    invocation,
    targets: [target('a.ts', 'prefer-const')],
    context: context(),
    signal: new AbortController().signal,
  })

  expect(derived).toEqual([])
})

test('no targets means no subprocess and no catalogue load', async () => {
  const derived = await deriveOxlintFixes({
    invocation,
    targets: [],
    context: context(),
    signal: new AbortController().signal,
  })

  expect(derived).toEqual([])
})

test('the sandbox is removed afterwards, leaving no copies of the user source behind', async () => {
  await writeFile(join(dir, 'a.ts'), 'let z = 3\nexport { z }\n')

  await deriveOxlintFixes({
    invocation,
    targets: [target('a.ts', 'prefer-const')],
    context: context(),
    signal: new AbortController().signal,
  })

  const { readdir } = await import('node:fs/promises')
  const leftovers = await readdir(join(dir, '.slop-gate', 'tmp')).catch(() => [])
  expect(leftovers).toEqual([])
})

test('a file whose content is multi-byte survives the copy-fix-diff round trip', async () => {
  await writeFile(join(dir, 'a.ts'), 'const emoji = "🚀 héllo"\nlet z = 3\nexport { z, emoji }\n')

  const derived = await deriveOxlintFixes({
    invocation,
    targets: [target('a.ts', 'prefer-const')],
    context: context(),
    signal: new AbortController().signal,
  })

  expect(await applyDerived('a.ts', derived[0]!.edits)).toBe(
    'const emoji = "🚀 héllo"\nconst z = 3\nexport { z, emoji }\n',
  )
})

test('two rules over the same file are derived independently, each attributed to its own rule', async () => {
  await writeFile(join(dir, 'a.ts'), 'let z = 3\nconst copy = [...[1, 2]]\nexport { z, copy }\n')

  const derived = await deriveOxlintFixes({
    invocation,
    targets: [target('a.ts', 'prefer-const'), target('a.ts', 'unicorn/no-useless-spread')],
    context: context(),
    signal: new AbortController().signal,
  })

  expect(derived.map((d) => d.engineRuleId).sort()).toEqual(['prefer-const', 'unicorn/no-useless-spread'])
  // Each rule's edits are derived against the *original* buffer, so neither has seen the other's
  // rewrite — which is exactly what makes them arbitrable against each other in one pass.
  for (const one of derived) {
    for (const edit of one.edits) {
      expect(edit.range.end).toBeLessThanOrEqual(encodeUtf8(await readFile(join(dir, 'a.ts'), 'utf8')).length)
    }
  }
})

test('a nested path is copied into the sandbox with its directory structure intact', async () => {
  const { mkdir } = await import('node:fs/promises')
  await mkdir(join(dir, 'packages', 'core', 'src'), { recursive: true })
  await writeFile(join(dir, 'packages/core/src/a.ts'), 'let z = 3\nexport { z }\n')

  const derived = await deriveOxlintFixes({
    invocation,
    targets: [target('packages/core/src/a.ts', 'prefer-const')],
    context: context(),
    signal: new AbortController().signal,
  })

  expect(derived[0]?.file).toBe('packages/core/src/a.ts')
  expect(await applyDerived('packages/core/src/a.ts', derived[0]!.edits)).toBe('const z = 3\nexport { z }\n')
})
