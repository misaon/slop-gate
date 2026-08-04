import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ToolVersionCache } from '../cache/tool-versions.ts'
import { EngineError } from '../errors.ts'
import type { EngineId } from '../registry/types.ts'
import type { ScriptBinInvocation } from './resolve-script-bin.ts'

const run = promisify(execFile)

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
  readonly maxFindingsExitCode: number
  readonly tool?: string
}

export async function runEngineTool(options: RunEngineToolOptions): Promise<{ stdout: string; stderr: string }> {
  try {
    return await run(options.command, [...options.args], {
      cwd: options.cwd,
      signal: options.signal,
      encoding: 'utf8',
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
