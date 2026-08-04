import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { ConceptWhy } from '@misaon/slop-gate-core'
import { why } from './why.ts'

let dir: string
let originalExitCode: typeof process.exitCode

beforeEach(async () => {
  originalExitCode = process.exitCode
  dir = await mkdtemp(join(tmpdir(), 'sgate-cli-rules-why-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  await writeFile(join(dir, 'clean.ts'), 'export const a = 1\n')
  await writeFile(join(dir, 'slop-gate.config.ts'), "export default { extends: ['recommended'] }\n")
})

afterEach(async () => {
  process.exitCode = originalExitCode
  await rm(dir, { recursive: true, force: true })
})

async function runWhyCapturingStdout(concept: string): Promise<string> {
  let output = ''
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output += chunk
    return true
  })
  try {
    await why.run!({ args: { concept, format: 'json', cwd: dir, _: [] }, rawArgs: [], cmd: why } as never)
  } finally {
    stdout.mockRestore()
  }
  return output
}

test('explains the shipped eslint/oxlint overlap: owned by oxlint, eslint ineligible because it never participates', async () => {
  const output = await runWhyCapturingStdout('dead-code.unused-variable')
  const explanation = JSON.parse(output) as ConceptWhy

  expect(explanation.ownership.map((o) => o.owner)).toEqual([{ engine: 'oxlint', engineRuleId: 'no-unused-vars' }])
  expect(explanation.ineligible).toContainEqual({
    concept: 'dead-code.unused-variable',
    candidate: { engine: 'eslint', engineRuleId: '@typescript-eslint/no-unused-vars' },
    reason: 'engine-not-participating',
  })
  expect(explanation.overlaps).toEqual([])
})

test('reports an unknown concept id as a config error, distinct from "not enabled"', async () => {
  const output = await runWhyCapturingStdout('not.a.real.concept')
  const explanation = JSON.parse(output) as ConceptWhy

  expect(explanation.isKnownConcept).toBe(false)
  expect(process.exitCode).toBe(2)
})

test('reports a known but never-enabled concept cleanly, exit code clean', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), 'export default {}\n')
  const output = await runWhyCapturingStdout('correctness.no-debugger')
  const explanation = JSON.parse(output) as ConceptWhy

  expect(explanation.isKnownConcept).toBe(true)
  expect(explanation.enablement.enabled).toBe(false)
  expect(process.exitCode).toBe(originalExitCode)
})
