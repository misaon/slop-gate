import { describe, expect, it } from 'vitest'
import { LockfileParseError, manifestDependencies, parseLockfile, splitPnpmKey } from './lockfile.ts'

const npmLock = (packages: Record<string, unknown>) => JSON.stringify({ lockfileVersion: 3, packages })

const find = (parsed: { packages: readonly { name: string; version: string; path: readonly string[] }[] }, name: string) =>
  parsed.packages.find((entry) => entry.name === name)

describe('parseLockfile: npm', () => {
  it('reads names and versions out of the flat packages map', () => {
    const parsed = parseLockfile(
      'npm',
      npmLock({
        '': { dependencies: { lodash: '^4.0.0' } },
        'node_modules/lodash': { version: '4.17.21' },
      }),
    )

    expect(find(parsed, 'lodash')).toEqual({ name: 'lodash', version: '4.17.21', path: ['lodash'] })
    expect(parsed.directNames).toEqual(new Set(['lodash']))
  })

  it('records the chain from a direct dependency to a transitive one', () => {
    const parsed = parseLockfile(
      'npm',
      npmLock({
        '': { dependencies: { express: '^4.0.0' } },
        'node_modules/express': { version: '4.18.2', dependencies: { qs: '6.11.0' } },
        'node_modules/qs': { version: '6.11.0', dependencies: { 'side-channel': '^1.0.4' } },
        'node_modules/side-channel': { version: '1.0.4' },
      }),
    )

    expect(find(parsed, 'side-channel')?.path).toEqual(['express', 'qs', 'side-channel'])
  })

  /**
   * A duplicated transitive dependency is nested precisely so two dependents can see different
   * versions. Resolving by bare name would attribute one dependent's version to the other, which for
   * a vulnerability check means reporting the wrong package as affected — or missing the affected one.
   */
  it('resolves a nested copy from the dependent it belongs to, not the hoisted one', () => {
    const parsed = parseLockfile(
      'npm',
      npmLock({
        '': { dependencies: { alpha: '^1.0.0', beta: '^1.0.0' } },
        'node_modules/alpha': { version: '1.0.0', dependencies: { shared: '^1.0.0' } },
        'node_modules/beta': { version: '1.0.0', dependencies: { shared: '^2.0.0' } },
        'node_modules/shared': { version: '1.0.0' },
        'node_modules/beta/node_modules/shared': { version: '2.0.0' },
      }),
    )

    const shared = parsed.packages.filter((entry) => entry.name === 'shared')
    expect(shared.map((entry) => entry.version).sort()).toEqual(['1.0.0', '2.0.0'])
    expect(shared.find((entry) => entry.version === '2.0.0')?.path).toEqual(['beta', 'shared'])
    expect(shared.find((entry) => entry.version === '1.0.0')?.path).toEqual(['alpha', 'shared'])
  })

  /**
   * npm 7 and later install peers, so a package reachable only as a peer is genuinely in the tree.
   * Measured worth: on the axios 1.4.0 lockfile this is the difference between 1,866 and all 2,056
   * packages having a manifest line to point at.
   */
  it('reaches a package that only a peer dependency pulls in', () => {
    const parsed = parseLockfile(
      'npm',
      npmLock({
        '': { dependencies: { plugin: '^1.0.0' } },
        'node_modules/plugin': { version: '1.0.0', peerDependencies: { host: '^2.0.0' } },
        'node_modules/host': { version: '2.0.0' },
      }),
    )

    expect(find(parsed, 'host')?.path).toEqual(['plugin', 'host'])
  })

  it('reaches a package that only an optional dependency pulls in', () => {
    const parsed = parseLockfile(
      'npm',
      npmLock({
        '': { optionalDependencies: { sharp: '^0.33.0' } },
        'node_modules/sharp': { version: '0.33.0', optionalDependencies: { 'detect-libc': '^2.0.0' } },
        'node_modules/detect-libc': { version: '2.0.2' },
      }),
    )

    expect(find(parsed, 'detect-libc')?.path).toEqual(['sharp', 'detect-libc'])
  })

  it('keeps scoped names whole', () => {
    const parsed = parseLockfile(
      'npm',
      npmLock({
        '': { dependencies: { '@nestjs/core': '^9.0.0' } },
        'node_modules/@nestjs/core': { version: '9.0.0', dependencies: { tslib: '2.4.0' } },
        'node_modules/tslib': { version: '2.4.0' },
      }),
    )

    expect(find(parsed, '@nestjs/core')?.version).toBe('9.0.0')
    expect(find(parsed, 'tslib')?.path).toEqual(['@nestjs/core', 'tslib'])
  })

  /** A workspace is a link with no version of its own. It is not a registry package, so it is not
   *  scanned — but it *was* accounted for, so it must not read as missing from the lockfile. */
  it('counts a workspace link as resolved without scanning it', () => {
    const parsed = parseLockfile(
      'npm',
      npmLock({
        '': { dependencies: { '@local/util': 'workspace:*' } },
        'packages/util': { version: '1.0.0' },
        'node_modules/@local/util': { link: true, resolved: 'packages/util' },
      }),
    )

    expect(parsed.directNames.has('@local/util')).toBe(true)
    expect(find(parsed, '@local/util')).toBeUndefined()
  })

  it('leaves the path empty for an entry nothing in the manifest reaches', () => {
    const parsed = parseLockfile('npm', npmLock({ '': {}, 'node_modules/orphan': { version: '1.0.0' } }))
    expect(find(parsed, 'orphan')?.path).toEqual([])
  })

  it('refuses a lockfileVersion 1 file rather than half-reading it', () => {
    expect(() => parseLockfile('npm', JSON.stringify({ lockfileVersion: 1, dependencies: { lodash: { version: '4.17.21' } } }))).toThrow(
      LockfileParseError,
    )
  })

  it('refuses invalid JSON', () => {
    expect(() => parseLockfile('npm', '{ not json')).toThrow(LockfileParseError)
  })
})

