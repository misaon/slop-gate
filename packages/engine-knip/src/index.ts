import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
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
import { materializeKnipConfig, mergeWorkspacesIntoConfig, synthesizeKnipWorkspaces } from './config.ts'
import { parseKnipOutput } from './parse.ts'
import { resolveKnipBinary, resolveKnipPackageJson, type KnipInvocation } from './resolve-binary.ts'

export {
  KNIP_EXCLUDED_ISSUE_TYPES,
  KNIP_ISSUE_TYPES,
  KNIP_SURFACED_ISSUE_TYPES,
  isSurfacedIssueType,
  type KnipIssueType,
  type KnipIssueTypeExclusion,
} from './issue-types.ts'
export { materializeKnipConfig, mergeWorkspacesIntoConfig, synthesizeKnipWorkspaces } from './config.ts'
export { parseKnipOutput } from './parse.ts'
export { resolveKnipBinary, resolveKnipPackageJson, type KnipInvocation } from './resolve-binary.ts'

const run = promisify(execFile)

export type CreateKnipEngineOptions = {
  /**
   * Repo-relative path of the slop-gate config file, when one was found. knip reports it as an unused
   * file otherwise — nothing imports it, we load it by path at runtime — and that particular false
   * positive is both avoidable and embarrassing. See `buildIgnore` in config.ts.
   */
  configFile?: string
  /**
   * The user's own `ignore` globs from `slop-gate.config.ts`. A project-granularity engine picks its
   * own files, so core's inventory filtering never reaches it — without this, knip reports on
   * directories the user explicitly excluded. See `buildIgnore` in config.ts for the measurement.
   */
  ignore?: readonly string[]
  /** Test-only escape hatch, mirroring the other two adapters': spawned exactly as given, with no `node` prefix. */
  binaryPath?: string
}

/**
 * knip: the second project-granularity engine (spec §8.1) and the second dedicated dead-code /
 * dependency-hygiene domain owner (spec §13.1).
 *
 * **No `rootDir` at construction**, unlike `createTscEngine`, and the difference is exactly the
 * peer-vs-bundled one: `typescript` must be resolved from the analysed project so a type error matches
 * the developer's own editor, whereas knip is a `dependencies` entry of this package with no editor
 * counterpart to agree with, so it resolves from this package's own install location and its version
 * is a property of slop-gate rather than of the repository. Everything else project-specific arrives
 * per call, through `RunContext.rootDir` and the `FileBatch`.
 */
const MISSING_KNIP =
  'the bundled `knip` package could not be resolved from this installation of slop-gate, and it will ' +
  'not fall back to a `knip` on PATH — knip’s version is a property of slop-gate, not of the ' +
  'repository being checked. Reinstall slop-gate.'

