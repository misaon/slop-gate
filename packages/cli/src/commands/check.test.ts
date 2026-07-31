import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'citty'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { EXIT_CODES } from '../exit-codes.ts'
import { check } from './check.ts'

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

async function runCheckCapturingStdout(): Promise<string> {
  let output = ''
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output += chunk
    return true
  })
  try {
    await check.run!({
      args: { format: 'json', cwd: dir, cache: false, _: [] },
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
  // `null`. `extends: ['recommended']` plus any `.ts` file also unconditionally triggers
  // `config.rule-overlap` (the registry's oxlint/eslint tier overlap on `dead-code.unused-variable`
  // fires regardless of which engines are actually registered), so this fixture needs no more setup
  // than a config file to reproduce the failure the reviewer measured against the real repo.
  await writeFile(join(dir, 'slop-gate.config.ts'), "export default { extends: ['recommended'] }\n")

  const output = await runCheckCapturingStdout()
  const report = JSON.parse(output) as { diagnostics: Array<{ concept: string; file: string }> }
  const configDiagnostics = report.diagnostics.filter((d) => d.concept.startsWith('config.'))

  expect(configDiagnostics.length).toBeGreaterThan(0)
  for (const diagnostic of configDiagnostics) {
    expect(diagnostic.file).not.toMatch(/^\/|^[a-zA-Z]:[\\/]/)
  }
})

test('a config diagnostic names no file when no config file exists', async () => {
  // Bug reproduction (docs/superpowers/specs/2026-07-31-m0-followups.md, "Found by first
  // real-world use"): with no config file anywhere in `dir`, `check.run` falls back to
  // `DEFAULT_CONFIG = { extends: ['recommended'] }`, which — like the test above notes —
  // unconditionally triggers `config.rule-overlap`. Before the fix, that diagnostic was attributed
  // to the literal default `slop-gate.config.ts`, a path that does not exist anywhere in `dir`.
  const output = await runCheckCapturingStdout()
  const report = JSON.parse(output) as { diagnostics: Array<{ concept: string; file: string | null }> }
  const configDiagnostics = report.diagnostics.filter((d) => d.concept.startsWith('config.'))

  expect(configDiagnostics.length).toBeGreaterThan(0)
  for (const diagnostic of configDiagnostics) {
    expect(diagnostic.file).toBeNull()
  }
})

test('removes its SIGINT/SIGTERM listeners after each run so repeated calls do not leak them', async () => {
  const before = { sigint: process.listenerCount('SIGINT'), sigterm: process.listenerCount('SIGTERM') }
  await runCheck()
  await runCheck()
  expect(process.listenerCount('SIGINT')).toBe(before.sigint)
  expect(process.listenerCount('SIGTERM')).toBe(before.sigterm)
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
