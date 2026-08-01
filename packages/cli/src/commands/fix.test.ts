import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { FixResult } from '@misaon/slop-gate-core'
import { EXIT_CODES } from '../exit-codes.ts'
import { fix, fixExitCode, renderFixSummary } from './fix.ts'

const exec = promisify(execFile)

let dir: string
let originalExitCode: typeof process.exitCode

const result = (over: Partial<FixResult> = {}): FixResult => ({
  tier: 'safe',
  dryRun: false,
  files: [],
  rules: [],
  oscillations: [],
  passes: 1,
  truncated: false,
  initial: { findings: 0, withFix: { safe: 0, suggested: 0, unsafe: 0 } },
  skipped: { aboveTier: 0, outsideInventory: 0, overlap: 0, outOfRange: 0 },
  engineFailures: [],
  ...over,
})

// --- Summary rendering ---------------------------------------------------------------------

test('a refusal prints only the refusal, never a summary implying a run happened', () => {
  const output = renderFixSummary(
    result({ refusal: { reason: 'dirty-worktree', message: 'The git worktree has uncommitted changes.' } }),
  )

  expect(output).toBe('sgate fix refused to run.\nThe git worktree has uncommitted changes.\n')
  expect(output).not.toContain('finding')
})

test('a clean run still reports how much was fixable, which is the answer to "why nothing happened"', () => {
  const output = renderFixSummary(result({ initial: { findings: 65, withFix: { safe: 0, suggested: 0, unsafe: 3 } } }))

  expect(output).toContain('nothing to fix at the `safe` tier')
  expect(output).toContain('65 findings on the first pass; fixable: 0 safe, 0 suggested, 3 unsafe.')
})

test('a run that changed files lists both the files and the rules applied', () => {
  const output = renderFixSummary(
    result({
      files: [{ file: 'src/a.ts', rules: ['oxlint/prefer-const'], edits: 2, diff: '' }],
      rules: [{ ruleId: 'oxlint/prefer-const', count: 2 }],
      initial: { findings: 2, withFix: { safe: 2, suggested: 0, unsafe: 0 } },
    }),
  )

  expect(output).toContain('sgate fix changed 1 file (2 edits, tier `safe`)')
  expect(output).toContain('src/a.ts — 2 edits')
  expect(output).toContain('oxlint/prefer-const — 2')
})

test('a dry run says "would change" and prints the diff ahead of the summary', () => {
  const diff = '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n-let a = 1\n+const a = 1\n'
  const output = renderFixSummary(
    result({
      dryRun: true,
      truncated: true,
      files: [{ file: 'src/a.ts', rules: ['oxlint/prefer-const'], edits: 1, diff }],
      rules: [{ ruleId: 'oxlint/prefer-const', count: 1 }],
    }),
  )

  expect(output.indexOf(diff)).toBeLessThan(output.indexOf('would change'))
  expect(output).toContain('--dry-run shows the first pass only')
})

test('the formatting gap is stated whenever a file changed', () => {
  const changed = renderFixSummary(result({ files: [{ file: 'a.ts', rules: [], edits: 1, diff: '' }] }))
  expect(changed).toContain('Formatting is not run afterwards')

  expect(renderFixSummary(result())).not.toContain('Formatting is not run afterwards')
})

test('an oscillation is printed with its message and its help', () => {
  const output = renderFixSummary(
    result({
      oscillations: [
        {
          concept: 'config.fix-oscillation',
          ruleId: 'slop-gate/config.fix-oscillation',
          engine: 'slop-gate',
          severity: 'error',
          message: '`oxlint/a` and `oxlint/b` rewrite the same code in src/a.ts',
          file: 'src/a.ts',
          range: { start: 0, end: 0 },
          position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
          help: 'Turn one of them off.',
          fingerprint: 'fp',
        },
      ],
    }),
  )

  expect(output).toContain('config.fix-oscillation: `oxlint/a` and `oxlint/b` rewrite the same code')
  expect(output).toContain('Turn one of them off.')
})

test('dropped edits are accounted for rather than silently absent', () => {
  const output = renderFixSummary(result({ skipped: { aboveTier: 0, outsideInventory: 1, overlap: 2, outOfRange: 3 } }))

  expect(output).toContain('2 lost an overlap')
  expect(output).toContain('3 were out of range')
  expect(output).toContain('1 named a file outside the inventory')
})

test('a truncated real run tells the user to run again', () => {
  const output = renderFixSummary(result({ truncated: true, passes: 10 }))
  expect(output).toContain('Stopped after 10 passes without reaching a fixed point')
})

// --- Exit codes ----------------------------------------------------------------------------

