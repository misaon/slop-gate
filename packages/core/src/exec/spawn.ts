import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ToolVersionCache } from '../cache/tool-versions.ts'
import { EngineError } from '../errors.ts'
import type { EngineId } from '../registry/types.ts'
import type { ScriptBinInvocation } from './resolve-script-bin.ts'

const run = promisify(execFile)

/**
 * The shape `promisify(execFile)` rejects with: Node's own `ExecFileException`, plus the `stdout` and
 * `stderr` the promisified wrapper attaches to it before rejecting.
 *
 * **`code` is `unknown` on purpose.** It is the exit status on a normal non-zero exit, but a string errno
 * (`'ENOENT'`) when the binary could not be launched, `'ABORT_ERR'` on an aborted run, and `null` for a child
 * killed by a signal. Typing it as a number would make "exit code 1, so those were findings" a claim the type
 * system waves through for all four. `stdout` and `stderr` are strings because every caller here passes
 * `encoding: 'utf8'` — the guard verifies that rather than asserting it, since without the option Node
 * resolves Buffers and `.trim()` does not exist on one.
 */
export type ExecFileFailure = {
  readonly code?: unknown
  readonly stdout?: string
  readonly stderr?: string
}

export function isExecFileFailure(error: unknown): error is ExecFileFailure {
  if (typeof error !== 'object' || error === null) return false
  if ('stdout' in error && error.stdout !== undefined && typeof error.stdout !== 'string') return false
  if ('stderr' in error && error.stderr !== undefined && typeof error.stderr !== 'string') return false
  return true
}

export type RunEngineToolOptions = {
  readonly engine: EngineId
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly signal: AbortSignal
  /**
   * The highest exit code that still means "it ran, and this is what it found". Above it, the process
   * is reporting about itself rather than about the repository. **tsc needs 2** (it exits 2 for
   * ordinary type errors); every other tool here means failure by anything above 1.
   */
  readonly maxFindingsExitCode: number
  /** The tool's own name for the failure message, where it differs from the engine id (`ast-grep`). */
  readonly tool?: string
}

/**
 * Spawns an engine's tool and returns its output, tolerating exactly the exit codes that mean "findings" for
 * that tool and turning everything else into an `EngineError`. Easy to get backwards in both directions:
 * treating a findings exit as a failure makes a repository with defects look like a broken installation, and
 * treating a real failure as findings makes a tool that could not run at all — a rejected option, an
 * unreadable file, a killed process — report the repository as clean, which is the one answer a gate must
 * never give by accident.
 *
 * **Not for every adapter.** `engine-knip` passes `--no-exit-code` and tolerates nothing; `engine-biome-css`
 * resolves an ambiguous exit code against the report file it was told to write. Both handle their own
 * deliberately, for reasons recorded at those call sites.
 */
export async function runEngineTool(options: RunEngineToolOptions): Promise<{ stdout: string; stderr: string }> {
  try {
    return await run(options.command, [...options.args], {
      cwd: options.cwd,
      signal: options.signal,
      encoding: 'utf8',
      // Large enough that no measured run comes close: a truncated stream would be parsed as though
      // the tool had finished, silently dropping the findings past the cut.
      maxBuffer: 1024 * 1024 * 256,
    })
  } catch (error) {
    const failure = isExecFileFailure(error) ? error : {}
    if (typeof failure.code === 'number' && failure.code <= options.maxFindingsExitCode) {
      return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
    }
    const name = options.tool ?? options.engine
    throw new EngineError(options.engine, `${name} failed: ${failure.stderr?.trim() || String(failure.code)}`, { cause: error })
  }
}

/**
 * What `<tool> --version` reports, with the tool's own label stripped off the front — oxlint and Biome print
 * `version: 1.2.3`, tsc prints `Version 5.9.0`, ast-grep prints `ast-grep 0.45.0`. The regex is the parameter
 * because that prefix is the only thing that differs, and it is optional because actionlint and hadolint print
 * no label to strip.
 *
 * **The resolved binary's version, never the pinned one.** This string is part of every cache key, so
 * reporting the pin would keep serving one binary's results after the machine started running another.
 *
 * The first line only: actionlint prints three, a build banner following the number, and a cache key is not
 * the place to discover that a tool became chatty on upgrade. `prefixArgs` come first, because a
 * `ScriptBinInvocation` may be `node <script>` — appending `--version` to the wrong end asks Node for its own
 * version instead. With a `cache` passed in the spawn happens only when the resolved binary is not the one a
 * previous run already asked; absent, it always spawns, which is what keeps direct calls in tests hermetic.
 */
export async function toolVersion(
  invocation: ScriptBinInvocation,
  strip?: RegExp,
  cache?: ToolVersionCache,
): Promise<string> {
  const argv = [invocation.command, ...invocation.prefixArgs]
  const probe = async (): Promise<string> => {
    const { stdout } = await run(invocation.command, [...invocation.prefixArgs, '--version'], { encoding: 'utf8' })
    const firstLine = stdout.trim().split('\n')[0]!.trim()
    return strip === undefined ? firstLine : firstLine.replace(strip, '')
  }
  return cache === undefined ? probe() : cache.resolve(argv, probe)
}
