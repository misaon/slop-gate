import { access, mkdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
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

      for (const project of found) {
        const missing = await unresolvedExtends(project)
        if (missing !== undefined) {
          return {
            available: false as const,
            reason:
              `${project} extends \`${missing}\`, which is not there. A generated tsconfig (Nuxt writes ` +
              '`.nuxt/tsconfig.json`, and other frameworks do the same) exists only after that ' +
              'framework’s prepare step has run, so nothing here was typechecked',
            install: 'the project’s own prepare or codegen step — `nuxt prepare` for Nuxt',
          }
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

// tsconfig is JSONC and may carry comments and trailing commas, so the target is matched rather than
// parsed — enough to answer "does this file exist", which is the only question here.
const EXTENDS = /"extends"\s*:\s*(?:"([^"]+)"|\[([^\]]*)\])/

async function unresolvedExtends(project: string): Promise<string | undefined> {
  const source = await readFile(project, 'utf8').catch(() => null)
  if (source === null) return undefined

  const match = EXTENDS.exec(source)
  if (match === null) return undefined

  const specifiers =
    match[1] !== undefined ? [match[1]] : [...(match[2] ?? '').matchAll(/"([^"]+)"/g)].map((entry) => entry[1] as string)

  for (const specifier of specifiers) {
    // Only relative targets are answered. A bare one is a package, and whether it resolves depends on
    // a module resolution this probe is not allowed to run.
    if (!specifier.startsWith('.')) continue
    const target = resolve(dirname(project), specifier.endsWith('.json') ? specifier : `${specifier}.json`)
    if (!(await access(target).then(() => true, () => false))) return specifier
  }
  return undefined
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
    // `rootDir` is an *emit* setting, and nothing here emits — but tsc still enforces it while
    // building the program, so a project that keeps tests outside `rootDir` (the NestJS scaffold:
    // `rootDir: ./src`, tests in `test/`, `nest build` on a separate tsconfig) failed with one
    // TS6059 per file and got no type checking at all. Widened to the analysed root, which changes
    // no diagnostic: a real type error still reports.
    '--rootDir',
    context.rootDir,
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