test('a clean fix run exits 0 even though it changed files', () => {
  expect(fixExitCode(result({ files: [{ file: 'a.ts', rules: [], edits: 1, diff: '' }] }))).toBe(EXIT_CODES.clean)
})

test('a refusal exits with the config code, and an engine failure with the engine code', () => {
  expect(fixExitCode(result({ refusal: { reason: 'dirty-worktree', message: '' } }))).toBe(EXIT_CODES.config)
  expect(fixExitCode(result({ refusal: { reason: 'no-git', message: '' } }))).toBe(EXIT_CODES.config)
  expect(fixExitCode(result({ refusal: { reason: 'engine-failed', message: '' } }))).toBe(EXIT_CODES.engine)
})

test('an oscillation exits with the findings code', () => {
  expect(fixExitCode(result({ oscillations: [{ concept: 'config.fix-oscillation' } as never] }))).toBe(EXIT_CODES.findings)
})

// --- The real command over a real repository -------------------------------------------------

beforeEach(async () => {
  originalExitCode = process.exitCode
  dir = await mkdtemp(join(tmpdir(), 'sgate-cli-fix-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }))
  await mkdir(join(dir, 'src'), { recursive: true })
})

afterEach(async () => {
  process.exitCode = originalExitCode
  await rm(dir, { recursive: true, force: true })
})

const runFixCommand = async (args: Record<string, unknown>): Promise<string> => {
  let captured = ''
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    captured += String(chunk)
    return true
  })
  try {
    await fix.run!({
      args: { 'dry-run': false, suggest: false, unsafe: false, 'allow-dirty': false, cwd: dir, _: [], ...args },
      rawArgs: [],
      cmd: fix,
    } as never)
  } finally {
    stdout.mockRestore()
  }
  return captured
}

test('refuses to touch a directory that is not a git worktree', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'let z = 3\nexport { z }\n')

  const output = await runFixCommand({})

  expect(output).toContain('refused to run')
  expect(output).toContain('Not a git worktree')
  expect(await readFile(join(dir, 'src/a.ts'), 'utf8')).toBe('let z = 3\nexport { z }\n')
  expect(process.exitCode).toBe(EXIT_CODES.config)
})

test('--dry-run works without git and writes nothing', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'let z = 3\nexport { z }\n')
  await writeFile(join(dir, 'slop-gate.config.ts'), "export default { rules: { 'style.prefer-const': 'error' } }\n")

  const output = await runFixCommand({ 'dry-run': true })

  expect(output).not.toContain('refused to run')
  expect(await readFile(join(dir, 'src/a.ts'), 'utf8')).toBe('let z = 3\nexport { z }\n')
})

test('fixes a real finding in a real git repository, end to end through the real oxlint', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'let z = 3\nexport { z }\n')
  await writeFile(join(dir, 'slop-gate.config.ts'), "export default { rules: { 'style.prefer-const': 'error' } }\n")

  await exec('git', ['init', '-q'], { cwd: dir })
  await exec('git', ['config', 'user.email', 'test@example.test'], { cwd: dir })
  await exec('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await exec('git', ['add', '-A'], { cwd: dir })
  await exec('git', ['commit', '-qm', 'fixture'], { cwd: dir })

  const output = await runFixCommand({})

  expect(await readFile(join(dir, 'src/a.ts'), 'utf8')).toBe('const z = 3\nexport { z }\n')
  expect(output).toContain('oxlint/prefer-const')
  expect(output).toContain('Formatting is not run afterwards')
  expect(process.exitCode).toBe(EXIT_CODES.clean)
})

test('a dirty git repository is refused until --allow-dirty', async () => {
  await writeFile(join(dir, 'src/a.ts'), 'let z = 3\nexport { z }\n')
  await writeFile(join(dir, 'slop-gate.config.ts'), "export default { rules: { 'style.prefer-const': 'error' } }\n")

  await exec('git', ['init', '-q'], { cwd: dir })
  await exec('git', ['config', 'user.email', 'test@example.test'], { cwd: dir })
  await exec('git', ['config', 'user.name', 'Test'], { cwd: dir })
  await exec('git', ['add', '-A'], { cwd: dir })
  await exec('git', ['commit', '-qm', 'fixture'], { cwd: dir })
  await writeFile(join(dir, 'src/a.ts'), 'let z = 3\nlet y = 4\nexport { z, y }\n')

  expect(await runFixCommand({})).toContain('uncommitted changes')
  expect(await readFile(join(dir, 'src/a.ts'), 'utf8')).toBe('let z = 3\nlet y = 4\nexport { z, y }\n')

  await runFixCommand({ 'allow-dirty': true })
  expect(await readFile(join(dir, 'src/a.ts'), 'utf8')).toBe('const z = 3\nconst y = 4\nexport { z, y }\n')
})
