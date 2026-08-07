import { join } from 'node:path'
import { expect, test } from 'vitest'
import { resolveToolBinary, toolBinaryName, toolCacheDir, type ToolBinarySpec } from './resolve-tool-binary.ts'

const SPEC: ToolBinarySpec = { tool: 'toolish', version: '1.2.3', pathEnv: 'SLOP_GATE_TOOLISH_PATH' }

const exists = (...paths: readonly string[]) => {
  const set = new Set(paths)
  return (path: string) => set.has(path)
}

const options = (overrides: Partial<Parameters<typeof resolveToolBinary>[1]> = {}) => ({
  platform: 'linux',
  env: {},
  homeDir: '/home/dev',
  fileExists: () => false,
  ...overrides,
})

const cachedBinary = (platform = 'linux', env: Record<string, string> = {}) =>
  join(toolCacheDir(SPEC, { platform, env, homeDir: '/home/dev' }), toolBinaryName(SPEC.tool, platform))

test('the environment override wins over everything else, and is reported as such', () => {
  const override = join('/opt', 'pinned', 'toolish')
  const resolved = resolveToolBinary(
    SPEC,
    options({
      env: { [SPEC.pathEnv]: override, PATH: '/usr/bin' },
      fileExists: exists(override, join('/usr/bin', 'toolish'), cachedBinary()),
    }),
  )
  expect(resolved).toEqual({ command: override, source: 'env' })
})

test('an environment override naming a file that does not exist resolves to nothing rather than falling through', () => {
  const resolved = resolveToolBinary(
    SPEC,
    options({
      env: { [SPEC.pathEnv]: join('/opt', 'typo', 'toolish'), PATH: '/usr/bin' },
      fileExists: exists(join('/usr/bin', 'toolish')),
    }),
  )
  expect(resolved).toBeUndefined()
})

test('pATH is searched in order, and the first hit wins', () => {
  const resolved = resolveToolBinary(
    SPEC,
    options({
      env: { PATH: ['/opt/homebrew/bin', '/usr/local/bin'].join(':') },
      fileExists: exists(join('/opt/homebrew/bin', 'toolish'), join('/usr/local/bin', 'toolish')),
    }),
  )
  expect(resolved).toEqual({ command: join('/opt/homebrew/bin', 'toolish'), source: 'path' })
})

test('an empty PATH entry is skipped rather than resolved against the working directory', () => {
  const probed: string[] = []
  const resolved = resolveToolBinary(
    SPEC,
    options({
      env: { PATH: ['', '/usr/bin', ''].join(':') },
      fileExists: (path) => {
        probed.push(path)
        return false
      },
    }),
  )
  expect(resolved).toBeUndefined()
  expect(probed).toEqual([join('/usr/bin', 'toolish'), cachedBinary()])
})

test('an already-installed PATH binary is preferred over a populated cache', () => {
  const onPath = join('/usr/bin', 'toolish')
  const resolved = resolveToolBinary(SPEC, options({ env: { PATH: '/usr/bin' }, fileExists: exists(onPath, cachedBinary()) }))
  expect(resolved).toEqual({ command: onPath, source: 'path' })
})

test('the cache is the last resort, and only when it is already populated', () => {
  const cached = cachedBinary()
  expect(resolveToolBinary(SPEC, options({ env: { PATH: '/usr/bin' }, fileExists: exists(cached) }))).toEqual({
    command: cached,
    source: 'cache',
  })
  expect(resolveToolBinary(SPEC, options({ env: { PATH: '/usr/bin' } }))).toBeUndefined()
})

test('nothing anywhere resolves to undefined, which is what makes an engine unavailable', () => {
  expect(resolveToolBinary(SPEC, options({ env: { PATH: '/usr/bin' } }))).toBeUndefined()
})

test('an absent PATH is not a crash', () => {
  expect(resolveToolBinary(SPEC, options({ env: {} }))).toBeUndefined()
})

test('windows looks for toolish.exe, on PATH and in the cache alike', () => {
  const onPath = join(String.raw`C:\tools`, 'toolish.exe')
  expect(
    resolveToolBinary(SPEC, options({ platform: 'win32', env: { PATH: 'C:\\tools' }, fileExists: exists(onPath) })),
  ).toEqual({ command: onPath, source: 'path' })

  const env = { PATH: 'C:\\tools', LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' }
  const cached = cachedBinary('win32', env)
  expect(cached.endsWith('toolish.exe')).toBe(true)
  expect(resolveToolBinary(SPEC, options({ platform: 'win32', env, fileExists: exists(cached) }))).toEqual({
    command: cached,
    source: 'cache',
  })
})

test('the PATH separator follows the requested platform, not the host', () => {
  const onPath = join(String.raw`C:\tools`, 'toolish.exe')
  expect(
    resolveToolBinary(
      SPEC,
      options({ platform: 'win32', env: { PATH: [String.raw`C:\Windows`, String.raw`C:\tools`].join(';') }, fileExists: exists(onPath) }),
    ),
  ).toEqual({ command: onPath, source: 'path' })
})

test('the binary name gains .exe only on Windows', () => {
  expect(toolBinaryName('toolish', 'win32')).toBe('toolish.exe')
  expect(toolBinaryName('toolish', 'linux')).toBe('toolish')
  expect(toolBinaryName('toolish', 'darwin')).toBe('toolish')
})

test('the cache directory is version-scoped, so a version bump never runs the old binary', () => {
  expect(toolCacheDir(SPEC, { env: {}, homeDir: '/home/dev', platform: 'linux' })).toBe(
    join('/home/dev', '.cache', 'slop-gate', 'toolish', '1.2.3'),
  )
})

test('the cache directory honours SLOP_GATE_CACHE_DIR, then XDG_CACHE_HOME, then the platform default', () => {
  expect(
    toolCacheDir(SPEC, { env: { SLOP_GATE_CACHE_DIR: '/cache', XDG_CACHE_HOME: '/xdg' }, homeDir: '/home/dev', platform: 'linux' }),
  ).toBe(join('/cache', 'toolish', '1.2.3'))
  expect(toolCacheDir(SPEC, { env: { XDG_CACHE_HOME: '/xdg' }, homeDir: '/home/dev', platform: 'linux' })).toBe(
    join('/xdg', 'slop-gate', 'toolish', '1.2.3'),
  )
  expect(
    toolCacheDir(SPEC, { env: { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' }, homeDir: 'C:\\Users\\dev', platform: 'win32' }),
  ).toBe(join(String.raw`C:\Users\dev\AppData\Local`, 'slop-gate', 'toolish', '1.2.3'))
})

test('lOCALAPPDATA is honoured only on Windows, so a POSIX machine that happens to set it is unaffected', () => {
  expect(
    toolCacheDir(SPEC, { env: { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' }, homeDir: '/home/dev', platform: 'linux' }),
  ).toBe(join('/home/dev', '.cache', 'slop-gate', 'toolish', '1.2.3'))
})
