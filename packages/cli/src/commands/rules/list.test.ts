import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { RulesListEntry } from '@misaon/slop-gate-core'
import { list } from './list.ts'

let dir: string
let originalExitCode: typeof process.exitCode

beforeEach(async () => {
  originalExitCode = process.exitCode
  dir = await mkdtemp(join(tmpdir(), 'sgate-cli-rules-list-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  await writeFile(join(dir, 'clean.ts'), 'export const a = 1\n')
})

afterEach(async () => {
  process.exitCode = originalExitCode
  await rm(dir, { recursive: true, force: true })
})

async function runListCapturingStdout(args: Record<string, unknown> = {}): Promise<string> {
  let output = ''
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output += chunk
    return true
  })
  try {
    await list.run!({ args: { format: 'json', cwd: dir, _: [], ...args }, rawArgs: [], cmd: list } as never)
  } finally {
    stdout.mockRestore()
  }
  return output
}

test('lists the recommended preset\'s enabled concepts as json, each with a level and a source', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), "export default { extends: ['recommended'] }\n")
  const output = await runListCapturingStdout()
  const parsed = JSON.parse(output) as { version: number; entries: RulesListEntry[] }

  expect(parsed.version).toBe(1)
  expect(parsed.entries.length).toBeGreaterThan(0)
  const debuggerEntry = parsed.entries.find((entry) => entry.concept === 'correctness.no-debugger')
  expect(debuggerEntry).toMatchObject({ level: 'error', owner: { engine: 'oxlint', engineRuleId: 'no-debugger' } })
  expect(debuggerEntry?.enablement.baseProvenance[0]).toMatchObject({ layer: 'preset', source: 'recommended' })

  // `recommended` genuinely includes plenty of JSX/framework-scoped concepts a bare TypeScript
  // fixture repo never exercises — real, end-to-end confirmation of the distinction found running
  // this against this repository itself (see RulesListEntry.languageMismatch's own doc comment).
  const languageMismatched = parsed.entries.filter((entry) => entry.languageMismatch)
  expect(languageMismatched.length).toBeGreaterThan(0)
  for (const entry of languageMismatched) expect(entry.uncovered).toBe(false)
})

test('filters by --only, matching a real registry concept via glob', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), "export default { extends: ['recommended'] }\n")
  const output = await runListCapturingStdout({ only: 'dead-code.*' })
  const parsed = JSON.parse(output) as { entries: RulesListEntry[] }

  expect(parsed.entries.length).toBeGreaterThan(0)
  for (const entry of parsed.entries) expect(entry.concept.startsWith('dead-code.')).toBe(true)
})

test('filters to a specific engine via --engine', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), "export default { extends: ['recommended'] }\n")
  const output = await runListCapturingStdout({ engine: 'oxlint' })
  const parsed = JSON.parse(output) as { entries: RulesListEntry[] }

  expect(parsed.entries.length).toBeGreaterThan(0)
  for (const entry of parsed.entries) expect(entry.owner?.engine).toBe('oxlint')
})

test('rejects an unknown --engine value as a config error, before touching the filesystem resolution', async () => {
  const output = await runListCapturingStdout({ engine: 'not-a-real-engine' })
  expect(output).toBe('')
  expect(process.exitCode).toBe(2)
})

test('rejects an unknown --format the same way check does', async () => {
  let stderr = ''
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += chunk
    return true
  })
  try {
    await list.run!({ args: { format: 'yaml', cwd: dir, _: [] }, rawArgs: [], cmd: list } as never)
  } finally {
    spy.mockRestore()
  }
  expect(stderr).toContain('unknown format')
  expect(process.exitCode).toBe(2)
})
