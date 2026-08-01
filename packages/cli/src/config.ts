import { relative } from 'node:path'
import { ConfigError, loadConfig, toPosix, type SlopGateConfig } from '@misaon/slop-gate-core'

/** What `check` runs with when no config file is found — `extends: ['recommended']`, so a bare
 *  `sgate check`/`sgate rules ...` in a repository with no `slop-gate.config.ts` still does
 *  something useful rather than nothing. Shared by `check` and every `rules` subcommand so a
 *  no-config run resolves identically no matter which one you ran. */
export const DEFAULT_CONFIG: SlopGateConfig = { extends: ['recommended'] }

export type CliConfig =
  | { kind: 'loaded'; config: SlopGateConfig; configFile: string }
  | { kind: 'default'; config: SlopGateConfig }
  /** A config file exists but failed to load or parse — the `ConfigError`'s message has already
   *  been written to stderr; the caller's only job is to set the config exit code and stop. */
  | { kind: 'error' }

/**
 * Loads `slop-gate.config.ts` (or falls back to `defaultConfig`) the same way for every command
 * that needs it — `check` and the `rules` governance commands must resolve identically from the
 * same repository, or "why is a concept enabled for `check` but not for `rules why`" becomes a bug
 * report about this CLI's own inconsistency rather than about the user's config.
 */
export async function loadCliConfig(rootDir: string, defaultConfig: SlopGateConfig): Promise<CliConfig> {
  let configError = false
  const loaded = await loadConfig(rootDir).catch((error: unknown) => {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`)
      configError = true
      return undefined
    }
    throw error
  })
  if (configError) return { kind: 'error' }
  if (loaded === null || loaded === undefined) return { kind: 'default', config: defaultConfig }
  // `loadConfig` resolves an absolute path (it walks up from `rootDir` to find the file).
  // `configFile` lands verbatim in every `config.*` diagnostic's `file` field, and paths are
  // repo-relative POSIX in every public data structure and output format — the CLI is the
  // boundary that owes core that contract, not core itself.
  return { kind: 'loaded', config: loaded.config, configFile: toPosix(relative(rootDir, loaded.file)) }
}
