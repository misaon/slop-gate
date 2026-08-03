import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  EngineError,
  type Engine,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type FileBatch,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import { materializeAstGrepConfig } from './config.ts'
import { parseAstGrepOutput } from './parse.ts'
import { readScanSummary, type AstGrepScanSummary } from './summary.ts'
import { resolveAstGrepBinary, type AstGrepInvocation } from './resolve-binary.ts'

export { ASTGREP_RULES, LANGUAGE_COVERAGE, astGrepRuleById, type AstGrepLanguage, type AstGrepRule } from './rules.ts'
export { buildAstGrepConfig, materializeAstGrepConfig, type MaterializedAstGrepConfig } from './config.ts'
export { parseAstGrepOutput } from './parse.ts'
export { readScanSummary, type AstGrepScanSummary } from './summary.ts'
export { resolveAstGrepBinary, type AstGrepInvocation, type ResolveAstGrepBinaryOptions } from './resolve-binary.ts'

const run = promisify(execFile)

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
  // `binaryPath` is the same test-only override the other three adapters carry: spawned exactly as
  // given. Unlike theirs it needs no `node` prefix in *either* case — see resolve-binary.ts for why
  // ast-grep is the one engine here whose bin target is a native executable rather than a script.
  const invocation: AstGrepInvocation | undefined =
    options.binaryPath === undefined ? resolveAstGrepBinary() : { command: options.binaryPath, prefixArgs: [] }

  const required = (): AstGrepInvocation => {
    if (invocation === undefined) throw new EngineError('astgrep', MISSING_AST_GREP)
    return invocation
  }

  return {
    id: 'astgrep',

    capabilities: {
      // Exactly the four our rule documents cover, and no more. ast-grep supports twenty-odd
      // languages, but claiming one here makes the planner assign files this engine's ruleset has
      // nothing to say about — every one of them a cache entry written and a subprocess argument
      // paid for. `vue`/`svelte`/`astro` are absent for a stronger reason: ast-grep has no grammar
      // for them at all, so those files would be walked past in silence.
      languages: ['ts', 'tsx', 'js', 'jsx'],
      granularity: 'file',
      provides: [],
      // ast-grep has a real `fix:` key, and the adapter now carries its `replacement` through as a
      // `RawFix` (see `parse.ts`'s `fixOf`) — so the *plumbing* for `sgate fix` is here and tested.
      // The capability stays `false` because it describes what this engine will actually produce on
      // a run, and none of the five shipped rules declares a `fix:`: every `slop.*` finding here is a
      // judgement about intent that a mechanical rewrite cannot make (deleting a comment, inventing
      // an error handler). Flipping this to `true` is a one-line change for whoever adds the first
      // rule with a rewrite; claiming it now would promise edits this ruleset has none of.
      fixes: false,
    },

    async version() {
      const resolved = required()
      const { stdout } = await run(resolved.command, [...resolved.prefixArgs, '--version'], { encoding: 'utf8' })
      return stdout.trim().replace(/^ast-grep\s+/i, '')
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
  // Not merely an optimisation, on both counts. `ast-grep scan` with no path arguments defaults to
  // scanning `.` — an empty batch would walk the entire repository — and `--rule` pointed at an
  // empty document hard-fails with "Cannot parse rule" rather than finding nothing. Both confirmed
  // against 0.45.0.
  if (batch.files.length === 0 || handle.ruleCount === 0) return

  const args = [
    ...invocation.prefixArgs,
    'scan',
    '--rule',
    handle.path,
    '--json=compact',
    // The ruleset/coverage assertion, on stderr. This is ast-grep's answer to oxlint's
    // `number_of_rules` and it is load-bearing for the same reason: without it, both of this
    // adapter's silent-failure modes look exactly like a clean run. See `assertSummary`.
    '--inspect',
    'summary',
    ...batch.files.map((file) => file.path),
  ]

  let stdout: string
  let stderr: string
  try {
    ;({ stdout, stderr } = await run(invocation.command, args, {
      cwd: context.rootDir,
      signal,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 256,
    }))
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string }
    if (typeof failure.code === 'number' && failure.code <= MAX_FINDINGS_EXIT_CODE) {
      stdout = failure.stdout ?? ''
      stderr = failure.stderr ?? ''
    } else {
      throw new EngineError('astgrep', `ast-grep failed: ${failure.stderr?.trim() || String(failure.code)}`, {
        cause: error,
      })
    }
  }

  assertSummary(readScanSummary(stderr), batch, handle)

  yield* parseAstGrepOutput(stdout, context.rootDir)
}

/**
 * Turns ast-grep's two silent-failure modes into loud ones.
 *
 * **A file it declines to parse is reported as a clean file.** Reproduced against 0.45.0: a 4.8 MB
 * JavaScript file produced zero findings and exit 0, with the only trace being
 * `skippedFileCount=1` in this summary — and slop-gate would then cache that file as having no
 * findings. (The threshold is a property of the parse tree rather than of byte count alone: a 3.7 MB
 * file of statements parsed, a 4.1 MB one did not, and a 5.2 MB file that was one long comment did.
 * `skippedFileCount` is 0 for the benign cases — a language with no rule document, an extension
 * ast-grep does not recognise — so this does not fire on an ordinary mixed batch.)
 *
 * **A ruleset that did not load is also a clean run.** `effectiveRuleCount` is the count of rule
 * *documents* ast-grep actually activated, which is exactly what `EngineConfigHandle.ruleCount`
 * records, so a document silently rejected on a version bump fails here instead of quietly
 * removing a concept's coverage.
 *
 * A missing summary is itself a failure rather than a reason to skip the check: an adapter whose
 * guard has been disabled by an upstream format change should say so, not carry on unguarded.
 */
function assertSummary(summary: AstGrepScanSummary | null, batch: FileBatch, handle: EngineConfigHandle): void {
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
    const largest = [...batch.files]
      .sort((a, b) => b.size - a.size)
      .slice(0, SKIPPED_FILE_HINT_COUNT)
      .map((file) => `${file.path} (${Math.round(file.size / 1024)} KiB)`)
      .join(', ')
    throw new EngineError(
      'astgrep',
      `ast-grep skipped ${summary.skippedFileCount} of ${batch.files.length} assigned file(s) without analysing them, ` +
        'which would otherwise be indistinguishable from a clean result. The known cause is a file too large for its ' +
        `parser (reproduced at ~4 MB). Largest in this batch: ${largest}. Exclude it with \`ignore\` in slop-gate.config.ts.`,
    )
  }
}
