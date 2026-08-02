import { join } from 'node:path'
import { expect, test } from 'vitest'
import { HADOLINT_PATH_ENV, hadolintBinaryName, hadolintCacheDir, resolveHadolintBinary } from './resolve-binary.ts'
import { HADOLINT_VERSION } from './release.ts'

const exists = (...paths: readonly string[]) => {
  const set = new Set(paths)
  return (path: string) => set.has(path)
}

test('the explicit override wins over everything else', () => {
  const override = join('/opt', 'custom', 'hadolint')
  const onPath = join('/usr', 'bin', 'hadolint')
  expect(
    resolveHadolintBinary({
      platform: 'linux',
      env: { [HADOLINT_PATH_ENV]: override, PATH: '/usr/bin' },
      fileExists: exists(override, onPath),
    }),
  ).toEqual({ command: override, source: 'env' })
})

test('an override that does not exist resolves to nothing rather than falling through', () => {
  // Silently substituting a different binary for the one an override named is the single outcome an
  // override exists to rule out.
  const onPath = join('/usr', 'bin', 'hadolint')
  expect(
    resolveHadolintBinary({
      platform: 'linux',
      env: { [HADOLINT_PATH_ENV]: join('/opt', 'missing'), PATH: '/usr/bin' },
      fileExists: exists(onPath),
    }),
  ).toBeUndefined()
})

test('PATH is preferred over our own cache, so an existing install is never shadowed', () => {
  const onPath = join('/usr', 'local', 'bin', 'hadolint')
  const cached = join(hadolintCacheDir({ platform: 'linux', env: {}, homeDir: '/home/u' }), 'hadolint')
  expect(
    resolveHadolintBinary({
      platform: 'linux',
      env: { PATH: ['/usr/bin', '/usr/local/bin'].join(':') },
      homeDir: '/home/u',
      fileExists: exists(onPath, cached),
    }),
  ).toEqual({ command: onPath, source: 'path' })
})

test('the cache is the last resort', () => {
  const cached = join(hadolintCacheDir({ platform: 'linux', env: {}, homeDir: '/home/u' }), 'hadolint')
  expect(
    resolveHadolintBinary({ platform: 'linux', env: { PATH: '/usr/bin' }, homeDir: '/home/u', fileExists: exists(cached) }),
  ).toEqual({ command: cached, source: 'cache' })
})

test('nothing anywhere resolves to undefined, which is what makes the engine unavailable', () => {
  expect(
    resolveHadolintBinary({ platform: 'linux', env: { PATH: '/usr/bin' }, homeDir: '/home/u', fileExists: () => false }),
  ).toBeUndefined()
})

test('the PATH separator follows the requested platform, not the host', () => {
  const onPath = join('C:\\tools', 'hadolint.exe')
  expect(
    resolveHadolintBinary({
      platform: 'win32',
      env: { PATH: ['C:\\Windows', 'C:\\tools'].join(';') },
      fileExists: exists(onPath),
    }),
  ).toEqual({ command: onPath, source: 'path' })
})

test('the binary name gains .exe only on Windows', () => {
  expect(hadolintBinaryName('win32')).toBe('hadolint.exe')
  expect(hadolintBinaryName('linux')).toBe('hadolint')
  expect(hadolintBinaryName('darwin')).toBe('hadolint')
})

test('the cache directory is version-scoped, so a bump can never reuse the old binary', () => {
  const directory = hadolintCacheDir({ platform: 'linux', env: {}, homeDir: '/home/u' })
  expect(directory).toBe(join('/home/u', '.cache', 'slop-gate', 'hadolint', HADOLINT_VERSION))
})

test('the cache directory honours the explicit override, then XDG', () => {
  expect(hadolintCacheDir({ platform: 'linux', env: { SLOP_GATE_CACHE_DIR: '/c' }, homeDir: '/home/u' })).toBe(
    join('/c', 'hadolint', HADOLINT_VERSION),
  )
  expect(hadolintCacheDir({ platform: 'linux', env: { XDG_CACHE_HOME: '/x' }, homeDir: '/home/u' })).toBe(
    join('/x', 'slop-gate', 'hadolint', HADOLINT_VERSION),
  )
})
