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
  // Every test here drives the real `check.run`, which sets `process.exitCode` as a side
  // effect. Restoring it prevents a test's simulated exit code from leaking into vitest's own
  // process and silently corrupting the exit status of the actual `pnpm test` invocation.
  process.exitCode = originalExitCode
  await rm(dir, { recursive: true, force: true })
})

/**
 * Gives the dependency-security engine an advisory snapshot, so what these tests describe is the
 * tool rather than whether this machine has ever run `sgate engines install advisories`. Same
 * discipline as the actionlint stub below: construct the premise, never inherit it from a laptop.
 *
 * Dated now, deliberately. A snapshot past a week old reports its own age as a finding — that is the
 * engine working correctly, and here it would be indistinguishable from the regressions these tests
 * exist to catch. The tables are empty because none of these fixtures has a lockfile to match
 * against; what is being constructed is availability, not findings.
 */
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
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
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
  // Nothing about *this* run is a config error: there is no config file in `dir`, so
  // `loadConfig` resolves cleanly. A caller that invokes `check.run` more than once in the same
  // process (a test harness, an embedding tool) without spawning a fresh process each time must
  // not have a leftover `process.exitCode` from an unrelated earlier call change this run's
  // outcome.
  process.exitCode = EXIT_CODES.config
  await runCheck()
  expect(process.exitCode).toBe(EXIT_CODES.clean)
})

test('a config diagnostic reports the config file as repo-relative, not the absolute path loadConfig resolved', async () => {
  // `loadConfig` (and the `findConfigFile` it wraps) always resolves an absolute path — it walks
  // up from `cwd` until it finds one. Writing a real config file on disk here, unlike the other
  // tests in this file, is exactly what makes `loadConfig` take that path instead of returning
  // `null`. The bad rule key deterministically triggers `config.dead-override` regardless of which
  // engines are registered — `extends: ['recommended']` alone used to be enough (the registry's
  // oxlint/eslint tier overlap on `dead-code.unused-variable` fired unconditionally), but fix 1
  // made arbitration drop a registry entry whose engine never participates in the run, so a plain
  // `recommended` config with only oxlint registered no longer produces any `config.*` diagnostic.
  await writeFile(
    join(dir, 'slop-gate.config.ts'),
    "export default { extends: ['recommended'], rules: { 'oxlint/no-such-rule': 'error' } }\n",
  )

  const output = await runCheckCapturingStdout()
  const report = JSON.parse(output) as { diagnostics: Array<{ concept: string; file: string }> }
  const configDiagnostics = report.diagnostics.filter((d) => d.concept.startsWith('config.'))

  expect(configDiagnostics.length).toBeGreaterThan(0)
  for (const diagnostic of configDiagnostics) {
    expect(diagnostic.file).not.toMatch(/^\/|^[a-zA-Z]:[\\/]/)
  }
})

test('produces no config diagnostics when no config file exists and only oxlint is registered', async () => {
  // Supersedes the old "names no file when no config file exists" regression test. Before fix 1,
  // `DEFAULT_CONFIG = { extends: ['recommended'] }` unconditionally triggered `config.rule-overlap`
  // (the registry's oxlint/eslint tier overlap fired regardless of which engines actually ran), and
  // that diagnostic used to be wrongly attributed to the literal default `slop-gate.config.ts` — a
  // path that does not exist anywhere in `dir` (docs/superpowers/specs/2026-07-31-m0-followups.md,
  // "Found by first real-world use"). Fix 1 removes the trigger itself: with no config file and no
  // overrides, arbitration only ever considers oxlint (the one engine `check.ts` registers), so
  // there is no overlap to suppress and nothing left to attribute to a `file: null` diagnostic at
  // all. The null-file attribution contract itself is still covered directly against `streamCheck`
  // by `packages/core/src/run/check.test.ts` ("a config diagnostic is attributed to no file..."),
  // using a bad rule key rather than the now-removed unconditional overlap.
  const output = await runCheckCapturingStdout()
  const report = JSON.parse(output) as { diagnostics: Array<{ concept: string }> }

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
  // Not "no findings. Nothing was omitted." — this fixture is a bare temp directory with no
  // `tsconfig.json`, and `types.type-error` is in `recommended`, so `tsc` is a genuine coverage gap
  // here. The agent report saying so is the point of the format: a clean section that is clean only
  // because an engine could not run must never read as clean.
  expect(output).toContain('coverage: 1 engine could not run (see INCOMPLETE above)')
  expect(output).toContain('unchecked: types.type-error')
})

