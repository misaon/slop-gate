import {
  EngineError,
  runEngineTool,
  toolVersion,
  type Engine,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type FileBatch,
  type InventoryFile,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import { materializeAstGrepConfig } from './config.ts'
import { parseAstGrepOutput } from './parse.ts'
import { readScanSummary, type AstGrepScanSummary } from './summary.ts'
import { resolveAstGrepBinary, type AstGrepInvocation } from './resolve-binary.ts'

export { ASTGREP_RULES, LANGUAGE_COVERAGE, astGrepRuleById, type AstGrepLanguage, type AstGrepRule } from './rules.ts'
export { buildAstGrepConfig, materializeAstGrepConfig, type AstGrepRuleFile } from './config.ts'
export { parseAstGrepOutput } from './parse.ts'
export { readScanSummary, type AstGrepScanSummary } from './summary.ts'
export { resolveAstGrepBinary, type AstGrepInvocation, type ResolveAstGrepBinaryOptions } from './resolve-binary.ts'

const MAX_FINDINGS_EXIT_CODE = 1

const SKIPPED_FILE_HINT_COUNT = 3

const MISSING_AST_GREP =
  'the bundled `@ast-grep/cli` platform binary could not be resolved from this installation of ' +
  'slop-gate, and it will not fall back to an `ast-grep` on PATH — a different version reads the rule ' +
  'files differently. Reinstall slop-gate. (On musl Linux, where upstream publishes no build at all, a ' +
  '`PATH` ast-grep is used deliberately and this error cannot occur.)'

export function createAstGrepEngine(options: { binaryPath?: string } = {}): Engine {
  const invocation: AstGrepInvocation | undefined =
    options.binaryPath === undefined ? resolveAstGrepBinary() : { command: options.binaryPath, prefixArgs: [] }

  const required = (): AstGrepInvocation => {
    if (invocation === undefined) throw new EngineError('astgrep', MISSING_AST_GREP)
    return invocation
  }

  return {
    id: 'astgrep',

    capabilities: {
      languages: ['ts', 'tsx', 'js', 'jsx'],
      granularity: 'file',
      provides: [],
      fixes: false,
    },

    async version(cache) {
      return toolVersion(required(), /^ast-grep\s+/i, cache)
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
      return materializeAstGrepConfig(selection, context)
    },

    run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      return execute(required(), batch, handle, context, signal)
    },
  }
}

async function* execute(
  invocation: AstGrepInvocation,
  batch: FileBatch,
  handle: EngineConfigHandle,
  context: RunContext,
  signal: AbortSignal,
): AsyncIterable<RawDiagnostic> {
  if (batch.files.length === 0 || handle.ruleCount === 0) return

  // ast-grep counts a zero-byte file as skipped, which `assertSummary` cannot tell from the
  // dangerous skip. Filtered here so that guard stays exact for files that had bytes.
  const scanned = batch.files.filter((file) => file.size > 0)
  if (scanned.length === 0) return

  const args = [
    ...invocation.prefixArgs,
    'scan',
    '--rule',
    handle.path,
    '--json=compact',
    '--inspect',
    'summary',
    ...scanned.map((file) => file.path),
  ]

  const { stdout, stderr } = await runEngineTool({
    engine: 'astgrep',
    tool: 'ast-grep',
    command: invocation.command,
    args,
    cwd: context.rootDir,
    signal,
    maxFindingsExitCode: MAX_FINDINGS_EXIT_CODE,
  })

  assertSummary(readScanSummary(stderr), scanned, handle)

  yield* parseAstGrepOutput(stdout, context.rootDir)
}

// ast-grep reports a file it declined to parse as a clean file, and a ruleset that failed to load
// as a clean run. Both are indistinguishable from success without this.
function assertSummary(summary: AstGrepScanSummary | null, scanned: readonly InventoryFile[], handle: EngineConfigHandle): void {
  if (summary === null) {
    throw new EngineError(
      'astgrep',
      'ast-grep produced no `--inspect summary` output, so neither the loaded ruleset nor the scanned file count could be verified.',
    )
  }

  if (handle.ruleCount !== undefined && summary.effectiveRuleCount !== handle.ruleCount) {
    throw new EngineError(
      'astgrep',
      `expected ${handle.ruleCount} rule document(s) to load, ast-grep loaded ${summary.effectiveRuleCount}. ` +
        'The materialised rule file is not selecting exactly the elected ruleset.',
    )
  }

  if (summary.skippedFileCount > 0) {
    const largest = [...scanned]
      .sort((a, b) => b.size - a.size)
      .slice(0, SKIPPED_FILE_HINT_COUNT)
      .map((file) => `${file.path} (${Math.round(file.size / 1024)} KiB)`)
      .join(', ')
    throw new EngineError(
      'astgrep',
      `ast-grep skipped ${summary.skippedFileCount} of ${scanned.length} file(s) in this batch without analysing them, ` +
        'which would otherwise be indistinguishable from a clean result. The known cause is a file too large for its ' +
        `parser (reproduced at ~4 MB). Largest in this batch: ${largest}. Exclude it with \`ignore\` in slop-gate.config.ts.`,
    )
  }
}
