import { mkdir } from 'node:fs/promises'
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
import { discoverTscProjects } from './projects.ts'
import { resolveTscAcrossWorkspaces, type TscInvocation, type TscResolution } from './resolve-binary.ts'

export { TYPE_ERROR_RULE_ID, parseTscOutput } from './parse.ts'
export { discoverTscProjects } from './projects.ts'
export { resolveTscAcrossWorkspaces, resolveTscBinary, type TscInvocation, type TscResolution } from './resolve-binary.ts'

const MAX_FINDINGS_EXIT_CODE = 2

const UNAVAILABLE_REASON =
  'no `typescript` is installed in this project, and slop-gate deliberately will not fall back to a ' +
  'global one — a type error has to match what your own build reports'

function unavailableReason(resolution: Exclude<TscResolution, { kind: 'resolved' }>): string {
  if (resolution.kind === 'missing') return UNAVAILABLE_REASON
  return (
    `this workspace installs more than one \`typescript\` (${resolution.versions.join(', ')}), so there is no single ` +
    'version whose type errors would match every package\'s own build, and slop-gate will not pick one for you'
  )
}

export type CreateTscEngineOptions = {
  rootDir: string
  tsconfigPath?: string
  cacheDir?: string
  binaryPath?: string
}

export function createTscEngine(options: CreateTscEngineOptions): Engine {
  const tsconfigPath = options.tsconfigPath ?? join(options.rootDir, 'tsconfig.json')
  const cacheDir = options.cacheDir ?? join(options.rootDir, '.slop-gate', 'cache')
  let resolving: Promise<TscResolution> | undefined
  const resolution = (): Promise<TscResolution> => (resolving ??= resolveOnce())

  async function resolveOnce(): Promise<TscResolution> {
    if (options.binaryPath !== undefined) {
      return { kind: 'resolved', invocation: { command: options.binaryPath, prefixArgs: [] }, version: 'unknown', fromDir: options.rootDir }
    }
    const graph = await buildWorkspaceGraph(options.rootDir).catch(() => undefined)
    const dirs = (graph?.nodes ?? []).map((node) => join(options.rootDir, node.dir)).filter((dir) => dir !== options.rootDir)
    return resolveTscAcrossWorkspaces(options.rootDir, dirs)
  }

  let discovering: Promise<readonly string[]> | undefined
  const projects = (): Promise<readonly string[]> =>
    (discovering ??= (async () => {
      const graph = await buildWorkspaceGraph(options.rootDir).catch(() => undefined)
      const workspaceDirs = (graph?.nodes ?? []).map((node) => join(options.rootDir, node.dir))
      return discoverTscProjects({ rootDir: options.rootDir, tsconfigPath, workspaceDirs })
    })())

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
      provides: [],
      fixes: false,
    },

    async availability() {
      const resolved = await resolution()
      if (resolved.kind !== 'resolved') {
        return {
          available: false as const,
          reason: unavailableReason(resolved),
          install: resolved.kind === 'ambiguous' ? 'one typescript version across the workspace, or a `tsc.tsconfigPath` naming one project' : 'npm install -D typescript',
        }
      }

      const found = await projects()
      if (found.length === 0) {
        return {
          available: false as const,
          reason:
            `nothing here declares a TypeScript project to check: no inputs at ${tsconfigPath}, no \`references\` ` +
            'resolving to one, and no workspace package carrying its own tsconfig.json',
          install: 'a tsconfig.json that declares `include` or `files`, or a `tsc.tsconfigPath` naming one',
        }
      }

      return { available: true as const }
    },

    async version(cache) {
      return toolVersion(await required(), /^Version\s+/i, cache)
    },

    async materializeConfig(selection: EngineRuleSelection) {
      return materializeTscConfig(selection, await projects())
    },

    async *run(_batch: FileBatch, _handle: EngineConfigHandle, context: RunContext, signal: AbortSignal) {
      const invocation = await required()
      for (const project of await projects()) yield* execute(invocation, project, cacheDir, context, signal)
    },
  }
}

async function* execute(
  invocation: TscInvocation,
  project: string,
  cacheDir: string,
  context: RunContext,
  signal: AbortSignal,
): AsyncIterable<RawDiagnostic> {
  const buildInfoPath = join(cacheDir, 'tsc', `${hashContent(project).slice(0, 16)}.tsbuildinfo`)
  await mkdir(dirname(buildInfoPath), { recursive: true })

  const args = [
    ...invocation.prefixArgs,
    '-p',
    project,
    '--noEmit',
    '--pretty',
    'false',
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
