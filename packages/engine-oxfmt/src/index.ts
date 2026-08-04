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

const MAX_FINDINGS_EXIT_CODE = 1

const UNAVAILABLE_REASON =
  'the bundled `oxfmt` could not be resolved, so formatting was not checked — slop-gate\'s own installation is incomplete'

export type CreateOxfmtEngineOptions = {
  binaryPath?: string
}

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
        path: 'oxfmt',
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
