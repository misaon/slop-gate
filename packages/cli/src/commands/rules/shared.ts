import { resolveRun, type ResolvedRun } from '@misaon/slop-gate-core'
import { REPORTER_NAMES, type ReporterName } from '@misaon/slop-gate-reporters'
import { DEFAULT_CONFIG, loadCliConfig } from '../../config.ts'
import { defaultEngines } from '../../engines.ts'
import { EXIT_CODES } from '../../exit-codes.ts'

/**
 * Loads config and resolves the effective ruleset, election outcome and file inventory for a
 * `rules` governance command — `resolveRun`, the same engine-free boundary `streamCheck` (and so
 * `check`) uses internally, given the same default config and the same engine list `check`
 * registers (see `../../engines.ts`). No engine is ever invoked: `rules why` has no business
 * spawning oxlint.
 *
 * Returns `null` after a config error has already been written to stderr and
 * `process.exitCode` already set to `EXIT_CODES.config` — the caller's only job at that point is
 * to return without rendering anything.
 */
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
    engines: defaultEngines(rootDir),
  })
}

/**
 * Validates `--format` the same way `check` does (same accepted values, same message), writing to
 * stderr and setting the config exit code on a bad value. `true` means the caller may proceed.
 */
export function validateFormat(format: string): format is ReporterName {
  if (REPORTER_NAMES.includes(format as ReporterName)) return true
  process.stderr.write(`unknown format: ${format}. Expected one of ${REPORTER_NAMES.join(', ')}.\n`)
  process.exitCode = EXIT_CODES.config
  return false
}
