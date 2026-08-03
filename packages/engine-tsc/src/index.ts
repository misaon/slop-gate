import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  EngineError,
  buildWorkspaceGraph,
  hashContent,
  runEngineTool,
  toolVersion,
  type Engine,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type FileBatch,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import { materializeTscConfig } from './config.ts'
import { parseTscOutput } from './parse.ts'
import { resolveTscAcrossWorkspaces, type TscInvocation, type TscResolution } from './resolve-binary.ts'

export { TYPE_ERROR_RULE_ID, parseTscOutput } from './parse.ts'
export { resolveTscAcrossWorkspaces, resolveTscBinary, type TscInvocation, type TscResolution } from './resolve-binary.ts'

/**
 * Confirmed against tsc 5.9.3: a cold run with real diagnostics exits `2`, while a warm `--incremental` rerun
 * reporting the same still-unfixed diagnostics exits `1`. Both mean "ran to completion and reported findings on
 * stdout", never "crashed" — copying oxlint's own `MAX_FINDINGS_EXIT_CODE = 1` would misclassify every cold run
 * with errors as an engine failure, so the ceiling has to cover both of tsc's codes.
 */
const MAX_FINDINGS_EXIT_CODE = 2

const UNAVAILABLE_REASON =
  'no `typescript` is installed in this project, and slop-gate deliberately will not fall back to a ' +
  'global one — a type error has to match what your own build reports'

/**
 * Only `ambiguous` needs words of its own: `missing` now genuinely means no workspace package has a
 * `typescript` either, which is the claim `UNAVAILABLE_REASON` was already making and getting wrong.
 */
function unavailableReason(resolution: Exclude<TscResolution, { kind: 'resolved' }>): string {
  if (resolution.kind === 'missing') return UNAVAILABLE_REASON
  return (
    `this workspace installs more than one \`typescript\` (${resolution.versions.join(', ')}), so there is no single ` +
    'version whose type errors would match every package\'s own build, and slop-gate will not pick one for you'
  )
}

/**
 * Whether `tsc -p` on this config would typecheck nothing.
 *
 * A monorepo root commonly holds `{"files": [], "references": [...]}` — a *solution* config, whose only job
 * is to list the real projects. `references` are followed by `tsc --build` and by nothing else, and this
 * engine runs `-p` (see `run()`), so on that shape tsc exits 0 having read no source at all. Reporting
 * "available, no type errors" from that is the worst of the three possible answers, because it is
 * indistinguishable from a repository that genuinely typechecks. Measured on a real monorepo whose root is
 * exactly this: `sgate check` ran tsc, found 0, and had typechecked 0 of 2,030 files.
 *
 * Comments and trailing commas are legal in a tsconfig, so this reads the shape with a tolerant scan rather
 * than `JSON.parse`, and errs toward *available*: a config it cannot make sense of is left to tsc, which
 * reports its own error rather than being silently skipped.
 */