export function createKnipEngine(options: CreateKnipEngineOptions = {}): Engine {
  const invocation: KnipInvocation | undefined =
    options.binaryPath === undefined ? resolveKnipBinary() : { command: options.binaryPath, prefixArgs: [] }

  // An unresolvable bundled dependency is a broken installation of slop-gate, not a coverage gap —
  // see `resolveScriptBin`'s own note. This also closes a smaller hole: `version()` reads the bundled
  // package's manifest, so while the resolver still fell back to a `knip` on `PATH`, a corrupted
  // install could report one version while running another, and the cache key recorded the wrong one.
  const required = (): KnipInvocation => {
    if (invocation === undefined) throw new EngineError('knip', MISSING_KNIP)
    return invocation
  }

  return {
    id: 'knip',

    capabilities: {
      // `json` and `jsonc` are here for two distinct reasons, neither of them "knip lints JSON".
      //
      // 1. **The workspace map is derived from the assigned file list** (`synthesizeKnipWorkspaces`),
      //    and a `package.json` only reaches `run()` via `batch.files` if `buildPlan` considered its
      //    language supported. Without `json`, the one thing this adapter exists to do cannot happen.
      // 2. **Cache invalidation.** Spec §9: "knip has no incremental mode; it is re-run only when
      //    JS/TS files, `package.json` files or the workspace graph changed." A project assignment's
      //    cache key folds in every assigned file's content hash, so declaring these languages is
      //    literally what makes a manifest or tsconfig edit invalidate knip's cached result.
      //
      // `yaml` is deliberately *not* claimed even though `pnpm-workspace.yaml` is part of the
      // workspace graph: this adapter overrides knip's own workspace discovery entirely, so that file
      // no longer influences the outcome — and claiming `yaml` would pull every CI workflow in the
      // repository into knip's assigned file set for nothing.
      languages: ['ts', 'tsx', 'js', 'jsx', 'json', 'jsonc'],
      granularity: 'project',
      // knip consumes a workspace graph; it does not make one available to other engines' rules. Same
      // reasoning as the `tsc` entry's `provides: []` — see the long comment on it in
      // packages/core/src/registry/entries.manual.ts.
      provides: [],
      // knip has a real `--fix`, including file deletion. Wiring it into the fix pipeline (spec §11)
      // is its own milestone; claiming the capability before then would let `sgate fix` promise edits
      // this adapter cannot produce.
      fixes: false,
    },

    async version() {
      // Read, not spawned. `knip --version` is a full Node process launch for a string that is sitting
      // in a manifest this package already knows how to find — and the M0 follow-ups record that a
      // fully-cached run still calls `version()` for every registered engine. `engine-tsc` made the
      // same trade for the same reason.
      const manifest = JSON.parse(await readFile(resolveKnipPackageJson('knip/package.json'), 'utf8')) as {
        version?: string
      }
      if (manifest.version === undefined) throw new EngineError('knip', "knip's package.json declares no version")
      return manifest.version
    },

    async materializeConfig(selection: EngineRuleSelection, context: RunContext) {
      return materializeKnipConfig(
        selection,
        context,
        {
          ...(options.configFile === undefined ? {} : { configFile: options.configFile }),
          ...(options.ignore === undefined ? {} : { ignore: options.ignore }),
        },
      )
    },

    run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      return execute(required(), batch, handle, context, signal)
    },
  }
}

async function* execute(
  invocation: KnipInvocation,
  batch: FileBatch,
  handle: EngineConfigHandle,
  context: RunContext,
  signal: AbortSignal,
): AsyncIterable<RawDiagnostic> {
  // The one place `batch` matters for a project engine — and the one thing that distinguishes this
  // adapter from a bare `knip` run. `engine-tsc` ignores its batch entirely (a tsconfig already
  // declares the program); knip's equivalent declaration is the workspace map, and the repository is
  // under no obligation to have written one. The inventory has, implicitly, by listing every
  // `package.json` in the repository. See `synthesizeKnipWorkspaces`.
  const { include } = await mergeWorkspacesIntoConfig(
    handle.path,
    synthesizeKnipWorkspaces(batch.files),
    context.adjustments ?? [],
  )

  const args = [
    ...invocation.prefixArgs,
    '--config',
    handle.path,
    '--reporter',
    'json',
    // Exit-code handling collapses to "0 or it failed", which is the whole reason this flag is here.
    // Without it knip exits 1 for "found issues" and 2 for "could not run" — the same ambiguity
    // `engine-tsc` had to reason its way through, except knip offers an explicit way out. Confirmed
    // directly against knip 6.31.0: `--no-exit-code` suppresses the issue-count exit *only* — a real
    // failure (a missing `package.json`, an unreadable config) still exits 2.
    '--no-exit-code',
    // Progress goes to stderr, but it is redrawn continuously and pointless for a piped run.
    '--no-progress',
    // Configuration hints are advice about the user's *knip* config — which is ours, synthesized, and
    // not something they can act on.
    '--no-config-hints',
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
    throw new EngineError('knip', `knip failed: ${failure.stderr?.trim() || String(failure.code)}`, { cause: error })
  }

  yield* parseKnipOutput(stdout, context.rootDir, { issueTypes: include })
}
