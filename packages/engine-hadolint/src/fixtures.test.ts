import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { InventoryFile, RawDiagnostic, RunContext } from '@misaon/slop-gate-core'
import { HADOLINT_RULE_IDS, createHadolintEngine, resolveHadolintBinary } from './index.ts'

/**
 * Both directions against the real binary, because the whole case for this engine is a measurement
 * and a measurement nothing re-checks decays into a claim.
 *
 * Four kinds of case, the last two carrying the design decisions:
 *
 * - `positive` — the named rule fires.
 * - `negative` — a well-formed Dockerfile every shipped rule stays silent on.
 * - `filtered` — hadolint **does** report and `SOURCE_EXCLUSIONS` must remove it. Asserted from both
 *   ends: the raw binary is required to report the class, so a fixture that stopped triggering it
 *   would fail here rather than pass by accident.
 * - `excluded` — the measured false-positive classes behind `MANUAL_RULE_EXCLUSIONS`, kept executable
 *   so the reasons in that table stay true. `no-user` is the important one: it pins that hadolint
 *   says **nothing** about a Dockerfile that never drops privileges.
 */
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
  const engine = createHadolintEngine()
  const context: RunContext = { rootDir: root, tmpDir: join(root, '.slop-gate', 'tmp') }
  const selection = new Map(HADOLINT_RULE_IDS.map((rule) => [rule, 'error' as const]))
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
  // Both ends. If hadolint stopped emitting DL3025 for `HEALTHCHECK`, the exclusion would be dead code
  // and this fixture would be silently pointless — so the raw output is asserted too.
  const raw = await rawCodes('Dockerfile.healthcheck.filtered')
  expect(raw).toContain('DL3025')
  expect(await runOn('Dockerfile.healthcheck.filtered')).toEqual([])
})

test.skipIf(noBinary)('hadolint reports nothing at all about a Dockerfile with no USER', async () => {
  // The finding that removed the original reason for prioritising this engine. `DL3002` fires only on
  // an explicit `USER root`, never on absence, so a container that never drops privileges is invisible.
  expect(await rawCodes('Dockerfile.no-user.excluded')).toEqual([])
})

test.skipIf(noBinary)('DL3066 fires on a named non-root user, and is excluded for exactly that reason', async () => {
  // 69 corpus findings on `USER nobody`, `USER node`, `USER appuser` — the rule complains about the
  // recommended practice. Pinned as raw output so the exclusion's reasoning stays checkable.
  expect(await rawCodes('Dockerfile.named-user.excluded')).toContain('DL3066')
  expect(await runOn('Dockerfile.named-user.excluded')).toEqual([])
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
