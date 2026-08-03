import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Where a resolved binary came from. Reported so `sgate rules why` can say *which* binary ran. */
export type ToolBinarySource = 'env' | 'path' | 'cache'

export type ToolBinaryResolution = {
  readonly command: string
  readonly source: ToolBinarySource
}

/**
 * Everything that distinguishes one externally-installed tool from another here. The discovery order,
 * the cache layout and the Windows suffix are shared, because they are properties of slop-gate rather
 * than of the tool.
 */
export type ToolBinarySpec = {
  /** The executable's base name, which is also its cache subdirectory: `actionlint`, `hadolint`. */
  readonly tool: string
  /** The pinned release. It scopes the cache directory — see `toolCacheDir`. */
  readonly version: string
  /** The variable naming an exact binary to use, e.g. `SLOP_GATE_ACTIONLINT_PATH`. */
  readonly pathEnv: string
}

export type ResolveToolBinaryOptions = {
  platform?: string
  env?: Readonly<Record<string, string | undefined>>
  homeDir?: string
  fileExists?: (path: string) => boolean
}

export const CACHE_DIR_ENV = 'SLOP_GATE_CACHE_DIR'

/**
 * The versioned cache directory an adapter downloads into.
 *
 * **Version-scoped by construction.** A bump to the spec's `version` changes this path, so the old
 * binary is never reused under a new pin — the failure mode where a cache silently outlives the digest
 * that authorised it cannot happen here, because the digest and the directory move together.
 */
export function toolCacheDir(
  spec: ToolBinarySpec,
  options: Pick<ResolveToolBinaryOptions, 'env' | 'homeDir' | 'platform'> = {},
): string {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const home = options.homeDir ?? homedir()

  const explicit = env[CACHE_DIR_ENV]
  if (explicit !== undefined && explicit !== '') return join(explicit, spec.tool, spec.version)

  const xdg = env['XDG_CACHE_HOME']
  if (xdg !== undefined && xdg !== '') return join(xdg, 'slop-gate', spec.tool, spec.version)

  const localAppData = env['LOCALAPPDATA']
  if (platform === 'win32' && localAppData !== undefined && localAppData !== '') {
    return join(localAppData, 'slop-gate', spec.tool, spec.version)
  }

  return join(home, '.cache', 'slop-gate', spec.tool, spec.version)
}

export function toolBinaryName(tool: string, platform: string): string {
  return platform === 'win32' ? `${tool}.exe` : tool
}

/**
 * Finds an externally-installed tool without running anything. **The whole of an `availability()`
 * budget is here** — a `PATH` walk and a handful of `stat` calls, no spawn and no network, because
 * `sgate rules why` calls availability and an explain-only command must not execute a program or
 * change the machine (see `Engine.availability`).
 *
 * The order is deliberate and is the reason this is not simply "look in our cache":
 *
 * 1. **`spec.pathEnv`** — an exact path, and if it does not exist this resolves to nothing rather than
 *    falling through. Silently substituting a different binary for the one an override named is the
 *    single outcome an override exists to rule out.
 * 2. **`PATH`** — a machine that already has the tool must never trigger a download, and must never
 *    have its own installation shadowed by ours. It is also the escape hatch for air-gapped CI, and
 *    the only route on any platform an adapter ships no download for.
 * 3. **The version-scoped cache** — populated only by an explicit `sgate engines install`, never by a
 *    check.
 *
 * A `PATH` binary is whatever version the machine has, which is *not* a defect to route around: it is
 * usually newer than the pin, and a pinned version not yet knowing about an upstream feature is a
 * measured source of false positives. Each adapter's `version()` reports what actually ran, so the
 * cache key follows the binary rather than the pin.
 */
export function resolveToolBinary(spec: ToolBinarySpec, options: ResolveToolBinaryOptions = {}): ToolBinaryResolution | undefined {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const fileExists = options.fileExists ?? existsSync
  const binary = toolBinaryName(spec.tool, platform)

  const override = env[spec.pathEnv]
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
    toolCacheDir(spec, { env, platform, ...(options.homeDir === undefined ? {} : { homeDir: options.homeDir }) }),
    binary,
  )
  return fileExists(cached) ? { command: cached, source: 'cache' } : undefined
}
