import {
  resolveToolBinary,
  toolBinaryName,
  toolCacheDir,
  type ResolveToolBinaryOptions,
  type ToolBinaryResolution,
  type ToolBinarySource,
  type ToolBinarySpec,
} from '@misaon/slop-gate-core'
import { HADOLINT_VERSION } from './release.ts'

export { CACHE_DIR_ENV } from '@misaon/slop-gate-core'

export type HadolintSource = ToolBinarySource
export type HadolintResolution = ToolBinaryResolution
export type ResolveHadolintOptions = ResolveToolBinaryOptions

export const HADOLINT_PATH_ENV = 'SLOP_GATE_HADOLINT_PATH'

const SPEC: ToolBinarySpec = { tool: 'hadolint', version: HADOLINT_VERSION, pathEnv: HADOLINT_PATH_ENV }

export function hadolintCacheDir(options: Pick<ResolveHadolintOptions, 'env' | 'homeDir' | 'platform'> = {}): string {
  return toolCacheDir(SPEC, options)
}

export function hadolintBinaryName(platform: string): string {
  return toolBinaryName(SPEC.tool, platform)
}

export function resolveHadolintBinary(options: ResolveHadolintOptions = {}): HadolintResolution | undefined {
  return resolveToolBinary(SPEC, options)
}
