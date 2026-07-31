import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  EngineError,
  SCRIPT_LANGUAGES,
  type Engine,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type FileBatch,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import { materializeOxlintConfig } from './config.ts'
import { parseOxlintOutput } from './parse.ts'

export { PARSE_ERROR_RULE_ID, parseOxlintOutput, toEngineRuleId } from './parse.ts'

const run = promisify(execFile)

/** oxlint exits 1 when it reports findings; only higher codes are real failures. */
const MAX_FINDINGS_EXIT_CODE = 1

/**
 * `oxlint`'s package.json declares an `exports` map that does not list `./bin/oxlint`, so
 * `require.resolve('oxlint/bin/oxlint')` always throws `ERR_PACKAGE_PATH_NOT_EXPORTED` (Task 11
 * Step 1). `./package.json` is exported, so resolve that and join the package's own documented
 * `bin/oxlint` path instead.
 */
function resolveBinary(): string {
  const require = createRequire(import.meta.url)
  try {
    return join(dirname(require.resolve('oxlint/package.json')), 'bin', 'oxlint')
  } catch {
    return 'oxlint'
  }
}

export function createOxlintEngine(options: { binaryPath?: string } = {}): Engine {
  const binary = options.binaryPath ?? resolveBinary()

  return {
    id: 'oxlint',

    capabilities: {
      languages: [...SCRIPT_LANGUAGES, 'vue', 'svelte', 'astro'],
      granularity: 'file',
      provides: [],
      fixes: true,
    },

    async version() {
      const { stdout } = await run(binary, ['--version'], { encoding: 'utf8' })
      return stdout.trim().replace(/^version:\s*/i, '')
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
      return materializeOxlintConfig(selection, context)
    },

    run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      return execute(binary, batch, handle, context, signal)
    },
  }
}

async function* execute(
  binary: string,
  batch: FileBatch,
  handle: EngineConfigHandle,
  context: RunContext,
  signal: AbortSignal,
): AsyncIterable<RawDiagnostic> {
  if (batch.files.length === 0) return

  const args = [
    '--config',
    handle.path,
    '--disable-nested-config',
    '--format',
    'json',
    ...batch.files.map((file) => file.path),
  ]

  let stdout: string
  try {
    ;({ stdout } = await run(binary, args, {
      cwd: context.rootDir,
      signal,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 256,
    }))
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string }
    if (typeof failure.code === 'number' && failure.code <= MAX_FINDINGS_EXIT_CODE) {
      stdout = failure.stdout ?? ''
    } else {
      throw new EngineError('oxlint', `oxlint failed: ${failure.stderr?.trim() || String(failure.code)}`, {
        cause: error,
      })
    }
  }

  const expected = handle.ruleCount === undefined ? undefined : { ruleCount: handle.ruleCount }
  yield* parseOxlintOutput(stdout, context.rootDir, expected)
}
