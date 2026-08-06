import {
  EngineError,
  SCRIPT_LANGUAGES,
  runEngineTool,
  toolVersion,
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
export { resolveOxlintBinary, resolveOxlintSchemaPath, type OxlintInvocation } from './resolve-binary.ts'

const MAX_FINDINGS_EXIT_CODE = 1

const MISSING_OXLINT =
  'the bundled `oxlint` package could not be resolved from this installation of slop-gate. slop-gate ' +
  'deliberately will not fall back to an `oxlint` on PATH — the registry is generated from one ' +
  'specific oxlint version, and a different one reports different rules. Reinstall slop-gate.'

export function createOxlintEngine(options: { binaryPath?: string } = {}): Engine {
  const invocation: OxlintInvocation | undefined =
    options.binaryPath === undefined ? resolveOxlintBinary() : { command: options.binaryPath, prefixArgs: [] }

  const required = (): OxlintInvocation => {
    if (invocation === undefined) throw new EngineError('oxlint', MISSING_OXLINT)
    return invocation
  }

  return {
    id: 'oxlint',

    capabilities: {
      languages: [...SCRIPT_LANGUAGES, 'vue', 'svelte', 'astro'],
      granularity: 'file',
      provides: [],
      fixes: true,
    },

    async version(cache) {
      return toolVersion(required(), /^version:\s*/i, cache)
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
      return materializeOxlintConfig(selection, context)
    },

    run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      return execute(required(), batch, handle, context, signal)
    },

    deriveFixes(targets, selection, context, signal) {
      return deriveOxlintFixes({ invocation: required(), targets, selection, context, signal })
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

  const { stdout } = await runEngineTool({
    engine: 'oxlint',
    command: invocation.command,
    args,
    cwd: context.rootDir,
    signal,
    maxFindingsExitCode: MAX_FINDINGS_EXIT_CODE,
  })

  const expected = handle.ruleCount === undefined ? undefined : { ruleCount: handle.ruleCount }
  yield* parseOxlintOutput(stdout, context.rootDir, expected)
}
