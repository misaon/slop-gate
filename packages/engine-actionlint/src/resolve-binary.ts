import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ACTIONLINT_VERSION } from './release.ts'

/** Where a resolved binary came from. Reported so `sgate rules why` can say *which* actionlint ran. */
export type ActionlintSource = 'env' | 'path' | 'cache'

export type ActionlintResolution = {
  readonly command: string
  readonly source: ActionlintSource
}

export type ResolveActionlintOptions = {
  platform?: string
  arch?: string
  env?: Readonly<Record<string, string | undefined>>
  homeDir?: string
  fileExists?: (path: string) => boolean
}

export const ACTIONLINT_PATH_ENV = 'SLOP_GATE_ACTIONLINT_PATH'
export const CACHE_DIR_ENV = 'SLOP_GATE_CACHE_DIR'

/**
 * The versioned cache directory this adapter downloads into.
 *
 * **Version-scoped by construction.** A bump to `ACTIONLINT_VERSION` changes this path, so the old
 * binary is never reused under a new pin — the failure mode where a cache silently outlives the
 * digest that authorised it cannot happen here, because the digest and the directory move together.
 */
export function actionlintCacheDir(options: Pick<ResolveActionlintOptions, 'env' | 'homeDir' | 'platform'> = {}): string {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const home = options.homeDir ?? homedir()

  const explicit = env[CACHE_DIR_ENV]
  if (explicit !== undefined && explicit !== '') return join(explicit, 'actionlint', ACTIONLINT_VERSION)

  const xdg = env['XDG_CACHE_HOME']
  if (xdg !== undefined && xdg !== '') return join(xdg, 'slop-gate', 'actionlint', ACTIONLINT_VERSION)

  const localAppData = env['LOCALAPPDATA']
  if (platform === 'win32' && localAppData !== undefined && localAppData !== '') {
    return join(localAppData, 'slop-gate', 'actionlint', ACTIONLINT_VERSION)
  }

  return join(home, '.cache', 'slop-gate', 'actionlint', ACTIONLINT_VERSION)
}

export function actionlintBinaryName(platform: string): string {
  return platform === 'win32' ? 'actionlint.exe' : 'actionlint'
}

/**
 * Finds actionlint without running anything. **The whole of `availability()`'s budget is here** — a
 * `PATH` walk and a handful of `stat` calls, no spawn and no network, because `sgate rules why` calls
 * availability and an explain-only command must not execute a program or change the machine (see
 * `Engine.availability`).
 *
 * The order is deliberate and is the reason this is not simply "look in our cache":
 *
 * 1. **`SLOP_GATE_ACTIONLINT_PATH`** — an exact path, and if it does not exist this resolves to
 *    nothing rather than falling through. Silently substituting a different binary for the one an
 *    override named is the single outcome an override exists to rule out.
 * 2. **`PATH`** — a machine that already has actionlint must never trigger a download, and must never
 *    have its own installation shadowed by ours. This is also the only route on Windows (see
 *    `ACTIONLINT_ASSETS` on why nothing downloads there) and the escape hatch for air-gapped CI.
 * 3. **The version-scoped cache** — populated only by an explicit `sgate engines install`, never by a
 *    check.
 *
 * A `PATH` actionlint is whatever version the machine has, which is *not* a defect to route around:
 * it is usually newer than the pin, and every false positive the corpus measurement attributed to
 * `syntax-check` was this pinned version not yet knowing about a GitHub feature. `version()` reports
 * what actually ran, so the cache key follows the binary rather than the pin.
 */
export function resolveActionlintBinary(options: ResolveActionlintOptions = {}): ActionlintResolution | undefined {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const fileExists = options.fileExists ?? existsSync
  const binary = actionlintBinaryName(platform)

  const override = env[ACTIONLINT_PATH_ENV]
  if (override !== undefined && override !== '') {
    return fileExists(override) ? { command: override, source: 'env' } : undefined
  }

  // Derived from the `platform` argument rather than taken from `node:path`, whose `delimiter` is a
  // property of the *host*. They agree on every real run; they disagree in a test that drives the
  // Windows branch from a POSIX machine, and a parameter that only half-applies is worse than none.
  for (const directory of (env['PATH'] ?? '').split(platform === 'win32' ? ';' : ':')) {
    if (directory === '') continue
    const candidate = join(directory, binary)
    if (fileExists(candidate)) return { command: candidate, source: 'path' }
  }

  const cached = join(
    actionlintCacheDir({ env, platform, ...(options.homeDir === undefined ? {} : { homeDir: options.homeDir }) }),
    binary,
  )
  return fileExists(cached) ? { command: cached, source: 'cache' } : undefined
}
