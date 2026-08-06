import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  EngineError,
  isExecFileFailure,
  type ScriptBinInvocation,
  type Engine,
  type EngineConfigHandle,
  type EngineRuleSelection,
  type FileBatch,
  type RawDiagnostic,
  type RunContext,
} from '@misaon/slop-gate-core'
import { materializeKnipConfig, mergeWorkspacesIntoConfig, synthesizeKnipWorkspaces } from './config.ts'
import { parseKnipOutput } from './parse.ts'
import { resolveKnipBinary, resolveKnipPackageJson } from './resolve-binary.ts'

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
export { resolveKnipBinary, resolveKnipPackageJson } from './resolve-binary.ts'

const run = promisify(execFile)

export type CreateKnipEngineOptions = {
  configFile?: string
  ignore?: readonly string[]
  binaryPath?: string
  rootDir?: string
}

const DEPENDENCIES_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const

function declaresDependencies(manifest: unknown): boolean {
  if (typeof manifest !== 'object' || manifest === null) return false
  const record = manifest as Record<string, unknown>
  return DEPENDENCIES_FIELDS.some((field) => {
    const value = record[field]
    return typeof value === 'object' && value !== null && Object.keys(value).length > 0
  })
}

const MISSING_KNIP =
  'the bundled `knip` package could not be resolved from this installation of slop-gate, and it will ' +
  'not fall back to a `knip` on PATH — knip’s version is a property of slop-gate, not of the ' +
  'repository being checked. Reinstall slop-gate.'

export function createKnipEngine(options: CreateKnipEngineOptions = {}): Engine {
  const invocation: ScriptBinInvocation | undefined =
    options.binaryPath === undefined ? resolveKnipBinary() : { command: options.binaryPath, prefixArgs: [] }

  const required = (): ScriptBinInvocation => {
    if (invocation === undefined) throw new EngineError('knip', MISSING_KNIP)
    return invocation
  }

  return {
    id: 'knip',

    capabilities: {
      // Every language that can change the result, not the ones knip lints: a project engine's cache
      // key folds in its assigned files, so an unlisted language that affects analysis yields a stale
      // "clean". `yaml` is out because this adapter replaces knip's workspace discovery; `markdown`
      // is out because it shares an id with every README, which leaves `.mdx` uncovered.
      languages: ['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'astro', 'json', 'jsonc'],
      granularity: 'project',
      provides: [],
      fixes: false,
    },

    async availability() {
      if (options.rootDir === undefined) return { available: true as const }

      const manifest = await readFile(join(options.rootDir, 'package.json'), 'utf8').catch(() => null)
      if (manifest === null) return { available: true as const }

      let parsed: unknown
      try {
        parsed = JSON.parse(manifest)
      } catch {
        return { available: true as const }
      }
      if (!declaresDependencies(parsed)) return { available: true as const }

      const installed = await stat(join(options.rootDir, 'node_modules')).then(
        (entry) => entry.isDirectory(),
        () => false,
      )
      if (installed) return { available: true as const }

      return {
        available: false as const,
        reason:
          'this repository declares dependencies but has no `node_modules`, and knip resolves every import ' +
          'through it — uninstalled it reports imports as unresolved that are not, and misses dead code it ' +
          'would otherwise find, so its answer would be wrong in both directions rather than merely partial',
        install: 'npm install',
      }
    },

    async version() {
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
  invocation: ScriptBinInvocation,
  batch: FileBatch,
  handle: EngineConfigHandle,
  context: RunContext,
  signal: AbortSignal,
): AsyncIterable<RawDiagnostic> {
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
    '--no-exit-code',
    '--no-progress',
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
    const failure = isExecFileFailure(error) ? error : {}
    throw new EngineError('knip', `knip failed: ${failure.stderr?.trim() || String(failure.code)}`, { cause: error })
  }

  yield* parseKnipOutput(stdout, context.rootDir, { issueTypes: include })
}
