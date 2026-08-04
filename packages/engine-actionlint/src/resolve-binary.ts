import {
  resolveToolBinary,
  toolBinaryName,
  toolCacheDir,
  type ResolveToolBinaryOptions,
  type ToolBinaryResolution,
  type ToolBinarySource,
  type ToolBinarySpec,
} from '@misaon/slop-gate-core'
import { ACTIONLINT_VERSION } from './release.ts'

export { CACHE_DIR_ENV } from '@misaon/slop-gate-core'

export type ActionlintSource = ToolBinarySource
export type ActionlintResolution = ToolBinaryResolution
export type ResolveActionlintOptions = ResolveToolBinaryOptions

export const ACTIONLINT_PATH_ENV = 'SLOP_GATE_ACTIONLINT_PATH'

const SPEC: ToolBinarySpec = { tool: 'actionlint', version: ACTIONLINT_VERSION, pathEnv: ACTIONLINT_PATH_ENV }

export function actionlintCacheDir(options: Pick<ResolveActionlintOptions, 'env' | 'homeDir' | 'platform'> = {}): string {
  return toolCacheDir(SPEC, options)
}

export function actionlintBinaryName(platform: string): string {
  return toolBinaryName(SPEC.tool, platform)
}

export function resolveActionlintBinary(options: ResolveActionlintOptions = {}): ActionlintResolution | undefined {
  return resolveToolBinary(SPEC, options)
}
