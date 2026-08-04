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

/** `ast-grep scan` exits 1 when any `severity: error` rule matched; only higher codes are real failures. Confirmed against 0.45.0: a `warning`-severity match exits 0. */
const MAX_FINDINGS_EXIT_CODE = 1

/** How many of the batch's largest files to name when ast-grep silently skips one. */
const SKIPPED_FILE_HINT_COUNT = 3

const MISSING_AST_GREP =
  'the bundled `@ast-grep/cli` platform binary could not be resolved from this installation of ' +
  'slop-gate, and it will not fall back to an `ast-grep` on PATH — a different version reads the rule ' +
  'files differently. Reinstall slop-gate. (On musl Linux, where upstream publishes no build at all, a ' +
  '`PATH` ast-grep is used deliberately and this error cannot occur.)'

export function createAstGrepEngine(options: { binaryPath?: string } = {}): Engine {
  // `binaryPath` is the same test-only override the other three adapters carry: spawned exactly as given.
  // Unlike theirs it needs no `node` prefix in *either* case — see resolve-binary.ts.
  const invocation: AstGrepInvocation | undefined =
    options.binaryPath === undefined ? resolveAstGrepBinary() : { command: options.binaryPath, prefixArgs: [] }

  const required = (): AstGrepInvocation => {
    if (invocation === undefined) throw new EngineError('astgrep', MISSING_AST_GREP)
    return invocation
  }

  return {
    id: 'astgrep',

    capabilities: {
      // Exactly the four our rule documents cover, and no more. ast-grep supports twenty-odd languages, but
      // claiming one here makes the planner assign files this engine's ruleset has nothing to say about —
      // every one a cache entry written and a subprocess argument paid for. `vue`/`svelte`/`astro` are absent
      // for a stronger reason: ast-grep has no grammar for them at all, so those files would be walked past
      // in silence.
      languages: ['ts', 'tsx', 'js', 'jsx'],
      granularity: 'file',
      provides: [],
      // The *plumbing* for `sgate fix` is here and tested — the adapter carries ast-grep's `replacement`
      // through as a `RawFix` (see `parse.ts`'s `fixOf`). The capability stays `false` because it describes
      // what this engine will actually produce on a run, and none of the five shipped rules declares a
      // `fix:`; claiming it now would promise edits this ruleset has none of.
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
  // Not merely an optimisation, on both counts. `ast-grep scan` with no path arguments defaults to scanning
  // `.` — an empty batch would walk the entire repository — and `--rule` pointed at an empty document
  // hard-fails with "Cannot parse rule" rather than finding nothing. Both confirmed against 0.45.0.
  if (batch.files.length === 0 || handle.ruleCount === 0) return

  // **Zero-byte files never reach ast-grep**, because it counts them in `skippedFileCount` and
  // `assertSummary` below cannot tell that skip from the dangerous one. Measured against 0.45.0: a file
  // of exactly 0 bytes is skipped, one holding a single newline is not — so the discriminator is
  // emptiness itself, not size in general. Dropping them here rather than relaxing the guard keeps the
  // guard exact for every file that could actually have carried a finding; a file with no bytes has
  // nothing to analyse, so removing it changes no result. Found on 2 of 20 public repositories
  // (`medusajs/medusa`, `excalidraw/excalidraw`), both of which held an empty `global.d.ts` and both of
  // which failed the whole run.
  const scanned = batch.files.filter((file) => file.size > 0)
  if (scanned.length === 0) return

  const args = [
    ...invocation.prefixArgs,
    'scan',
    '--rule',
    handle.path,
    '--json=compact',
    // The ruleset/coverage assertion, on stderr — ast-grep's answer to oxlint's `number_of_rules`, and
    // load-bearing for the same reason: without it both of this adapter's silent-failure modes look exactly
    // like a clean run. See `assertSummary`.
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

/**
 * Turns ast-grep's two silent-failure modes into loud ones.
 *
 * **A file it declines to parse is reported as a clean file.** Reproduced against 0.45.0: a 4.8 MB JavaScript
 * file produced zero findings and exit 0, the only trace being `skippedFileCount=1` in this summary — and
 * slop-gate would then cache that file as having no findings. The threshold is a property of the parse tree
 * rather than of byte count alone (a 3.7 MB file of statements parsed, a 4.1 MB one did not), and
 * `skippedFileCount` is 0 for the benign cases — a language with no rule document, an extension ast-grep does
 * not recognise — so this does not fire on an ordinary mixed batch.
 *
 * **One benign skip is not visible here**, and it is handled before the scan rather than excused after it:
 * ast-grep also counts a zero-byte file as skipped. Those are filtered out of `scanned` in `execute`, so by
 * the time this runs every remaining skip is a file that had bytes ast-grep chose not to read.
 *
 * **A ruleset that did not load is also a clean run.** `effectiveRuleCount` is the count of rule *documents*
 * ast-grep actually activated, which is exactly what `EngineConfigHandle.ruleCount` records, so a document
 * silently rejected on a version bump fails here instead of quietly removing a concept's coverage.
 *
 * A missing summary is itself a failure rather than a reason to skip the check: an adapter whose guard has
 * been disabled by an upstream format change should say so, not carry on unguarded.
 */
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
