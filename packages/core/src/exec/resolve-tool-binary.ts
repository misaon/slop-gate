import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type ToolBinarySource = 'env' | 'path' | 'cache'

export type ToolBinaryResolution = {
  readonly command: string
  readonly source: ToolBinarySource
}

export type ToolBinarySpec = {
  readonly tool: string
  readonly version: string
  readonly pathEnv: string
}

export type ResolveToolBinaryOptions = {
  platform?: string
  env?: Readonly<Record<string, string | undefined>>
  homeDir?: string
  fileExists?: (path: string) => boolean
}

export const CACHE_DIR_ENV = 'SLOP_GATE_CACHE_DIR'

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

export function resolveToolBinary(spec: ToolBinarySpec, options: ResolveToolBinaryOptions = {}): ToolBinaryResolution | undefined {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const fileExists = options.fileExists ?? existsSync
  const binary = toolBinaryName(spec.tool, platform)

  const override = env[spec.pathEnv]
  if (override !== undefined && override !== '') {
    return fileExists(override) ? { command: override, source: 'env' } : undefined
  }

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