test('--max-tokens reaches the agent reporter and bounds what it prints', async () => {
  await writeFile(join(dir, 'a.ts'), 'export const a = { ...{ b: 1 } }\nexport const c = { ...{ d: 2 } }\n')

  const unbounded = await runCheckCapturingStdout({ format: 'agent' })
  const bounded = await runCheckCapturingStdout({ format: 'agent', 'max-tokens': '200' })

  // Deliberately not a hard-coded finding count: this test is about `--max-tokens` bounding the
  // report, and coupling it to how many findings `recommended` happens to produce made it fail every
  // time the preset grew. What must hold is that the unbounded run omits nothing.
  expect(unbounded).toContain('findings shown, 0 omitted (no --max-tokens set).')
  expect(bounded).toContain('(--max-tokens 200)')
  expect(bounded).toContain('omitted')
})

test('rejects a --max-tokens that is not a positive integer instead of ignoring it', async () => {
  // Silently falling back to "no limit" hands an agent a report far larger than the context it
  // asked to fit; silently coercing to 0 hands it one with no findings in it. Both are worse than
  // refusing, so the flag is validated before any engine runs.
  // Accumulated into a local rather than asserted off the spy: `mockRestore` clears the recorded
  // calls, so a `toHaveBeenCalledWith` after the `finally` reads an empty history and passes or
  // fails for the wrong reason.
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
  // Unlike `--max-tokens`, `0` is the flag's most useful value — it is what our own CI gate passes.
  expect(parseMaxWarnings('0')).toBe(0)
  expect(parseMaxWarnings('25')).toBe(25)
  for (const raw of ['-1', '1.5', 'abc', '', '1e400', 'Infinity', 'NaN']) expect(parseMaxWarnings(raw), raw).toBe('invalid')
})

test('rejects a --max-warnings that is not a non-negative integer instead of ignoring it', async () => {
  // The silent-drop version of this exited 0 on `--max-warnings abc` with nothing on stderr, which
  // is a CI gate that reports success because its own threshold failed to parse.
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
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
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
  // Regression test: this must go through citty's own `parseArgs`, not a hand-built `args`
  // object like the tests above use. citty treats any raw `--no-X` token as "negate X" before
  // its parser ever looks at the arg definitions, regardless of whether an arg literally named
  // `no-X` exists. An arg previously named `no-cache` was silently un-settable from the command
  // line for exactly this reason: `--no-cache` negated a nonexistent `cache` flag instead, and
  // `no-cache` kept its `false` default forever, so `sgate check --no-cache` never actually
  // bypassed the cache. Hand-constructing `{ 'no-cache': true }` in the tests above would never
  // have exposed that: it skips the parser and lands directly on the field the bug prevented
  // `--no-cache` from ever reaching.
  const argsDef = check.args as never
  expect(parseArgs([], argsDef).cache).toBe(true)
  expect(parseArgs(['--no-cache'], argsDef).cache).toBe(false)
  expect(parseArgs(['--cache'], argsDef).cache).toBe(true)
})

test('--require-engines is off unless asked for, and reaches the command through the real argv parser', () => {
  const argsDef = check.args as never
  expect(parseArgs([], argsDef)['require-engines']).toBe(false)
  expect(parseArgs(['--require-engines'], argsDef)['require-engines']).toBe(true)
})

