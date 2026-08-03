import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from 'vitest'
import { isExecFileFailure, runEngineTool, toolVersion } from './spawn.ts'

const signal = () => new AbortController().signal

/** A real child process, because what is under test is how a real rejection is read. */
const node = (script: string) => ({ command: process.execPath, args: ['-e', script] })

const invoke = (script: string, overrides: Partial<Parameters<typeof runEngineTool>[0]> = {}) =>
  runEngineTool({
    engine: 'oxlint',
    ...node(script),
    cwd: process.cwd(),
    signal: signal(),
    maxFindingsExitCode: 1,
    ...overrides,
  })

test('a clean exit yields both streams', async () => {
  const result = await invoke('process.stdout.write("out"); process.stderr.write("err")')
  expect(result).toEqual({ stdout: 'out', stderr: 'err' })
})

test('an exit code within the findings budget is tolerated, and its output is still read', async () => {
  // The whole reason this exists: every tool here exits non-zero *because* it found something, and
  // discarding that exit would discard the findings with it.
  const result = await invoke('process.stdout.write("findings"); process.stderr.write("noise"); process.exit(1)')
  expect(result).toEqual({ stdout: 'findings', stderr: 'noise' })
})

test('an exit code above the budget is an EngineError carrying stderr, not a clean run', async () => {
  await expect(invoke('process.stderr.write("bad option --nope\\n"); process.exit(2)')).rejects.toThrow(
    /oxlint failed: bad option --nope/,
  )
})

test('the budget is a parameter, because tsc means findings by 2 where everyone else means failure', async () => {
  const script = 'process.stdout.write("errors"); process.exit(2)'
  await expect(invoke(script, { engine: 'tsc', maxFindingsExitCode: 2 })).resolves.toEqual({ stdout: 'errors', stderr: '' })
  await expect(invoke(script, { engine: 'tsc', maxFindingsExitCode: 1 })).rejects.toThrow(/tsc failed/)
})

test('the failure message names the tool, which is not always the engine id', async () => {
  await expect(invoke('process.exit(9)', { engine: 'astgrep', tool: 'ast-grep' })).rejects.toThrow(/ast-grep failed/)
})

test('with nothing on stderr the message falls back to the exit code', async () => {
  await expect(invoke('process.exit(9)')).rejects.toThrow(/oxlint failed: 9/)
})

test('a code that is not a number is never within budget, however small the budget looks', async () => {
  // A binary that does not exist rejects with `code: 'ENOENT'`, and an aborted run with
  // `code: 'ABORT_ERR'`. Treating either as "exited 0-or-1, so those are findings" would report a
  // repository as clean because slop-gate could not run.
  await expect(
    runEngineTool({
      engine: 'oxlint',
      command: 'no-such-binary-anywhere',
      args: [],
      cwd: process.cwd(),
      signal: signal(),
      maxFindingsExitCode: 1,
    }),
  ).rejects.toThrow(/oxlint failed: ENOENT/)
})

test('an aborted run is a failure rather than an empty result', async () => {
  const controller = new AbortController()
  const pending = invoke('setTimeout(() => {}, 10000)', { signal: controller.signal })
  controller.abort()
  await expect(pending).rejects.toThrow(/oxlint failed/)
})

test('a real execFile rejection is recognised, with both streams typed as the strings they are', async () => {
  const failure = await promisify(execFile)(process.execPath, ['-e', 'process.stderr.write("boom"); process.exit(3)'], {
    encoding: 'utf8',
  }).then(
    () => undefined,
    (error: unknown) => error,
  )

  expect(isExecFileFailure(failure)).toBe(true)
  if (!isExecFileFailure(failure)) return
  expect(failure.stderr?.trim()).toBe('boom')
  expect(failure.code).toBe(3)
})

test('anything whose streams are not strings is refused, so no caller can reach .trim() on a Buffer', () => {
  // Without `encoding`, `execFile` resolves Buffers — and `Buffer.trim` does not exist. The old
  // hand-written cast asserted this away seven times over.
  expect(isExecFileFailure({ stdout: Buffer.from('x') })).toBe(false)
  expect(isExecFileFailure({ stderr: 12 })).toBe(false)
  expect(isExecFileFailure('a thrown string')).toBe(false)
  expect(isExecFileFailure(null)).toBe(false)
  expect(isExecFileFailure(new Error('no streams at all'))).toBe(true)
})

/** A `ScriptBinInvocation` in the shape `resolveScriptBin` really returns: `node <script>`. */
const versionProbe = async (output: string) => {
  const file = join(await mkdtemp(join(tmpdir(), 'sgate-version-')), 'probe.mjs')
  await writeFile(file, `process.stdout.write(\` ${output} [\${process.argv.slice(2).join(' ')}]\\n\`)\n`)
  return { command: process.execPath, prefixArgs: [file] }
}

test('the version is what the binary reports, trimmed, with its own label stripped', async () => {
  // The bracketed argv proves `--version` lands *after* `prefixArgs` — appended to the wrong end it
  // would ask Node for its own version, and every cache key would carry that instead.
  expect(await toolVersion(await versionProbe('version: 1.2.3'), /^version:\s*/i)).toBe('1.2.3 [--version]')
  expect(await toolVersion(await versionProbe('Version 5.9.0'), /^Version\s+/i)).toBe('5.9.0 [--version]')
  expect(await toolVersion(await versionProbe('ast-grep 0.45.0'), /^ast-grep\s+/i)).toBe('0.45.0 [--version]')
})

test('output the strip pattern does not match is reported as it came', async () => {
  expect(await toolVersion(await versionProbe('7.0.1'), /^version:\s*/i)).toBe('7.0.1 [--version]')
})
