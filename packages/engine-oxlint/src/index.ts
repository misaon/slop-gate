import { execFile } from 'node:child_process'
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
import { deriveOxlintFixes } from './derive-fixes.ts'
import { parseOxlintOutput } from './parse.ts'
import { resolveOxlintBinary, type OxlintInvocation } from './resolve-binary.ts'

export { deriveOxlintFixes, loadFixCatalogue, type DeriveOxlintFixesOptions } from './derive-fixes.ts'
export { PARSE_ERROR_RULE_ID, parseOxlintOutput, toEngineRuleId } from './parse.ts'
export { resolveOxlintBinary, type OxlintInvocation } from './resolve-binary.ts'

const run = promisify(execFile)

/** oxlint exits 1 when it reports findings; only higher codes are real failures. */
const MAX_FINDINGS_EXIT_CODE = 1

export function createOxlintEngine(options: { binaryPath?: string } = {}): Engine {
  // `binaryPath` is an explicit override (tests use it to point at a deliberately-missing path) —
  // it is spawned exactly as given, with no `node` prefix, unlike the resolved default below. See
  // resolve-binary.ts for why the default case needs that prefix and this override must not get it.
  const invocation: OxlintInvocation =
    options.binaryPath === undefined ? resolveOxlintBinary() : { command: options.binaryPath, prefixArgs: [] }

  return {
    id: 'oxlint',

    capabilities: {
      languages: [...SCRIPT_LANGUAGES, 'vue', 'svelte', 'astro'],
      granularity: 'file',
      provides: [],
      fixes: true,
    },

    async version() {
      const { stdout } = await run(invocation.command, [...invocation.prefixArgs, '--version'], { encoding: 'utf8' })
      return stdout.trim().replace(/^version:\s*/i, '')
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
      return materializeOxlintConfig(selection, context)
    },

    run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      return execute(invocation, batch, handle, context, signal)
    },

    // oxlint reports no fix data in any output format (see `derive-fixes.ts` for what was checked),
    // so it takes the second route: `sgate fix` hands it the findings it wants edits for, and the
    // adapter obtains them by running `--fix` over copies. Never called by `sgate check`.
    deriveFixes(targets, context, signal) {
      return deriveOxlintFixes({ invocation, targets, context, signal })
    },
  }
}

async function* execute(
  invocation: OxlintInvocation,
  batch: FileBatch,
  handle: EngineConfigHandle,
  context: RunContext,
  signal: AbortSignal,
): AsyncIterable<RawDiagnostic> {
  if (batch.files.length === 0) return

  const args = [
    ...invocation.prefixArgs,
    '--config',
    handle.path,
    '--disable-nested-config',
    '--format',
    'json',
    ...batch.files.map((file) => file.path),
  ]

  let stdout: string
  try {
    ;({ stdout } = await run(invocation.command, args, {
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