test('--require-engines on a fully equipped machine still exits clean', async () => {
  // The direction that is cheap to get wrong: the flag must add no failure of its own when nothing
  // is missing. The failing direction is `exit-codes.test.ts`'s, which can supply an absent engine
  // directly, and the companion test below, which drives the real resolver.
  //
  // **The premise is constructed, not assumed.** This test used to be written as "no engine in
  // `defaultEngines` declares `availability`, so nothing can be missing", and that stopped being
  // true the moment actionlint was registered — after which it passed on a developer machine with
  // actionlint installed and failed on every CI runner without it, which is a test asserting the
  // state of a laptop. `SLOP_GATE_ACTIONLINT_PATH` is what the adapter's own resolver reads first,
  // so pointing it at a file that exists makes the engine available through the real code path with
  // nothing downloaded. The file is never executed: `actionlint` is scoped to `github-workflow` and
  // the fixture directory contains no workflow, so arbitration never elects it and `run` is never
  // reached.
  // **The tsc half of the same premise, and it takes two things, not one.** `tsc` is unavailable
  // without a project *and* without a `typescript` of the project's own — this fixture is a bare
  // temp directory under `os.tmpdir()`, which has neither. Supplying only the tsconfig is what shipped
  // first, and it passed on macOS and Linux for the wrong reason: `resolveTscBinary` fell through to a
  // bare `tsc` on `PATH`, which a POSIX CI runner happens to have and Windows cannot execute by bare
  // name. Both halves are therefore constructed here, and the linked `typescript` is the workspace's
  // own — a junction rather than a symlink so it needs no elevation on Windows.
  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noEmit: true }, include: ['*.ts'] }))
  const typescriptDir = dirname(createRequire(import.meta.url).resolve('typescript/package.json'))
  await mkdir(join(dir, 'node_modules'), { recursive: true })
  await symlink(typescriptDir, join(dir, 'node_modules', 'typescript'), 'junction')

  // hadolint is the same shape as actionlint and needs the same construction: scoped to
  // `dockerfile`, so the fixture never elects it, but `--require-engines` still counts it absent.
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

    // Asserted before the exit code, and deliberately: `expected 3 to be +0` is the least
    // informative thing this run knows, and it has now sent two people hunting through two
    // different engines. Both banners name the engine, so a regression fails with the engine in
    // the message instead of a bare number.
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
  // The other half, and the one CI is uniquely good at: every runner is a clean machine with no
  // actionlint on it, so this is the only place the absent-binary path meets a genuinely absent
  // binary rather than an injected stub. Constructed here too, so it holds on a developer machine
  // that does have actionlint installed.
  // Absence is forced through `SLOP_GATE_ACTIONLINT_PATH` naming a file that does not exist —
  // documented to resolve to nothing rather than fall through to `PATH`, so a typo in an override
  // can never silently run a different binary. Emptying `PATH` instead would have worked here too,
  // and is what `engine-actionlint`'s own availability test does, but this test drives the *whole*
  // engine set through the real `check.run`, and taking `PATH` away from oxlint, tsc and knip on the
  // way to making a point about actionlint is a way to fail on one runner and not another.
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
    timings: { startupMs: number; phases: Array<{ name: string; durationMs: number }>; unattributedMs: number }
  }

  // The four things that are not engine work, all accounted for: node boot, the module graph and
  // `loadCliConfig` are `startupMs` (the CLI passes `startedAt: 0`), and the inventory walk is a phase.
  expect(report.timings.startupMs).toBeGreaterThan(0)
  expect(report.timings.phases.map((phase) => phase.name)).toContain('discover')

  const summed =
    report.timings.startupMs +
    report.timings.phases.reduce((total, phase) => total + phase.durationMs, 0) +
    report.timings.unattributedMs
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
  // The report itself is untouched: that is the property the note exists to protect.
  expect(output).toContain('slop-gate agent report v1')
  expect(output).not.toContain('unattributed')
})
