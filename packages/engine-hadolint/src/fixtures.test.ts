import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { EngineRuleSelection, InventoryFile, RawDiagnostic, RunContext } from '@misaon/slop-gate-core'
import { HADOLINT_RULE_IDS, createHadolintEngine, resolveHadolintBinary } from './index.ts'

const FIXTURES = join(import.meta.dirname.replace(/src$/, 'fixtures'), 'tree')
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
  { file: 'Dockerfile.absolute-workdir.positive', engineRuleId: 'DL3000' },
  { file: 'Dockerfile.pointless-command.positive', engineRuleId: 'DL3001' },
  { file: 'Dockerfile.last-user-root.positive', engineRuleId: 'DL3002' },
  { file: 'Dockerfile.sudo.positive', engineRuleId: 'DL3004' },
  { file: 'Dockerfile.add-archive.positive', engineRuleId: 'DL3010' },
  { file: 'Dockerfile.invalid-port.positive', engineRuleId: 'DL3011' },
  { file: 'Dockerfile.multiple-healthcheck.positive', engineRuleId: 'DL3012' },
  { file: 'Dockerfile.apt-get-yes.positive', engineRuleId: 'DL3014' },
  { file: 'Dockerfile.pin-npm.positive', engineRuleId: 'DL3016' },
  { file: 'Dockerfile.copy-multiple-targets.positive', engineRuleId: 'DL3021' },
  { file: 'Dockerfile.copy-from-unknown-stage.positive', engineRuleId: 'DL3022' },
  { file: 'Dockerfile.copy-from-self.positive', engineRuleId: 'DL3023' },
  { file: 'Dockerfile.duplicate-stage-name.positive', engineRuleId: 'DL3024' },
  { file: 'Dockerfile.apt-not-apt-get.positive', engineRuleId: 'DL3027' },
  { file: 'Dockerfile.pin-gem.positive', engineRuleId: 'DL3028' },
  { file: 'Dockerfile.yum-yes.positive', engineRuleId: 'DL3030' },
  { file: 'Dockerfile.zypper-yes.positive', engineRuleId: 'DL3034' },
  { file: 'Dockerfile.zypper-dist-upgrade.positive', engineRuleId: 'DL3035' },
  { file: 'Dockerfile.dnf-yes.positive', engineRuleId: 'DL3038' },
  { file: 'Dockerfile.onbuild-onbuild.positive', engineRuleId: 'DL3043' },
  { file: 'Dockerfile.env-self-reference.positive', engineRuleId: 'DL3044' },
  { file: 'Dockerfile.invalid-label-key.positive', engineRuleId: 'DL3048' },
  { file: 'Dockerfile.missing-healthcheck.positive', engineRuleId: 'DL3057' },
  { file: 'Dockerfile.instruction-order.positive', engineRuleId: 'DL3061' },
  { file: 'Dockerfile.pin-go.positive', engineRuleId: 'DL3062' },
  { file: 'Dockerfile.reserved-stage-name.positive', engineRuleId: 'DL3063' },
  { file: 'Dockerfile.redundant-platform.positive', engineRuleId: 'DL3065' },
  { file: 'Dockerfile.copy-whole-filesystem.positive', engineRuleId: 'DL3067' },
  { file: 'Dockerfile.maintainer-deprecated.positive', engineRuleId: 'DL4000' },
  { file: 'Dockerfile.multiple-cmd.positive', engineRuleId: 'DL4003' },
  { file: 'Dockerfile.multiple-entrypoint.positive', engineRuleId: 'DL4004' },
  { file: 'Dockerfile.shell-via-symlink.positive', engineRuleId: 'DL4005' },
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
  await expect(runOn('Dockerfile.clean.negative')).resolves.toEqual([])
})

test.skipIf(noBinary)('dL3025 is filtered on HEALTHCHECK, and hadolint really does report it', async () => {
  const raw = await rawCodes('Dockerfile.healthcheck.filtered')
  expect(raw).toContain('DL3025')
  await expect(runOn('Dockerfile.healthcheck.filtered')).resolves.toEqual([])
})

test.skipIf(noBinary)('hadolint reports nothing at all about a Dockerfile with no USER', async () => {
  await expect(rawCodes('Dockerfile.no-user.excluded')).resolves.toEqual([])
})

test.skipIf(noBinary)('dL3066 fires on a named non-root user, and is excluded for exactly that reason', async () => {
  await expect(rawCodes('Dockerfile.named-user.excluded')).resolves.toContain('DL3066')
  await expect(runOn('Dockerfile.named-user.excluded')).resolves.toEqual([])
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
  let stdout: string
  try {
    ;({ stdout } = await run(installed?.command ?? 'hadolint', ['-f', 'json', '--no-fail', join(root, file)], { encoding: 'utf8' }))
  } catch (error) {
    stdout = (error as { stdout?: string }).stdout ?? ''
  }
  return (JSON.parse(stdout.trim() || '[]') as { code: string }[]).map((f) => f.code)
}
