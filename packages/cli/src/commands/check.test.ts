import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseArgs } from 'citty'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  SNAPSHOT_FORMAT_VERSION,
  SNAPSHOT_PATH_ENV,
  writeAdvisorySnapshot,
} from '@misaon/slop-gate-engine-deps-security'
import { EXIT_CODES } from '../exit-codes.ts'
import { check, parseMaxTokens, parseMaxWarnings } from './check.ts'

let dir: string
let originalExitCode: typeof process.exitCode
let originalSnapshotPath: string | undefined

beforeEach(async () => {
  originalExitCode = process.exitCode
  dir = await mkdtemp(join(tmpdir(), 'sgate-cli-check-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  await writeFile(join(dir, 'clean.ts'), 'export const a = 1\n')
  originalSnapshotPath = process.env[SNAPSHOT_PATH_ENV]
  process.env[SNAPSHOT_PATH_ENV] = await installAdvisoryFixture(dir)
})

afterEach(async () => {
  if (originalSnapshotPath === undefined) delete process.env[SNAPSHOT_PATH_ENV]
  else process.env[SNAPSHOT_PATH_ENV] = originalSnapshotPath
  process.exitCode = originalExitCode
  await rm(dir, { recursive: true, force: true })
})

async function installAdvisoryFixture(root: string): Promise<string> {
  const directory = join(root, '.advisory-snapshot')
  await writeAdvisorySnapshot(
    directory,
    {
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      source: 'fixture://advisories',
      fetchedAt: new Date().toISOString(),
      digest: 'f'.repeat(64),
      vulnerableAdvisories: 1,
      maliciousAdvisories: 0,
    },
    { vulnerable: {}, malicious: {} },
  )
  return directory
}

async function runCheck(): Promise<void> {
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  try {
    await check.run!({
      args: { format: 'json', cwd: dir, cache: false, _: [] },
      rawArgs: [],
      cmd: check,
    } as never)
  } finally {
    stdout.mockRestore()
  }
}

async function runCheckCapturingStdout(args: Record<string, unknown> = {}): Promise<string> {
  let output = ''
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output += chunk
    return true
  })
  try {
    await check.run!({
      args: { format: 'json', cwd: dir, cache: false, _: [], ...args },
      rawArgs: [],
      cmd: check,
    } as never)
  } finally {
    stdout.mockRestore()
  }
  return output
}

test('does not stay on a stale exit code left over from a previous call', async () => {
  process.exitCode = EXIT_CODES.config
  await runCheck()
  expect(process.exitCode).toBe(EXIT_CODES.clean)
})

test('a config diagnostic reports the config file as repo-relative, not the absolute path loadConfig resolved', async () => {
  await writeFile(
    join(dir, 'slop-gate.config.ts'),
    "export default { extends: ['recommended'], rules: { 'oxlint/no-such-rule': 'error' } }\n",
  )

  const output = await runCheckCapturingStdout()
  const report = JSON.parse(output) as { diagnostics: { concept: string; file: string }[] }
  const configDiagnostics = report.diagnostics.filter((d) => d.concept.startsWith('config.'))

  expect(configDiagnostics.length).toBeGreaterThan(0)
  for (const diagnostic of configDiagnostics) {
    expect(diagnostic.file).not.toMatch(/^\/|^[a-zA-Z]:[\\/]/)
  }
})

test('produces no config diagnostics when no config file exists and only oxlint is registered', async () => {
  const output = await runCheckCapturingStdout()
  const report = JSON.parse(output) as { diagnostics: { concept: string }[] }

  expect(report.diagnostics.some((d) => d.concept.startsWith('config.'))).toBe(false)
})

test('removes its SIGINT/SIGTERM listeners after each run so repeated calls do not leak them', async () => {
  const before = { sigint: process.listenerCount('SIGINT'), sigterm: process.listenerCount('SIGTERM') }
  await runCheck()
  await runCheck()
  expect(process.listenerCount('SIGINT')).toBe(before.sigint)
  expect(process.listenerCount('SIGTERM')).toBe(before.sigterm)
})

