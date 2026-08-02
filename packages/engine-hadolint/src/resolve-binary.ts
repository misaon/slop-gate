import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { HADOLINT_VERSION } from './release.ts'

/** Where a resolved binary came from. Reported so `sgate rules why` can say *which* hadolint ran. */
export type HadolintSource = 'env' | 'path' | 'cache'

export type HadolintResolution = {
  readonly command: string
  readonly source: HadolintSource
}

export type ResolveHadolintOptions = {
  platform?: string
  arch?: string
  env?: Readonly<Record<string, string | undefined>>
  homeDir?: string
  fileExists?: (path: string) => boolean
}

export const HADOLINT_PATH_ENV = 'SLOP_GATE_HADOLINT_PATH'
export const CACHE_DIR_ENV = 'SLOP_GATE_CACHE_DIR'

/**
 * The versioned cache directory this adapter downloads into.
 *
 * **Version-scoped by construction**, exactly as the actionlint adapter's is: a bump to
 * `HADOLINT_VERSION` changes this path, so the old binary is never reused under a new pin and a cache
 * cannot silently outlive the digest that authorised it.
 */
export function hadolintCacheDir(options: Pick<ResolveHadolintOptions, 'env' | 'homeDir' | 'platform'> = {}): string {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const home = options.homeDir ?? homedir()

  const explicit = env[CACHE_DIR_ENV]
  if (explicit !== undefined && explicit !== '') return join(explicit, 'hadolint', HADOLINT_VERSION)

  const xdg = env['XDG_CACHE_HOME']
  if (xdg !== undefined && xdg !== '') return join(xdg, 'slop-gate', 'hadolint', HADOLINT_VERSION)

  const localAppData = env['LOCALAPPDATA']
  if (platform === 'win32' && localAppData !== undefined && localAppData !== '') {
    return join(localAppData, 'slop-gate', 'hadolint', HADOLINT_VERSION)
  }

  return join(home, '.cache', 'slop-gate', 'hadolint', HADOLINT_VERSION)
}

export function hadolintBinaryName(platform: string): string {
  return platform === 'win32' ? 'hadolint.exe' : 'hadolint'
}

/**
 * Finds hadolint without running anything — a `PATH` walk and a handful of `stat` calls, no spawn and
 * no network, because `Engine.availability` is contractually filesystem-only and `sgate rules why`
 * calls it.
 *
 * Order is `SLOP_GATE_HADOLINT_PATH`, then `PATH`, then the version-scoped cache, for the reasons the
 * actionlint resolver records: an override that silently falls through to a different binary defeats
 * the point of an override, a machine that already has hadolint must never download or be shadowed,
 * and the cache is populated only by an explicit `sgate engines install`.
 */
export function resolveHadolintBinary(options: ResolveHadolintOptions = {}): HadolintResolution | undefined {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const fileExists = options.fileExists ?? existsSync
  const binary = hadolintBinaryName(platform)

  const override = env[HADOLINT_PATH_ENV]
  if (override !== undefined && override !== '') {
    return fileExists(override) ? { command: override, source: 'env' } : undefined
  }

  // Derived from the `platform` argument rather than `node:path`'s `delimiter`, which is a property
  // of the host and would only half-apply when a test drives the Windows branch from POSIX.
  for (const directory of (env['PATH'] ?? '').split(platform === 'win32' ? ';' : ':')) {
    if (directory === '') continue
    const candidate = join(directory, binary)
    if (fileExists(candidate)) return { command: candidate, source: 'path' }
  }

  const cached = join(
    hadolintCacheDir({ env, platform, ...(options.homeDir === undefined ? {} : { homeDir: options.homeDir }) }),
    binary,
  )
  return fileExists(cached) ? { command: cached, source: 'cache' } : undefined
}
