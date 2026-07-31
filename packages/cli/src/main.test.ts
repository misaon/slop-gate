import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from 'vitest'
import { EXIT_CODES } from './exit-codes.ts'

const run = promisify(execFile)

// Runs the TypeScript source directly (Node >=24 strips types natively) rather than the built
// `bin/sgate.js` -> `dist/main.js`. This suite's own CI order is install -> typecheck -> test ->
// build, so `packages/cli/dist` does not exist yet when `pnpm test` runs — only this package's
// *dependencies* get built first, as a side effect of `typecheck`'s turbo `dependsOn: ["^build"]`.
// Spawning the built binary here would make this test depend on `pnpm build` having already run,
// which is not true in this suite. Spawning the real process (rather than importing and calling a
// function) is still essential: it is the only way to exercise `process.argv`-driven dispatch and
// observe the real OS-level exit code, which is exactly what is under test.
const mainPath = join(dirname(fileURLToPath(import.meta.url)), 'main.ts')

async function spawnMain(args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [mainPath, ...args], { encoding: 'utf8' })
    return { code: 0, stdout, stderr }
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string }
    return { code: failure.code ?? -1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
  }
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

test('--version prints the package version', async () => {
  const { code, stdout } = await spawnMain(['--version'])
  expect(code).toBe(EXIT_CODES.clean)
  expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
})