test('accepts the agent format and reports its coverage even on a clean repository', async () => {
  const output = await runCheckCapturingStdout({ format: 'agent' })

  expect(output).toContain('slop-gate agent report v1')
  expect(output).toContain('coverage: 1 engine could not run (see INCOMPLETE above)')
  expect(output).toContain('unchecked: types.type-error')
})

test('--max-tokens reaches the agent reporter and bounds what it prints', async () => {
  await writeFile(join(dir, 'a.ts'), 'export const a = { ...{ b: 1 } }\nexport const c = { ...{ d: 2 } }\n')

  const unbounded = await runCheckCapturingStdout({ format: 'agent' })
  const bounded = await runCheckCapturingStdout({ format: 'agent', 'max-tokens': '200' })

  expect(unbounded).toContain('findings shown, 0 omitted (no --max-tokens set).')
  expect(bounded).toContain('(--max-tokens 200)')
  expect(bounded).toContain('omitted')
})

test('rejects a --max-tokens that is not a positive integer instead of ignoring it', async () => {
  let written = ''
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    written += chunk
    return true
  })
  try {
    await check.run!({
      args: { format: 'agent', cwd: dir, cache: false, 'max-tokens': 'lots', _: [] },
      rawArgs: [],
      cmd: check,
    } as never)
  } finally {
    stderr.mockRestore()
  }

  expect(process.exitCode).toBe(EXIT_CODES.config)
  expect(written).toContain('--max-tokens must be a positive integer, got: lots')
})

test('parseMaxTokens accepts a positive integer and refuses everything else', () => {
  expect(parseMaxTokens(undefined)).toBeUndefined()
  expect(parseMaxTokens('4000')).toBe(4000)
  for (const raw of ['0', '-1', '1.5', 'lots', '', '1e400', 'Infinity']) expect(parseMaxTokens(raw), raw).toBe('invalid')
})

test('parseMaxWarnings accepts zero and any count above it, and refuses everything else', () => {
  expect(parseMaxWarnings(undefined)).toBeUndefined()
  expect(parseMaxWarnings('0')).toBe(0)
  expect(parseMaxWarnings('25')).toBe(25)
  for (const raw of ['-1', '1.5', 'abc', '', '1e400', 'Infinity', 'NaN']) expect(parseMaxWarnings(raw), raw).toBe('invalid')
})

test('rejects a --max-warnings that is not a non-negative integer instead of ignoring it', async () => {
  let written = ''
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    written += chunk
    return true
  })
  try {
    await check.run!({
      args: { format: 'json', cwd: dir, cache: false, 'max-warnings': 'abc', _: [] },
      rawArgs: [],
      cmd: check,
    } as never)
  } finally {
    stderr.mockRestore()
  }

  expect(process.exitCode).toBe(EXIT_CODES.config)
  expect(written).toContain('--max-warnings must be a non-negative integer, got: abc')
})

test('a negative --max-warnings is refused rather than passed through as an always-failing threshold', async () => {
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  try {
    await check.run!({
      args: { format: 'json', cwd: dir, cache: false, 'max-warnings': '-1', _: [] },
      rawArgs: [],
      cmd: check,
    } as never)
  } finally {
    stderr.mockRestore()
  }

  expect(process.exitCode).toBe(EXIT_CODES.config)
})

test('--no-cache reaches the command as cache: false through citty real argv parser', () => {
  const argsDef = check.args as never
  expect(parseArgs([], argsDef)['cache']).toBe(true)
  expect(parseArgs(['--no-cache'], argsDef)['cache']).toBe(false)
  expect(parseArgs(['--cache'], argsDef)['cache']).toBe(true)
})

test('--require-engines is off unless asked for, and reaches the command through the real argv parser', () => {
  const argsDef = check.args as never
  expect(parseArgs([], argsDef)['require-engines']).toBe(false)
  expect(parseArgs(['--require-engines'], argsDef)['require-engines']).toBe(true)
})

