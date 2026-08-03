import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { EngineError, type RuleLevel, type RunContext } from '@misaon/slop-gate-core'
import { materializeBiomeCssConfig } from './config.ts'
import { CSS_PARSE_ERROR_RULE_ID } from './parse.ts'
import { FOREIGN_SUPPRESSION_RULE_ID } from './rules.ts'

let root: string
let context: RunContext

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'slop-gate-biome-cfg-'))
  context = { rootDir: root, tmpDir: join(root, 'tmp') }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/**
 * Lifts a level-only record into the tuple form `EngineRuleSelection` takes. Convenience for the
 * tests that only care about levels; the one that cares about options builds its selection directly.
 */
const materialize = (selection: Record<string, RuleLevel>) =>
  materializeBiomeCssConfig(
    new Map(Object.entries(selection).map(([engineRuleId, level]) => [engineRuleId, [level] as const])),
    context,
  )

const readConfig = async (path: string) => JSON.parse(await readFile(path, 'utf8'))

test('nests each rule under the group biome expects', async () => {
  const handle = await materialize({ noDuplicateProperties: 'warn', noUnknownProperty: 'error', noHexColors: 'info' })
  const config = await readConfig(handle.path)
  expect(config.linter.rules).toEqual({
    recommended: false,
    suspicious: { noDuplicateProperties: 'warn' },
    correctness: { noUnknownProperty: 'error' },
    style: { noHexColors: 'info' },
  })
  await handle.dispose()
})

test('turns biome’s own recommended set off', async () => {
  // Without this biome enables its whole recommended set regardless of `rules`, so unelected rules
  // report and bypass arbitration — the same defect `categories` guards against in engine-oxlint.
  const handle = await materialize({ noDuplicateProperties: 'warn' })
  expect((await readConfig(handle.path)).linter.rules.recommended).toBe(false)
  await handle.dispose()
})

test('sets both css parser keys together', async () => {
  // `tailwindDirectives` alone silently disables `.module.css` detection: 265 false findings on the
  // measurement corpus. The pairing is the fix, so it is asserted as a pairing.
  const handle = await materialize({ noDuplicateProperties: 'warn' })
  expect((await readConfig(handle.path)).css.parser).toEqual({ cssModules: true, tailwindDirectives: true })
  await handle.dispose()
})

test('raises the file size ceiling above biome’s silent 1 MiB skip', async () => {
  const handle = await materialize({ noDuplicateProperties: 'warn' })
  expect((await readConfig(handle.path)).files.maxSize).toBeGreaterThan(1024 * 1024)
  await handle.dispose()
})

test('disables the formatter and the assist actions', async () => {
  const handle = await materialize({ noDuplicateProperties: 'warn' })
  const config = await readConfig(handle.path)
  expect(config.formatter.enabled).toBe(false)
  expect(config.assist.enabled).toBe(false)
  await handle.dispose()
})

test('omits rules set to off', async () => {
  const handle = await materialize({ noDuplicateProperties: 'warn', noHexColors: 'off' })
  expect((await readConfig(handle.path)).linter.rules.style).toBeUndefined()
  expect(handle.ruleCount).toBe(1)
  await handle.dispose()
})

test('a rule set to off with options is still off', async () => {
  // Two comparisons here read the level (`elected` and `enabled`), and both used to compare the whole
  // selection value against `'off'` — false for an `['off', …]` value, so a disabled rule would be
  // written into the config *and* accepted by `run`'s own election check. Built directly rather than
  // through `materialize`, because the option half is the whole point.
  const handle = await materializeBiomeCssConfig(
    new Map([
      ['noDuplicateProperties', ['warn'] as const],
      ['noHexColors', ['off', { probe: true }] as const],
    ]),
    context,
  )

  expect((await readConfig(handle.path)).linter.rules.style).toBeUndefined()
  expect(handle.ruleCount).toBe(1)
  expect(handle.enabledRuleIds.has('noHexColors')).toBe(false)
  await handle.dispose()
})

test('keeps the synthetic reports out of the config but inside the election', async () => {
  // Biome rejects the whole configuration on an unknown rule name, so writing either of these into
  // `linter.rules` would fail every run — but `run` still has to know they were elected.
  const handle = await materialize({
    noDuplicateProperties: 'warn',
    [CSS_PARSE_ERROR_RULE_ID]: 'warn',
    [FOREIGN_SUPPRESSION_RULE_ID]: 'warn',
  })
  const serialised = await readFile(handle.path, 'utf8')
  expect(serialised).not.toContain(CSS_PARSE_ERROR_RULE_ID)
  expect(serialised).not.toContain(FOREIGN_SUPPRESSION_RULE_ID)
  expect(handle.ruleCount).toBe(1)
  expect(handle.enabledRuleIds.has(CSS_PARSE_ERROR_RULE_ID)).toBe(true)
  expect(handle.enabledRuleIds.has(FOREIGN_SUPPRESSION_RULE_ID)).toBe(true)
  await handle.dispose()
})

test('rejects a rule biome has never heard of', async () => {
  await expect(materialize({ noSuchBiomeRule: 'warn' })).rejects.toThrow(EngineError)
})

test('writes the config into its own directory, named biome.json', async () => {
  const handle = await materialize({ noDuplicateProperties: 'warn' })
  expect(handle.path.endsWith(join('', 'biome.json'))).toBe(true)
  expect(dirname(handle.path)).not.toBe(context.tmpDir)
  await handle.dispose()
})

test('the same ruleset produces the same directory, a different one does not', async () => {
  const a = await materialize({ noDuplicateProperties: 'warn' })
  const b = await materialize({ noDuplicateProperties: 'warn' })
  const c = await materialize({ noDuplicateProperties: 'error' })
  expect(a.path).toBe(b.path)
  expect(a.rulesetHash).not.toBe(c.rulesetHash)
  await Promise.all([a.dispose(), c.dispose()])
})

test('refuses to run with a second config beside ours', async () => {
  // Biome treats the config's directory as the project root and *scans it*, aborting the whole run
  // on any nested configuration it finds — with an error naming a file the user never wrote.
  const probe = await materialize({ noDuplicateProperties: 'warn' })
  const dir = dirname(probe.path)
  await probe.dispose()
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'biome.jsonc'), '{}', 'utf8')
  await expect(materialize({ noDuplicateProperties: 'warn' })).rejects.toThrow(/nothing but biome\.json/)
})

test('dispose removes the whole directory, not just the file', async () => {
  const handle = await materialize({ noDuplicateProperties: 'warn' })
  const dir = dirname(handle.path)
  await handle.dispose()
  await expect(stat(dir)).rejects.toThrow(/ENOENT/)
})
