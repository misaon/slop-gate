import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'citty'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { EXIT_CODES } from '../exit-codes.ts'
import { check, parseMaxTokens } from './check.ts'

let dir: string
let originalExitCode: typeof process.exitCode

beforeEach(async () => {
  originalExitCode = process.exitCode
  dir = await mkdtemp(join(tmpdir(), 'sgate-cli-check-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  await writeFile(join(dir, 'clean.ts'), 'export const a = 1\n')
})

afterEach(async () => {
  // Every test here drives the real `check.run`, which sets `process.exitCode` as a side
  // effect. Restoring it prevents a test's simulated exit code from leaking into vitest's own
  // process and silently corrupting the exit status of the actual `pnpm test` invocation.
  process.exitCode = originalExitCode
  await rm(dir, { recursive: true, force: true })
})

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
  expect(output).toContain('coverage: no findings. Nothing was omitted.')
})

test('--max-tokens reaches the agent reporter and bounds what it prints', async () => {
  await writeFile(join(dir, 'a.ts'), 'export const a = { ...{ b: 1 } }\nexport const c = { ...{ d: 2 } }\n')

  const unbounded = await runCheckCapturingStdout({ format: 'agent' })
  const bounded = await runCheckCapturingStdout({ format: 'agent', 'max-tokens': '200' })

  expect(unbounded).toContain('coverage: 2 of 2 findings shown, 0 omitted (no --max-tokens set).')
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
  // The direction that is cheap to get wrong: nothing in `defaultEngines` declares `availability`
  // today, so this asserts the flag adds no failure of its own when nothing is missing. The failing
  // direction is `exit-codes.test.ts`'s, which can supply an absent engine directly.
  await runCheckCapturingStdout({ 'require-engines': true })
  expect(process.exitCode).toBe(EXIT_CODES.clean)
})