test('--require-engines on a fully equipped machine still exits clean', async () => {
  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noEmit: true }, include: ['*.ts'] }))
  const typescriptDir = dirname(createRequire(import.meta.url).resolve('typescript/package.json'))
  await mkdir(join(dir, 'node_modules'), { recursive: true })
  await symlink(typescriptDir, join(dir, 'node_modules', 'typescript'), 'junction')

  const stub = join(dir, 'actionlint-stub')
  const hadolintStub = join(dir, 'hadolint-stub')
  await writeFile(stub, '')
  await writeFile(hadolintStub, '')
  const previous = process.env['SLOP_GATE_ACTIONLINT_PATH']
  const previousHadolint = process.env['SLOP_GATE_HADOLINT_PATH']
  process.env['SLOP_GATE_ACTIONLINT_PATH'] = stub
  process.env['SLOP_GATE_HADOLINT_PATH'] = hadolintStub
  try {
    const output = await runCheckCapturingStdout({ 'require-engines': true })

    expect(output).not.toMatch(/COVERAGE GAP|ENGINE FAILED/)
    expect(process.exitCode).toBe(EXIT_CODES.clean)
  } finally {
    if (previous === undefined) delete process.env['SLOP_GATE_ACTIONLINT_PATH']
    else process.env['SLOP_GATE_ACTIONLINT_PATH'] = previous
    if (previousHadolint === undefined) delete process.env['SLOP_GATE_HADOLINT_PATH']
    else process.env['SLOP_GATE_HADOLINT_PATH'] = previousHadolint
  }
})

test('--require-engines on a machine missing an optional engine exits 3 and names it', async () => {
  const saved = process.env['SLOP_GATE_ACTIONLINT_PATH']
  let written = ''
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    written += chunk
    return true
  })
  try {
    process.env['SLOP_GATE_ACTIONLINT_PATH'] = join(dir, 'nothing-here', 'actionlint')

    await runCheckCapturingStdout({ 'require-engines': true })
    expect(process.exitCode).toBe(EXIT_CODES.engine)
    expect(written).toContain('--require-engines: `actionlint` is not installed')
    expect(written).toContain('sgate engines install actionlint')
  } finally {
    stderr.mockRestore()
    if (saved === undefined) delete process.env['SLOP_GATE_ACTIONLINT_PATH']
    else process.env['SLOP_GATE_ACTIONLINT_PATH'] = saved
  }
})

test('--timing puts the breakdown in the json document, and its rows account for the reported duration', async () => {
  const output = await runCheckCapturingStdout({ timing: true })
  const report = JSON.parse(output) as {
    stats: { durationMs: number }
    timings: { startupMs: number; phases: { name: string; durationMs: number }[]; unattributedMs: number; busyMs: number }
  }

  expect(report.timings.startupMs).toBeGreaterThan(0)
  expect(report.timings.phases.map((phase) => phase.name)).toContain('discover')

  const summed = report.timings.startupMs + report.timings.busyMs + report.timings.unattributedMs
  expect(Math.abs(summed - report.stats.durationMs)).toBeLessThan(1)
})

test('a run without --timing produces no timings key, so the flag is what costs anything', async () => {
  const output = await runCheckCapturingStdout()

  expect('timings' in (JSON.parse(output) as object)).toBe(false)
})

test('--timing prints the breakdown under the pretty footer', async () => {
  const output = await runCheckCapturingStdout({ format: 'pretty', timing: true })

  expect(output.indexOf('timing')).toBeGreaterThan(output.lastIndexOf('╰'))
  expect(output).toContain('startup')
  expect(output).toContain('unattributed')
})

test('--timing with --format=agent says it is ignored rather than measuring a run it cannot print', async () => {
  let written = ''
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    written += chunk
    return true
  })
  let output = ''
  try {
    output = await runCheckCapturingStdout({ format: 'agent', timing: true })
  } finally {
    stderr.mockRestore()
  }

  expect(written).toContain('--timing is ignored by `--format=agent`')
  expect(output).toContain('slop-gate agent report v1')
  expect(output).not.toContain('unattributed')
})
