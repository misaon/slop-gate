import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { EngineRuleSelection, InventoryFile, RawDiagnostic, RunContext } from '@misaon/slop-gate-core'
import { HADOLINT_RULE_IDS, createHadolintEngine, resolveHadolintBinary } from './index.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)).replace(/src$/, 'fixtures'), 'tree')
const installed = resolveHadolintBinary()
const noBinary = installed === undefined

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'sgate-hadolint-fixtures-'))
  await cp(FIXTURES, root, { recursive: true })
})

afterAll(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

async function runOn(file: string): Promise<RawDiagnostic[]> {
  return runWith(file, new Map(HADOLINT_RULE_IDS.map((rule) => [rule, ['error'] as const])))
}

async function runWith(file: string, selection: EngineRuleSelection): Promise<RawDiagnostic[]> {
  const engine = createHadolintEngine()
  const context: RunContext = { rootDir: root, tmpDir: join(root, '.slop-gate', 'tmp') }
  const handle = await engine.materializeConfig(selection, context)
  const batch = { files: [{ path: file, language: 'dockerfile' } as InventoryFile] }
  const found: RawDiagnostic[] = []
  for await (const diagnostic of engine.run(batch, handle, context, new AbortController().signal)) found.push(diagnostic)
  await handle.dispose?.()
  return found
}

const POSITIVE: readonly { file: string; engineRuleId: string }[] = [
  { file: 'Dockerfile.base-image.positive', engineRuleId: 'DL3007' },
  { file: 'Dockerfile.untagged.positive', engineRuleId: 'DL3006' },
  { file: 'Dockerfile.pipefail.positive', engineRuleId: 'DL4006' },
  { file: 'Dockerfile.entrypoint.positive', engineRuleId: 'DL3025' },
  { file: 'Dockerfile.platform.positive', engineRuleId: 'DL3029' },
  { file: 'Dockerfile.pip-cache.positive', engineRuleId: 'DL3042' },
]

for (const { file, engineRuleId } of POSITIVE) {
  test.skipIf(noBinary)(`${engineRuleId} fires on ${file}`, async () => {
    const found = await runOn(file)
    expect(found.map((d) => d.engineRuleId)).toContain(engineRuleId)
    expect(found.every((d) => d.file === file)).toBe(true)
  })
}

test.skipIf(noBinary)('every shipped rule stays silent on a well-formed Dockerfile', async () => {
  expect(await runOn('Dockerfile.clean.negative')).toEqual([])
})

test.skipIf(noBinary)('DL3025 is filtered on HEALTHCHECK, and hadolint really does report it', async () => {
  const raw = await rawCodes('Dockerfile.healthcheck.filtered')
  expect(raw).toContain('DL3025')
  expect(await runOn('Dockerfile.healthcheck.filtered')).toEqual([])
})

test.skipIf(noBinary)('hadolint reports nothing at all about a Dockerfile with no USER', async () => {
  expect(await rawCodes('Dockerfile.no-user.excluded')).toEqual([])
})

test.skipIf(noBinary)('DL3066 fires on a named non-root user, and is excluded for exactly that reason', async () => {
  expect(await rawCodes('Dockerfile.named-user.excluded')).toContain('DL3066')
  expect(await runOn('Dockerfile.named-user.excluded')).toEqual([])
})

test.skipIf(noBinary)('a rule set to off with options is still off', async () => {
  const only = await runWith('Dockerfile.base-image.positive', new Map([['DL3007', ['error']]]))
  expect(only.map((diagnostic) => diagnostic.engineRuleId)).toContain('DL3007')

  const off = await runWith('Dockerfile.base-image.positive', new Map([['DL3007', ['off', { probe: true }]]]))
  expect(off).toEqual([])
})

async function rawCodes(file: string): Promise<string[]> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const run = promisify(execFile)
  let stdout = ''
  try {
    ;({ stdout } = await run(installed?.command ?? 'hadolint', ['-f', 'json', '--no-fail', join(root, file)], { encoding: 'utf8' }))
  } catch (error) {
    stdout = (error as { stdout?: string }).stdout ?? ''
  }
  return (JSON.parse(stdout.trim() || '[]') as { code: string }[]).map((f) => f.code)
}
