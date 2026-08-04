import { relative } from 'node:path'
import { ConfigError, loadConfig, toPosix, type SlopGateConfig } from '@misaon/slop-gate-core'

export const DEFAULT_CONFIG: SlopGateConfig = { extends: ['recommended'] }

export type CliConfig =
  | { kind: 'loaded'; config: SlopGateConfig; configFile: string }
  | { kind: 'default'; config: SlopGateConfig }
  | { kind: 'error'; message: string }

export async function loadCliConfig(rootDir: string, defaultConfig: SlopGateConfig): Promise<CliConfig> {
  let configError: string | undefined
  const loaded = await loadConfig(rootDir).catch((error: unknown) => {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`)
      configError = error.message
      return undefined
    }
    throw error
  })
  if (configError !== undefined) return { kind: 'error', message: configError }
  if (loaded === null || loaded === undefined) return { kind: 'default', config: defaultConfig }
  return { kind: 'loaded', config: loaded.config, configFile: toPosix(relative(rootDir, loaded.file)) }
}
