import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import {
  EngineError,
  hashContent,
  type Engine,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type FileBatch,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import { materializeTscConfig } from './config.ts'
import { parseTscOutput } from './parse.ts'
import { resolveTscBinary, type TscInvocation } from './resolve-binary.ts'

export { TYPE_ERROR_RULE_ID, parseTscOutput } from './parse.ts'
export { resolveTscBinary, type TscInvocation } from './resolve-binary.ts'

const run = promisify(execFile)

/**
 * A cold run with real diagnostics exits `2`; a warm `--incremental` rerun reporting the exact same,
 * still-unfixed diagnostics exits `1` instead — confirmed directly against tsc 5.9.3 (see
 * `.superpowers/engine-tsc-report.md`). Both mean "tsc ran to completion and reported findings on
 * stdout", never "tsc crashed" — a naive copy of oxlint's own `MAX_FINDINGS_EXIT_CODE = 1` would
 * misclassify every cold run with errors as an engine failure. tsc has no equivalent to oxlint's own
 * "exited 1 because it found lint issues" single convention; this ceiling covers both of its own.
 */
const MAX_FINDINGS_EXIT_CODE = 2

export type CreateTscEngineOptions = {
  /**
   * The project being analysed. Required, unlike `createOxlintEngine`'s options bag: `tsc` is
   * project-granularity (spec §8.1) and `typescript` is a peer dependency resolved from *this*
   * directory, not from wherever `engine-tsc` itself happens to be installed — there is no
   * project-independent default the way there is for a bundled engine.
   */
  rootDir: string
  /** Defaults to `<rootDir>/tsconfig.json`. Scope: a single `-p` invocation — no project references beyond what that already handles, no `--build` mode. */
  tsconfigPath?: string
  /** Defaults to `<rootDir>/.slop-gate/cache`. Where `tsc --incremental`'s own build info is kept (spec §9), so it never writes into the analysed repository itself. */
  cacheDir?: string
  /** Test-only escape hatch, mirroring `createOxlintEngine`'s `binaryPath`: spawned exactly as given, with no `node` prefix. */
  binaryPath?: string
}

export function createTscEngine(options: CreateTscEngineOptions): Engine {
  const tsconfigPath = options.tsconfigPath ?? join(options.rootDir, 'tsconfig.json')
  const cacheDir = options.cacheDir ?? join(options.rootDir, '.slop-gate', 'cache')
  const invocation: TscInvocation =
    options.binaryPath === undefined ? resolveTscBinary(options.rootDir) : { command: options.binaryPath, prefixArgs: [] }

  return {
    id: 'tsc',

    capabilities: {
      languages: ['ts', 'tsx'],
      granularity: 'project',
      // Deliberately empty, not `['types']` — see the long comment on the `tsc` entry in
      // packages/core/src/registry/entries.manual.ts for why declaring that capability here would be
      // actively wrong (it would let arbitration elect a tsgolint-owned type-aware rule the moment
      // `tsc` is merely registered, regardless of whether tsgolint's own wiring can run it yet).
      provides: [],
      fixes: false,
    },

    async version() {
      const { stdout } = await run(invocation.command, [...invocation.prefixArgs, '--version'], { encoding: 'utf8' })
      return stdout.trim().replace(/^Version\s+/i, '')
    },

    async materializeConfig(selection: EngineRuleSelection) {
      return materializeTscConfig(selection, tsconfigPath)
    },

    run(batch: FileBatch, handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      // `batch` is accepted only to satisfy `Engine.run`'s shape — a project-granularity engine
      // decides its own file set from its own project configuration (here, the tsconfig's own
      // `include`/`files`), not from an explicit list the caller assembled. Passing `batch.files` as
      // CLI arguments alongside `-p` is not just unnecessary, it is rejected outright: confirmed
      // directly, `tsc -p tsconfig.json src/a.ts` fails with "error TS5042: Option 'project' cannot
      // be mixed with source files on a command line."
      return execute(invocation, handle, cacheDir, context, signal)
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
  // Named after the tsconfig path's own hash, not a fixed filename: scope today is one `-p`
  // invocation per engine instance, so collisions are not reachable in practice, but a hash costs
  // nothing and keeps this correct the moment a later milestone points more than one `createTscEngine`
  // instance (e.g. per workspace) at the same `cacheDir`.
  const buildInfoPath = join(cacheDir, 'tsc', `${hashContent(handle.path).slice(0, 16)}.tsbuildinfo`)
  await mkdir(dirname(buildInfoPath), { recursive: true })

  const args = [
    ...invocation.prefixArgs,
    '-p',
    handle.path,
    '--noEmit',
    // Two argv entries, not a single `--pretty=false` token: confirmed directly against the real
    // binary that `execFile`'s array-argv form requires the value as its own element. Explicit rather
    // than relying on tsc's own non-TTY auto-detection (which already defaults to the same plain
    // format when stdout is piped, confirmed empirically) — pinning it is what makes the parser's
    // contract with tsc's output explicit rather than incidental.
    '--pretty',
    'false',
    // spec §9: "tsc --incremental is used in addition to our cache, with its build info stored
    // inside .slop-gate/cache/" — confirmed directly that a custom --tsBuildInfoFile path is honoured
    // exactly as given (no sibling file written elsewhere) and that its containing directory is
    // created automatically if missing.
    '--incremental',
    '--tsBuildInfoFile',
    buildInfoPath,
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
      throw new EngineError('tsc', `tsc failed: ${failure.stderr?.trim() || String(failure.code)}`, { cause: error })
    }
  }

  yield* parseTscOutput(stdout, context.rootDir)
}
