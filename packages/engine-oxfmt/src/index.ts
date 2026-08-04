import {
  EngineError,
  hashJson,
  runEngineTool,
  toolVersion,
  type Engine,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type FileBatch,

  type RunContext,
} from '@misaon/slop-gate-core'
import { UNFORMATTED_RULE_ID, parseUnformattedFiles } from './parse.ts'
import { resolveOxfmtBinary, type OxfmtInvocation } from './resolve-binary.ts'

export { UNFORMATTED_RULE_ID, parseUnformattedFiles } from './parse.ts'
export { resolveOxfmtBinary, type OxfmtInvocation } from './resolve-binary.ts'

/** `--list-different` exits 1 when any file differs, which is a result and not a crash. */
const MAX_FINDINGS_EXIT_CODE = 1

const UNAVAILABLE_REASON =
  'the bundled `oxfmt` could not be resolved, so formatting was not checked — slop-gate\'s own installation is incomplete'

export type CreateOxfmtEngineOptions = {
  /** Test-only escape hatch: spawned exactly as given, with no `node` prefix. */
  binaryPath?: string
}

/**
 * Formatting, delegated to oxfmt exclusively (§1.2): slop-gate has no formatter of its own and will not grow
 * one.
 *
 * **This engine never writes.** `--write` is oxfmt's *default* mode, so every invocation here names its mode
 * explicitly and the one that matters is `--list-different`. A missing flag would not fail — it would silently
 * reformat the user's working tree during `sgate check`, which is the single worst thing a read-only command
 * could do, and no test would notice because the files would then be formatted.
 *
 * `fixKind` on its registry entry is `'none'`, which is a deliberate lie about capability and an honest
 * statement about *this* pipeline. A formatting fix is a whole-file replacement, so entering it into the fix
 * pipeline would overlap every other edit in that file and arbitration (§11) would reject one or the other —
 * correctly, and uselessly. Formatting runs as a separate final pass in `sgate fix`, after the edits, which is
 * how every real toolchain sequences the two.
 */
export function createOxfmtEngine(options: CreateOxfmtEngineOptions = {}): Engine {
  const invocation: OxfmtInvocation | undefined =
    options.binaryPath === undefined ? resolveOxfmtBinary() : { command: options.binaryPath, prefixArgs: [] }

  const required = (): OxfmtInvocation => {
    if (invocation === undefined) throw new EngineError('oxfmt', UNAVAILABLE_REASON)
    return invocation
  }

  return {
    id: 'oxfmt',

    capabilities: {
      // Verified by formatting one file of each on oxfmt 0.62.0 and diffing: all five were rewritten. The claim
      // that it replaces prettier rests on this list, so it was measured rather than read off a feature page.
      languages: ['ts', 'tsx', 'js', 'jsx', 'json', 'yaml', 'css', 'markdown'],
      granularity: 'file',
      provides: [],
      fixes: false,
    },

    async version(cache) {
      return toolVersion(required(), /^oxfmt\s+/i, cache)
    },

    async materializeConfig(selection: EngineRuleSelection) {
      const level = selection.get(UNFORMATTED_RULE_ID)?.[0] ?? 'off'

      return {
        // Nothing is written: oxfmt finds its own `.oxfmtrc.json` by walking up from each file, the same way it
        // does outside slop-gate, so a project's formatting choices keep working unchanged.
        path: 'oxfmt',
        // The level is the only input that changes what this engine reports. The project's own `.oxfmtrc.json`
        // is deliberately *not* hashed here: it is not this adapter's to read, and the file hash a result key
        // already carries changes whenever the formatting of that file would.
        rulesetHash: hashJson({ level }),
        async dispose() {},
      }
    },

    async *run(batch: FileBatch, _handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      if (batch.files.length === 0) return

      const { stdout } = await runEngineTool({
        engine: 'oxfmt',
        command: required().command,
        args: [
          ...required().prefixArgs,
          // Named first and never omitted — see the class comment on why a missing mode flag is dangerous here.
          '--list-different',
          ...batch.files.map((file) => file.path),
        ],
        cwd: context.rootDir,
        signal,
        maxFindingsExitCode: MAX_FINDINGS_EXIT_CODE,
      })

      yield* parseUnformattedFiles(stdout)
    },
  }
}
