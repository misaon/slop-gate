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
export { resolveOxlintBinary, type OxlintInvocation } from './resolve-binary.ts'

/** oxlint exits 1 when it reports findings; only higher codes are real failures. */
const MAX_FINDINGS_EXIT_CODE = 1

const MISSING_OXLINT =
  'the bundled `oxlint` package could not be resolved from this installation of slop-gate. slop-gate ' +
  'deliberately will not fall back to an `oxlint` on PATH — the registry is generated from one ' +
  'specific oxlint version, and a different one reports different rules. Reinstall slop-gate.'

export function createOxlintEngine(options: { binaryPath?: string } = {}): Engine {
  // `binaryPath` is an explicit override (tests use it to point at a deliberately-missing path) —
  // it is spawned exactly as given, with no `node` prefix, unlike the resolved default below. See
  // resolve-binary.ts for why the default case needs that prefix and this override must not get it.
  const invocation: OxlintInvocation | undefined =
    options.binaryPath === undefined ? resolveOxlintBinary() : { command: options.binaryPath, prefixArgs: [] }

  // An unresolvable *bundled* dependency is a broken installation of slop-gate, so this is an
  // `EngineError` (exit 3, §18) rather than an `availability()` coverage gap: a gap exits 0 and calls
  // the repository clean, which is exactly the wrong answer to "the linter is missing". Not a
  // fallback to an `oxlint` on `PATH` either — see resolve-binary.ts.
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

    async version() {
      return toolVersion(required(), /^version:\s*/i)
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
      return materializeOxlintConfig(selection, context)
    },

    run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      return execute(required(), batch, handle, context, signal)
    },

    // oxlint reports no fix data in any output format (see `derive-fixes.ts` for what was checked),
    // so it takes the second route: `sgate fix` hands it the findings it wants edits for, and the
    // adapter obtains them by running `--fix` over copies. Never called by `sgate check`.
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
