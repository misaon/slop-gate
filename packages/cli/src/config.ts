import { relative } from 'node:path'
import { ConfigError, loadConfig, toPosix, type SlopGateConfig } from '@misaon/slop-gate-core'

/** What `check` runs with when no config file is found, so a bare `sgate check`/`sgate rules ...` in a repository
 *  with no `slop-gate.config.ts` still does something useful. Shared by `check` and every `rules` subcommand so a
 *  no-config run resolves identically no matter which one you ran. */
export const DEFAULT_CONFIG: SlopGateConfig = { extends: ['recommended'] }

export type CliConfig =
  | { kind: 'loaded'; config: SlopGateConfig; configFile: string }
  | { kind: 'default'; config: SlopGateConfig }
  /**
   * A config file exists but failed to load or parse. The `ConfigError`'s message has already been written to
   * stderr, so a CLI command's only job is to set the config exit code and stop. `message` carries the same text
   * for a caller with somewhere else to put it: `sgate mcp` has to hand the reason back to the client in the tool
   * result, since an agent told only "configuration failed, look at the server's log" cannot correct it. stderr
   * still gets the write, because for a stdio server that is the operator's only channel.
   */
  | { kind: 'error'; message: string }

/**
 * Loads `slop-gate.config.ts` (or falls back to `defaultConfig`) the same way for every command that needs it —
 * `check` and the `rules` governance commands must resolve identically from the same repository, or "why is a
 * concept enabled for `check` but not for `rules why`" becomes a bug report about this CLI's own inconsistency.
 */
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
  // `loadConfig` resolves an absolute path (it walks up from `rootDir` to find the file), and `configFile` lands
  // verbatim in every `config.*` diagnostic's `file` field. Paths are repo-relative POSIX in every public data
  // structure and output format, and the CLI is the boundary that owes core that contract, not core itself.
  return { kind: 'loaded', config: loaded.config, configFile: toPosix(relative(rootDir, loaded.file)) }
}
