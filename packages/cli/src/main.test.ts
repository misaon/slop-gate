import { execFile } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from 'vitest'
import { EXIT_CODES } from './exit-codes.ts'

const run = promisify(execFile)
const srcDir = dirname(fileURLToPath(import.meta.url))

// Runs the TypeScript source directly (Node >=24 strips types natively) rather than the built
// `bin/sgate.js` -> `dist/main.js`, so this file needs no prior build of `packages/cli` itself.
// Spawning the real process (rather than importing and calling a function) is essential: it is the
// only way to exercise `process.argv`-driven dispatch and observe the real OS-level exit code, which
// is exactly what is under test.
//
// It is also, now, part of how this repository knows its build works. `main.ts` imports every engine
// package by name through `./engines.ts`, and a spawned child resolves those against real
// `node_modules` — so this suite loads all twelve packages' `dist/index.js` even though the file it
// spawns is source. The root vitest config aliases workspace packages to `src` for in-process tests,
// which a child process cannot see; that comment explains why these spawns must stay spawns. Turning
// this into an in-process import would silently retire the coverage.
const mainPath = join(srcDir, 'main.ts')

async function spawnScript(
  scriptPath: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [scriptPath, ...args], { encoding: 'utf8', env })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string }
    return { code: failure.code ?? -1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
  }
}

async function spawnMain(args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return spawnScript(mainPath, args)
}

test('an unknown subcommand exits with the config code, not the findings code', async () => {
  // Regression test for citty's `runMain`, which used to swallow this exact case: it called
  // `process.exit(1)` directly for any usage error, so a mistyped subcommand looked identical to
  // "the check ran and found real problems" (exit 1) to anything scripting this CLI.
  const { code, stderr } = await spawnMain(['nonexistentcommand'])
  expect(code).toBe(EXIT_CODES.config)
  expect(stderr).toContain('Unknown command')
})

test('no subcommand at all exits with the config code, not the findings code', async () => {
  const { code, stderr } = await spawnMain([])
  expect(code).toBe(EXIT_CODES.config)
  expect(stderr).toContain('No command specified')
})

test('--help lists check and exits clean, without running an actual check', async () => {
  const { code, stdout } = await spawnMain(['--help'])
  expect(code).toBe(EXIT_CODES.clean)
  expect(stdout).toContain('check')
})

test('check --help shows the check-specific usage instead of starting a real check', async () => {
  // Regression test: `runCommand` (used to fix the test above) has no `--help` handling of its
  // own — calling it directly with `['check', '--help']` does not show usage, it starts running
  // `check` for real. `main.ts` must intercept `--help` before reaching `runCommand` at all.
  const { code, stdout } = await spawnMain(['check', '--help'])
  expect(code).toBe(EXIT_CODES.clean)
  expect(stdout).toContain('--format')
  expect(stdout).toContain('--cache')
})

test('--help also lists rules, the new command group', async () => {
  const { code, stdout } = await spawnMain(['--help'])
  expect(code).toBe(EXIT_CODES.clean)
  expect(stdout).toContain('rules')
})

test('rules --help shows the group\'s own subcommands, not check\'s usage', async () => {
  const { code, stdout } = await spawnMain(['rules', '--help'])
  expect(code).toBe(EXIT_CODES.clean)
  expect(stdout).toContain('list')
  expect(stdout).toContain('why')
  expect(stdout).toContain('conflicts')
  expect(stdout).not.toContain('--cache')
})

test('rules why --help shows why\'s own usage two levels deep, not the rules group\'s', async () => {
  // Regression test for the exact limitation `resolveHelpTarget`'s own doc comment used to name
  // ("a flat list of subcommands, no nesting... if a later command grows either, this needs
  // revisiting"): a one-level lookup would resolve this to the `rules` group itself, showing
  // list/why/conflicts instead of `why`'s own `CONCEPT` argument and `--format` flag.
  const { code, stdout } = await spawnMain(['rules', 'why', '--help'])
  expect(code).toBe(EXIT_CODES.clean)
  expect(stdout).toContain('CONCEPT')
  expect(stdout).toContain('--format')
  expect(stdout).not.toContain('conflicts')
})

test('rules list --help shows list\'s own filtering flags', async () => {
  const { code, stdout } = await spawnMain(['rules', 'list', '--help'])
  expect(code).toBe(EXIT_CODES.clean)
  expect(stdout).toContain('--only')
  expect(stdout).toContain('--engine')
  expect(stdout).toContain('--uncovered')
})

test('an unknown rules subcommand exits with the config code, matching an unknown top-level command', async () => {
  const { code, stderr } = await spawnMain(['rules', 'nonexistent'])
  expect(code).toBe(EXIT_CODES.config)
  expect(stderr).toContain('Unknown command')
})

test('--help prints the same framed header as `check`, ahead of citty\'s own usage body', async () => {
  const { code, stdout } = await spawnMain(['--help'])
  expect(code).toBe(EXIT_CODES.clean)
  expect(stdout).toContain('╭')
  expect(stdout).toContain('slop-gate')
  expect(stdout).toContain('USAGE') // citty's own usage body still renders, unmodified, below it
})

test('check --help gets the framed header too, not just top-level --help', async () => {
  const { code, stdout } = await spawnMain(['check', '--help'])
  expect(code).toBe(EXIT_CODES.clean)
  expect(stdout).toContain('╭')
  expect(stdout).toContain('slop-gate')
})

test('--help falls back to an ASCII header under TERM=dumb', async () => {
  const unicodeRun = await spawnMain(['--help'])
  expect(unicodeRun.stdout).toContain('╭') // sanity: the un-forced run gets the Unicode header

  const dumbRun = await spawnScript(mainPath, ['--help'], { ...process.env, TERM: 'dumb' })
  expect(dumbRun.code).toBe(EXIT_CODES.clean)
  expect(dumbRun.stdout).not.toContain('╭')
  expect(dumbRun.stdout).toContain('+')
})

test('--version prints the package version', async () => {
  const { code, stdout } = await spawnMain(['--version'])
  expect(code).toBe(EXIT_CODES.clean)
  expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
})

test('a subcommand whose loader rejects during --help still exits with the config code, not 1', async () => {
  // The honest reproduction of the failure this guards against: `resolveHelpTarget` dynamically
  // imports a subcommand — in production that transitively loads the whole engine layer — and a
  // broken install makes that import reject. Rather than hand-roll a stand-in dispatcher that
  // could silently drift from the real one, this patches *main.ts's own current source*, one
  // substring, so its subcommand loader points at a module that genuinely cannot resolve: a real
  // `ERR_MODULE_NOT_FOUND` rejection, not a simulated one. Everything else — the try/catch, the
  // help-flag scan, `resolveHelpTarget` itself — is exactly what ships.
  const source = await readFile(mainPath, 'utf8')
  const workingImport = "import('./commands/check.ts')"
  const brokenImport = "import('./commands/does-not-exist.ts')"
  expect(source).toContain(workingImport) // sanity: the substitution below actually matches
  const broken = source.replace(workingImport, brokenImport)

  const brokenPath = join(srcDir, `main.broken-import.${process.pid}.generated.ts`)
  await writeFile(brokenPath, broken)
  try {
    const { code, stderr } = await spawnScript(brokenPath, ['check', '--help'])
    expect(code).toBe(EXIT_CODES.config)
    expect(stderr).toContain('does-not-exist')
  } finally {
    await rm(brokenPath, { force: true })
  }
})
