import {
  EngineError,
  SCRIPT_LANGUAGES,
  runEngineTool,
  toolVersion,
  type ScriptBinInvocation,
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
import { resolveOxlintBinary, resolveTsgolint } from './resolve-binary.ts'

export { deriveOxlintFixes, loadFixCatalogue, type DeriveOxlintFixesOptions } from './derive-fixes.ts'
export { PARSE_ERROR_RULE_ID, parseOxlintOutput, toEngineRuleId } from './parse.ts'
export { resolveOxlintBinary, resolveOxlintSchemaPath } from './resolve-binary.ts'

const MAX_FINDINGS_EXIT_CODE = 1

const MISSING_OXLINT =
  'the bundled `oxlint` package could not be resolved from this installation of slop-gate. slop-gate ' +
  'deliberately will not fall back to an `oxlint` on PATH — the registry is generated from one ' +
  'specific oxlint version, and a different one reports different rules. Reinstall slop-gate.'

export function createOxlintEngine(options: { binaryPath?: string; typeAware?: boolean } = {}): Engine {
  const invocation: ScriptBinInvocation | undefined =
    options.binaryPath === undefined ? resolveOxlintBinary() : { command: options.binaryPath, prefixArgs: [] }

  // Measured at 5.7 s against 0.09 s for the same rules over this repository, so it is never on by
  // default — the capability exists only where someone installed the checker. docs/measurements.md.
  const typeAware = options.typeAware ?? resolveTsgolint()

  const required = (): ScriptBinInvocation => {
    if (invocation === undefined) throw new EngineError('oxlint', MISSING_OXLINT)
    return invocation
  }

  return {
    id: 'oxlint',

    capabilities: {
      languages: [...SCRIPT_LANGUAGES, 'vue', 'svelte', 'astro'],
      granularity: 'file',
      provides: typeAware ? ['types'] : [],
      fixes: true,
    },

    async version(cache) {
      return toolVersion(required(), /^version:\s*/i, cache)
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
      return materializeOxlintConfig(selection, context)
    },

    run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      return execute(required(), batch, handle, context, signal, typeAware)
    },

    deriveFixes(targets, selection, context, signal) {
      return deriveOxlintFixes({ invocation: required(), targets, selection, context, signal })
    },
  }
}

async function* execute(
  invocation: ScriptBinInvocation,
  batch: FileBatch,
  handle: EngineConfigHandle,
  context: RunContext,
  signal: AbortSignal,
  typeAware: boolean,
): AsyncIterable<RawDiagnostic> {
  if (batch.files.length === 0) return

  const args = [
    ...invocation.prefixArgs,
    '--config',
    handle.path,
    '--disable-nested-config',
    ...(typeAware ? ['--type-aware'] : []),
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