const pnpmLock = (body: string) => `lockfileVersion: '9.0'\n\n${body}`

describe('parseLockfile: pnpm', () => {
  it('reads importers and snapshots', () => {
    const parsed = parseLockfile(
      'pnpm',
      pnpmLock(`importers:
  .:
    dependencies:
      lodash:
        specifier: 4.17.21
        version: 4.17.21
snapshots:
  lodash@4.17.21: {}
`),
    )

    expect(find(parsed, 'lodash')).toEqual({ name: 'lodash', version: '4.17.21', path: ['lodash'] })
    expect(parsed.directNames).toEqual(new Set(['lodash']))
  })

  it('records the chain through snapshot edges', () => {
    const parsed = parseLockfile(
      'pnpm',
      pnpmLock(`importers:
  .:
    dependencies:
      express:
        specifier: ^4.18.2
        version: 4.18.2
snapshots:
  express@4.18.2:
    dependencies:
      qs: 6.11.0
  qs@6.11.0:
    dependencies:
      side-channel: 1.0.4
  side-channel@1.0.4: {}
`),
    )

    expect(find(parsed, 'side-channel')?.path).toEqual(['express', 'qs', 'side-channel'])
  })

  it('matches a snapshot key carrying a peer suffix', () => {
    const parsed = parseLockfile(
      'pnpm',
      pnpmLock(`importers:
  .:
    dependencies:
      vite:
        specifier: ^5.0.0
        version: 5.0.0(@types/node@20.0.0)
snapshots:
  vite@5.0.0(@types/node@20.0.0):
    dependencies:
      esbuild: 0.19.0
  esbuild@0.19.0: {}
`),
    )

    expect(find(parsed, 'vite')).toEqual({ name: 'vite', version: '5.0.0', path: ['vite'] })
    expect(find(parsed, 'esbuild')?.path).toEqual(['vite', 'esbuild'])
  })

  it('treats a workspace link as resolved', () => {
    const parsed = parseLockfile(
      'pnpm',
      pnpmLock(`importers:
  .:
    dependencies:
      '@local/util':
        specifier: workspace:*
        version: link:packages/util
snapshots: {}
`),
    )

    expect(parsed.directNames.has('@local/util')).toBe(true)
  })

  it('refuses invalid YAML', () => {
    expect(() => parseLockfile('pnpm', '\tnot: [valid')).toThrow(LockfileParseError)
  })
})

describe('splitPnpmKey', () => {
  it.each([
    ['lodash@4.17.21', { name: 'lodash', version: '4.17.21' }],
    ['@ctrl/tinycolor@4.1.1', { name: '@ctrl/tinycolor', version: '4.1.1' }],
    ['vite@5.0.0(@types/node@20.0.0)', { name: 'vite', version: '5.0.0' }],
    ['@scope/pkg@1.0.0(peer@2.0.0)', { name: '@scope/pkg', version: '1.0.0' }],
  ])('splits %s', (key, expected) => {
    expect(splitPnpmKey(key)).toEqual(expected)
  })

  it.each(['@scope/only', 'noversion', ''])('rejects %s', (key) => {
    expect(splitPnpmKey(key)).toBeUndefined()
  })
})

describe('manifestDependencies', () => {
  it('reads the three groups that declare an install', () => {
    const deps = manifestDependencies(
      JSON.stringify({
        dependencies: { lodash: '^4.0.0' },
        devDependencies: { vitest: '^3.0.0' },
        optionalDependencies: { fsevents: '^2.3.3' },
        peerDependencies: { react: '^18.0.0' },
      }),
    )

    expect(deps.map((dep) => dep.name).sort()).toEqual(['fsevents', 'lodash', 'vitest'])
    expect(deps.find((dep) => dep.name === 'fsevents')?.group).toBe('optionalDependencies')
  })

  /** A peer is a requirement on the consumer, not an install. Reading it as one would report every
   *  library that declares peers it deliberately does not carry. */
  it('ignores peerDependencies', () => {
    expect(manifestDependencies(JSON.stringify({ peerDependencies: { react: '^18.0.0' } }))).toEqual([])
  })

  it('returns nothing for an unparseable manifest', () => {
    expect(manifestDependencies('{ broken')).toEqual([])
  })
})
