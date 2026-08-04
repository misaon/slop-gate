import { resolveRun, type ResolvedRun } from '@misaon/slop-gate-core'
import { DEFAULT_CONFIG, loadCliConfig } from '../../config.ts'
import { defaultEngines } from '../../engine-registry.ts'
import { EXIT_CODES } from '../../exit-codes.ts'

export async function prepareRulesRun(rootDir: string): Promise<ResolvedRun | null> {
  const loaded = await loadCliConfig(rootDir, DEFAULT_CONFIG)
  if (loaded.kind === 'error') {
    process.exitCode = EXIT_CODES.config
    return null
  }

  return resolveRun({
    rootDir,
    config: loaded.config,
    ...(loaded.kind === 'loaded' ? { configFile: loaded.configFile } : {}),
    engines: defaultEngines(rootDir, loaded.kind === 'loaded' ? loaded.configFile : undefined, loaded.config.ignore),
  })
}