function isSolutionStyle(source: string): boolean {
  const withoutComments = source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '')
  const hasReferences = /"references"\s*:\s*\[\s*\{/.test(withoutComments)
  const emptyFiles = /"files"\s*:\s*\[\s*\]/.test(withoutComments)
  const hasInclude = /"include"\s*:\s*\[\s*"/.test(withoutComments)
  return hasReferences && emptyFiles && !hasInclude
}

export type CreateTscEngineOptions = {
  /**
   * The project being analysed, required: `tsc` is project-granularity (spec §8.1) and `typescript` is a peer
   * dependency resolved from *this* directory, not from wherever `engine-tsc` itself happens to be installed.
   */
  rootDir: string
  /** Defaults to `<rootDir>/tsconfig.json`. Scope is a single `-p` invocation — no project references beyond what that handles, no `--build` mode. */
  tsconfigPath?: string
  /** Defaults to `<rootDir>/.slop-gate/cache`. Where `tsc --incremental` keeps its build info (spec §9), never inside the analysed repository. */
  cacheDir?: string
  /** Test-only escape hatch: spawned exactly as given, with no `node` prefix. */
  binaryPath?: string
}

export function createTscEngine(options: CreateTscEngineOptions): Engine {
  const tsconfigPath = options.tsconfigPath ?? join(options.rootDir, 'tsconfig.json')
  const cacheDir = options.cacheDir ?? join(options.rootDir, '.slop-gate', 'cache')
  /**
   * Resolved once, on first ask rather than in the constructor, because finding the repository's
   * `typescript` now means reading its workspace graph and the constructor cannot await. Memoised on the
   * promise so `availability()` and `run()` share one answer and one set of file reads.
   */
  let resolving: Promise<TscResolution> | undefined
  const resolution = (): Promise<TscResolution> => (resolving ??= resolveOnce())

  async function resolveOnce(): Promise<TscResolution> {
    if (options.binaryPath !== undefined) {
      return { kind: 'resolved', invocation: { command: options.binaryPath, prefixArgs: [] }, version: 'unknown', fromDir: options.rootDir }
    }
    // A repository with no workspace configuration yields the root node alone, which the root-first
    // branch has already tried — so this costs nothing where it cannot help.
    const graph = await buildWorkspaceGraph(options.rootDir).catch(() => undefined)
    const dirs = (graph?.nodes ?? []).map((node) => join(options.rootDir, node.dir)).filter((dir) => dir !== options.rootDir)
    return resolveTscAcrossWorkspaces(options.rootDir, dirs)
  }

  const required = async (): Promise<TscInvocation> => {
    const resolved = await resolution()
    if (resolved.kind !== 'resolved') throw new EngineError('tsc', unavailableReason(resolved))
    return resolved.invocation
  }

  return {
    id: 'tsc',

    capabilities: {
      languages: ['ts', 'tsx'],
      granularity: 'project',
      // Deliberately empty, not `['types']`: declaring it would let arbitration elect a tsgolint-owned
      // type-aware rule the moment `tsc` is merely registered, whether or not tsgolint's own wiring can run it
      // yet — see the `tsc` entry in packages/core/src/registry/entries.uncatalogued.ts.
      provides: [],
      fixes: false,
    },

    /**
     * Declared for a *bundled* engine, which `Engine.availability`'s own doc calls noise — earned because
     * `types.type-error` is in `recommended` and, while `typescript` is present by construction, the **project**
     * is not. `run()` invokes `tsc -p <tsconfigPath>` with no discovery, so a monorepo whose packages each carry
     * their own tsconfig and whose root carries none makes tsc exit `TS5058: The specified path does not exist`.
     * Before this probe that was an `EngineError` and exit 3 — a default preset failing every `sgate check` on a
     * package-based repository. A missing project is a *coverage gap* instead: nothing typechecked, said aloud.
     *
     * It deliberately does not go looking for a tsconfig elsewhere — guessing which of a monorepo's tsconfigs is
     * *the* project is how you silently typecheck a quarter of a repository and call it covered; `tsconfigPath`
     * is how to name it. The `typescript` install is a different question and *is* searched for across the
     * workspace (`resolveTscAcrossWorkspaces`), because there the packages either agree on one version or the
     * disagreement is itself reportable — neither is a guess. **Two preconditions, not one**: a project *and* a
     * `typescript` to check it with, never a bare `tsc` on `PATH`. Spec §13.1 wants the repository's own version, and that fallback happens to work on
     * POSIX yet **cannot ever work on Windows**, where `execFile` without a shell will not run `tsc.cmd` by bare
     * name — `spawn tsc ENOENT`, an `EngineError`, exit 3, the whole run dead.
     */
    async availability() {
      const resolved = await resolution()
      if (resolved.kind !== 'resolved') {
        return {
          available: false as const,
          reason: unavailableReason(resolved),
          install: resolved.kind === 'ambiguous' ? 'one typescript version across the workspace, or a `tsc.tsconfigPath` naming one project' : 'npm install -D typescript',
        }
      }

      const source = await readFile(tsconfigPath, 'utf8').catch(() => undefined)
      if (source === undefined) {
        return {
          available: false as const,
          reason: `no tsconfig.json at ${tsconfigPath}, so nothing here declares what "the project" is and nothing was typechecked`,
          install: 'a root tsconfig.json, or a tsconfigPath naming the project to check',
        }
      }

      if (isSolutionStyle(source)) {
        return {
          available: false as const,
          reason:
            `${tsconfigPath} is a solution-style tsconfig — it declares \`references\` and no input files of its ` +
            'own, so `tsc -p` on it would typecheck zero files and report a clean project either way',
          install: 'a `tsc.tsconfigPath` naming one of the referenced projects',
        }
      }

      return { available: true as const }
    },

    async version(cache) {
      return toolVersion(await required(), /^Version\s+/i, cache)
    },

    async materializeConfig(selection: EngineRuleSelection) {
      return materializeTscConfig(selection, tsconfigPath)
    },

    // A generator rather than an `async` function returning one: `Engine.run` is declared to return the
    // iterable itself, so awaiting the now-async binary resolution has to happen *inside* it.
    async *run(_batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      // Underscored because it is genuinely unread, accepted only to satisfy `Engine.run`'s shape — a
      // project-granularity engine takes its file set from its own tsconfig's `include`/`files`. Passing those
      // files alongside `-p` is rejected outright: confirmed directly, `tsc -p tsconfig.json src/a.ts` fails
      // with "error TS5042: Option 'project' cannot be mixed with source files on a command line."
      yield* execute(await required(), handle, cacheDir, context, signal)
    },
  }
}

async function* execute(
  invocation: TscInvocation,
  handle: EngineConfigHandle,
  cacheDir: string,
  context: RunContext,
  signal: AbortSignal,
): AsyncIterable<RawDiagnostic> {
  // Hashed per tsconfig rather than a fixed filename: two `createTscEngine` instances may share one `cacheDir`.
  const buildInfoPath = join(cacheDir, 'tsc', `${hashContent(handle.path).slice(0, 16)}.tsbuildinfo`)
  await mkdir(dirname(buildInfoPath), { recursive: true })

  const args = [
    ...invocation.prefixArgs,
    '-p',
    handle.path,
    '--noEmit',
    // Two argv entries, not a single `--pretty=false` token: confirmed directly against the real binary that
    // `execFile`'s array-argv form requires the value as its own element. Pinned rather than left to tsc's own
    // non-TTY auto-detection, so the parser's contract with tsc's output is explicit rather than incidental.
    '--pretty',
    'false',
    // spec §9 keeps tsc's own build info inside `.slop-gate/cache/`; confirmed directly that a custom
    // `--tsBuildInfoFile` path is honoured exactly as given, with no sibling file written elsewhere.
    '--incremental',
    '--tsBuildInfoFile',
    buildInfoPath,
  ]

  const { stdout } = await runEngineTool({
    engine: 'tsc',
    command: invocation.command,
    args,
    cwd: context.rootDir,
    signal,
    maxFindingsExitCode: MAX_FINDINGS_EXIT_CODE,
  })

  yield* parseTscOutput(stdout, context.rootDir)
}
