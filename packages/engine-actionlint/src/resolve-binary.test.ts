import { join } from 'node:path'
import { expect, test } from 'vitest'
import { actionlintCacheDir, resolveActionlintBinary } from './resolve-binary.ts'
import { ACTIONLINT_VERSION } from './release.ts'

const options = (overrides: Partial<Parameters<typeof resolveActionlintBinary>[0]> = {}) => ({
  platform: 'linux',
  arch: 'x64',
  env: {},
  homeDir: '/home/dev',
  fileExists: () => false,
  ...overrides,
})

test('the environment override wins over everything else, and is reported as such', () => {
  const resolved = resolveActionlintBinary(
    options({
      env: { SLOP_GATE_ACTIONLINT_PATH: '/opt/pinned/actionlint', PATH: '/usr/bin' },
      fileExists: () => true,
    }),
  )
  expect(resolved).toEqual({ command: '/opt/pinned/actionlint', source: 'env' })
})

test('an environment override naming a file that does not exist resolves to nothing rather than falling through', () => {
  // Falling back would turn a typo in the override into "we silently used a different binary than
  // you asked for" — the one outcome an override exists to make impossible.
  const resolved = resolveActionlintBinary(
    options({
      env: { SLOP_GATE_ACTIONLINT_PATH: '/opt/typo/actionlint', PATH: '/usr/bin' },
      fileExists: (path) => path === join('/usr/bin', 'actionlint'),
    }),
  )
  expect(resolved).toBeUndefined()
})

test('PATH is searched in order, and the first hit wins', () => {
  const resolved = resolveActionlintBinary(
    options({
      env: { PATH: ['/empty', '/opt/homebrew/bin', '/usr/local/bin'].join(':') },
      fileExists: (path) => path === join('/opt/homebrew/bin', 'actionlint') || path === join('/usr/local/bin', 'actionlint'),
    }),
  )
  expect(resolved).toEqual({ command: join('/opt/homebrew/bin', 'actionlint'), source: 'path' })
})

test('an already-installed PATH binary is preferred over a populated cache', () => {
  // The whole point of discovering PATH first: a machine that already has actionlint must never
  // trigger a download, and must never quietly run our copy instead of the one the user installed.
  const cached = join(actionlintCacheDir({ env: {}, homeDir: '/home/dev', platform: 'linux' }), 'actionlint')
  const resolved = resolveActionlintBinary(
    options({ env: { PATH: '/usr/bin' }, fileExists: (path) => path === join('/usr/bin', 'actionlint') || path === cached }),
  )
  expect(resolved).toEqual({ command: join('/usr/bin', 'actionlint'), source: 'path' })
})

test('the cache is the last resort, and only when it is already populated', () => {
  const cached = join(actionlintCacheDir({ env: {}, homeDir: '/home/dev', platform: 'linux' }), 'actionlint')
  expect(resolveActionlintBinary(options({ env: { PATH: '/usr/bin' }, fileExists: (path) => path === cached }))).toEqual({
    command: cached,
    source: 'cache',
  })
  expect(resolveActionlintBinary(options({ env: { PATH: '/usr/bin' } }))).toBeUndefined()
})

test('Windows looks for actionlint.exe, on PATH and in the cache alike', () => {
  const resolved = resolveActionlintBinary(
    options({
      platform: 'win32',
      env: { PATH: 'C:\\tools', LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' },
      fileExists: (path) => path === join('C:\\tools', 'actionlint.exe'),
    }),
  )
  expect(resolved).toEqual({ command: join('C:\\tools', 'actionlint.exe'), source: 'path' })
})

test('an absent PATH is not a crash', () => {
  expect(resolveActionlintBinary(options({ env: {} }))).toBeUndefined()
})

test('the cache directory is version-scoped, so a version bump never runs the old binary', () => {
  const dir = actionlintCacheDir({ env: {}, homeDir: '/home/dev', platform: 'linux' })
  expect(dir).toBe(join('/home/dev', '.cache', 'slop-gate', 'actionlint', ACTIONLINT_VERSION))
})

test('the cache directory honours SLOP_GATE_CACHE_DIR, then XDG_CACHE_HOME, then the platform default', () => {
  expect(
    actionlintCacheDir({ env: { SLOP_GATE_CACHE_DIR: '/cache', XDG_CACHE_HOME: '/xdg' }, homeDir: '/home/dev', platform: 'linux' }),
  ).toBe(join('/cache', 'actionlint', ACTIONLINT_VERSION))
  expect(actionlintCacheDir({ env: { XDG_CACHE_HOME: '/xdg' }, homeDir: '/home/dev', platform: 'linux' })).toBe(
    join('/xdg', 'slop-gate', 'actionlint', ACTIONLINT_VERSION),
  )
  expect(
    actionlintCacheDir({ env: { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' }, homeDir: 'C:\\Users\\dev', platform: 'win32' }),
  ).toBe(join('C:\\Users\\dev\\AppData\\Local', 'slop-gate', 'actionlint', ACTIONLINT_VERSION))
})
