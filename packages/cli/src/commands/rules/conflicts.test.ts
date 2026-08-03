import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { RulesConflicts } from '@misaon/slop-gate-core'
import { RULES_CONFLICTS_JSON_VERSION } from '@misaon/slop-gate-reporters'
import { conflicts } from './conflicts.ts'

let dir: string
let originalExitCode: typeof process.exitCode

beforeEach(async () => {
  originalExitCode = process.exitCode
  dir = await mkdtemp(join(tmpdir(), 'sgate-cli-rules-conflicts-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  await writeFile(join(dir, 'clean.ts'), 'export const a = 1\n')
})

afterEach(async () => {
  process.exitCode = originalExitCode
  await rm(dir, { recursive: true, force: true })
})

async function runConflictsCapturingStdout(): Promise<string> {
  let output = ''
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output += chunk
    return true
  })
  try {
    await conflicts.run!({ args: { format: 'json', cwd: dir, _: [] }, rawArgs: [], cmd: conflicts } as never)
  } finally {
    stdout.mockRestore()
  }
  return output
}

test('reports no overlaps and no dead overrides with only oxlint registered and a clean config', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), "export default { extends: ['recommended'] }\n")
  const output = await runConflictsCapturingStdout()
  const parsed = JSON.parse(output) as { version: number } & RulesConflicts

  expect(parsed.version).toBe(RULES_CONFLICTS_JSON_VERSION)
  expect(parsed.overlaps).toEqual([])
  expect(parsed.deadOverrides).toEqual([])
})

test('reports a dead override for a key naming neither a concept nor a shipped rule', async () => {
  await writeFile(
    join(dir, 'slop-gate.config.ts'),
    "export default { extends: ['recommended'], rules: { 'oxlint/no-such-rule': 'error' } }\n",
  )
  const output = await runConflictsCapturingStdout()
  const parsed = JSON.parse(output) as RulesConflicts

  expect(parsed.deadOverrides).toEqual(['oxlint/no-such-rule'])
})
