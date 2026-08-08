import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AdvisoryTable } from './advisory.ts'
import { parseLockfile } from './lockfile.ts'
import { scanDependencies, type ScanInput } from './scan.ts'
import type { DepsSecurityRuleId } from './rules.ts'
import { SNAPSHOT_FORMAT_VERSION, type SnapshotManifest } from './snapshot.ts'

const fixtures = join(import.meta.dirname, 'fixtures')

const vulnerable = JSON.parse(readFileSync(join(fixtures, 'advisories.vulnerable.json'), 'utf8')) as AdvisoryTable
const malicious = JSON.parse(readFileSync(join(fixtures, 'advisories.malicious.json'), 'utf8')) as AdvisoryTable

const freshSnapshot = (): SnapshotManifest => ({
  formatVersion: SNAPSHOT_FORMAT_VERSION,
  source: 'fixture://advisories',
  fetchedAt: new Date().toISOString(),
  digest: 'a'.repeat(64),
  vulnerableAdvisories: 96,
  maliciousAdvisories: 6,
})

const ALL_RULES: readonly DepsSecurityRuleId[] = ['vulnerability', 'malware', 'missing-lockfile-entry', 'coverage-gap']

const npmLock = (packages: Record<string, unknown>) => JSON.stringify({ lockfileVersion: 3, packages })

const scan = (overrides: Partial<ScanInput> & Pick<ScanInput, 'parsed'>) =>
  scanDependencies({
    lockfile: { file: 'package-lock.json', kind: 'npm' },
    manifests: [],
    vulnerable,
    malicious,
    snapshot: freshSnapshot(),
    enabled: new Set(ALL_RULES),
    ...overrides,
  })

const idsOf = (diagnostics: readonly { message: string }[]) =>
  diagnostics.flatMap((diagnostic) => /\b((?:GHSA|MAL)-[\w-]+)/.exec(diagnostic.message)?.[1] ?? [])

describe('scanDependencies: the accuracy claim', () => {
  it('reproduces the advisory set npm and pnpm report for the same tree', () => {
    const parsed = parseLockfile(
      'npm',
      npmLock({
        '': { dependencies: { lodash: '4.17.11', minimist: '1.2.0', axios: '0.21.0' } },
        'node_modules/lodash': { version: '4.17.11' },
        'node_modules/minimist': { version: '1.2.0' },
        'node_modules/axios': { version: '0.21.0' },
      }),
    )

    const found = scan({ parsed, enabled: new Set(['vulnerability']) })
    expect(found).toHaveLength(34)
    expect(new Set(idsOf(found)).size).toBe(34)

    const perPackage = new Map<string, number>()
    for (const diagnostic of found) {
      const name = /^(\S+)@/.exec(diagnostic.message)?.[1] ?? '?'
      perPackage.set(name, (perPackage.get(name) ?? 0) + 1)
    }
    expect(Object.fromEntries(perPackage)).toEqual({ lodash: 7, minimist: 2, axios: 25 })
  })

  it('reports no malware for the ordinary versions of the packages the September 2025 attack hit', () => {
    const parsed = parseLockfile(
      'npm',
      npmLock({
        '': { dependencies: { chalk: '4.1.2', debug: '4.3.4', 'ansi-styles': '4.3.0', 'color-name': '1.1.4', 'supports-color': '7.2.0' } },
        'node_modules/chalk': { version: '4.1.2' },
        'node_modules/debug': { version: '4.3.4' },
        'node_modules/ansi-styles': { version: '4.3.0' },
        'node_modules/color-name': { version: '1.1.4' },
        'node_modules/supports-color': { version: '7.2.0' },
      }),
    )

    expect(scan({ parsed, enabled: new Set(['malware']) })).toEqual([])
  })

  it('reports malware for exactly the compromised releases of those same packages', () => {
    const parsed = parseLockfile(
      'npm',
      npmLock({
        '': { dependencies: { chalk: '5.6.1', debug: '4.4.2', '@ctrl/tinycolor': '4.1.1' } },
        'node_modules/chalk': { version: '5.6.1' },
        'node_modules/debug': { version: '4.4.2' },
        'node_modules/@ctrl/tinycolor': { version: '4.1.1' },
      }),
    )

    const found = scan({ parsed, enabled: new Set(['malware']) })
    expect(idsOf(found).sort()).toEqual(['MAL-2025-46969', 'MAL-2025-46974', 'MAL-2025-47141'])
    expect(found.every((diagnostic) => diagnostic.severity === 'error')).toBe(true)
  })
})

describe('scanDependencies: where a finding points', () => {
  const manifest = {
    file: 'package.json',
    source: JSON.stringify({ name: 'app', dependencies: { axios: '0.21.0' } }, null, 2),
  }

  const withAxios = () =>
    parseLockfile(
      'npm',
      npmLock({
        '': { dependencies: { axios: '0.21.0' } },
        'node_modules/axios': { version: '0.21.0' },
      }),
    )

  it('anchors a direct dependency to its own manifest line', () => {
    const [first] = scan({ parsed: withAxios(), manifests: [manifest], enabled: new Set(['vulnerability']) })

    expect(first?.file).toBe('package.json')
    const bytes = new TextEncoder().encode(manifest.source)
    expect(new TextDecoder().decode(bytes.subarray(first?.range.start, first?.range.end))).toBe('"axios"')
  })

  it('anchors a transitive dependency to the direct dependency that pulls it in, and names the chain', () => {
    const parsed = parseLockfile(
      'npm',
      npmLock({
        '': { dependencies: { 'my-client': '^1.0.0' } },
        'node_modules/my-client': { version: '1.0.0', dependencies: { axios: '0.21.0' } },
        'node_modules/axios': { version: '0.21.0' },
      }),
    )
    const parent = { file: 'package.json', source: JSON.stringify({ dependencies: { 'my-client': '^1.0.0' } }, null, 2) }

    const [first] = scan({ parsed, manifests: [parent], enabled: new Set(['vulnerability']) })

    expect(first?.file).toBe('package.json')
    expect(first?.range.start).toBeGreaterThan(0)
    expect(first?.message).toContain('pulled in through my-client › axios')
    expect(first?.help).toContain('upgrading `my-client`')
  })

  it('falls back to the lockfile when no manifest mentions the package at all', () => {
    const parsed = parseLockfile('npm', npmLock({ '': {}, 'node_modules/axios': { version: '0.21.0' } }))

    const [first] = scan({ parsed, manifests: [manifest], enabled: new Set(['vulnerability']) })
    expect(first?.file).toBe('package-lock.json')
    expect(first?.range).toEqual({ start: 0, end: 0 })
  })

  it('reports one finding per advisory, not one per copy of the same release in the tree', () => {
    const parsed = parseLockfile(
      'npm',
      npmLock({
        '': { dependencies: { a: '1.0.0', b: '1.0.0' } },
        'node_modules/a': { version: '1.0.0', dependencies: { axios: '0.21.0' } },
        'node_modules/b': { version: '1.0.0', dependencies: { axios: '0.21.0' } },
        'node_modules/axios': { version: '0.21.0' },
        'node_modules/b/node_modules/axios': { version: '0.21.0' },
      }),
    )

    expect(scan({ parsed, enabled: new Set(['vulnerability']) })).toHaveLength(25)
  })

  it('carries the advisory severity in the message rather than in the level', () => {
    const found = scan({ parsed: withAxios(), manifests: [manifest], enabled: new Set(['vulnerability']) })
    expect(found.some((diagnostic) => diagnostic.message.includes('[high]'))).toBe(true)
    expect(found.some((diagnostic) => diagnostic.message.includes('[moderate]'))).toBe(true)
    expect(new Set(found.map((diagnostic) => diagnostic.engineRuleId))).toEqual(new Set(['vulnerability']))
  })

  it('links a GHSA id to GitHub and everything else to OSV', () => {
    const ghsa = scan({ parsed: withAxios(), enabled: new Set(['vulnerability']) })
    expect(ghsa[0]?.docsUrl).toMatch(/^https:\/\/github\.com\/advisories\/GHSA-/)

    const compromised = parseLockfile('npm', npmLock({ '': { dependencies: { chalk: '5.6.1' } }, 'node_modules/chalk': { version: '5.6.1' } }))
    expect(scan({ parsed: compromised, enabled: new Set(['malware']) })[0]?.docsUrl).toBe('https://osv.dev/vulnerability/MAL-2025-46969')
  })

  it('orders findings by file then position then rule, so two runs agree', () => {
    const first = scan({ parsed: withAxios(), manifests: [manifest] })
    const second = scan({ parsed: withAxios(), manifests: [manifest] })
    expect(first.map((diagnostic) => diagnostic.message)).toEqual(second.map((diagnostic) => diagnostic.message))
  })
})

describe('scanDependencies: missing lockfile entries', () => {
  const parsed = parseLockfile('npm', npmLock({ '': { dependencies: { lodash: '4.17.21' } }, 'node_modules/lodash': { version: '4.17.21' } }))

  it('names both causes, because offline they cannot be told apart', () => {
    const manifests = [
      {
        file: 'package.json',
        source: JSON.stringify({ dependencies: { lodash: '4.17.21' }, optionalDependencies: { 'not-a-real-package-x9': '^1.0.0' } }, null, 2),
      },
    ]

    const found = scan({ parsed, manifests, enabled: new Set(['missing-lockfile-entry']) })
    expect(found).toHaveLength(1)
    expect(found[0]?.message).toContain('not-a-real-package-x9')
    expect(found[0]?.message).toContain('does not exist on the registry')
    expect(found[0]?.message).toContain('lockfile predates the edit')
  })

  it('says nothing about a dependency the lockfile did resolve', () => {
    const manifests = [{ file: 'package.json', source: JSON.stringify({ dependencies: { lodash: '4.17.21' } }) }]
    expect(scan({ parsed, manifests, enabled: new Set(['missing-lockfile-entry']) })).toEqual([])
  })
})

describe('scanDependencies: coverage gaps', () => {
  const parsed = parseLockfile('npm', npmLock({ '': {}, 'node_modules/lodash': { version: '4.17.21' } }))
  const aged = (days: number): SnapshotManifest => ({
    ...freshSnapshot(),
    fetchedAt: new Date(Date.now() - days * 86_400_000).toISOString(),
  })

  it('says nothing while the snapshot is fresh', () => {
    expect(scan({ parsed, enabled: new Set(['coverage-gap']) })).toEqual([])
  })

  it('gets louder as the snapshot ages instead of reading the same at three days and three months', () => {
    const at = (days: number) => scan({ parsed, snapshot: aged(days), enabled: new Set(['coverage-gap']) })[0]?.message ?? ''

    expect(at(10)).toContain('10 days old')
    expect(at(45)).toContain('hundreds')
    expect(at(200)).toContain('no longer a meaningful security check')
    expect(new Set([at(10), at(45), at(200)]).size).toBe(3)
  })

  it('names a lockfile format it cannot read rather than passing over it', () => {
    const found = scan({
      parsed,
      enabled: new Set(['coverage-gap']),
      unsupportedLockfiles: [{ file: 'yarn.lock', manager: 'yarn' }],
    })

    expect(found).toHaveLength(1)
    expect(found[0]?.file).toBe('yarn.lock')
    expect(found[0]?.message).toContain('no dependency locked by it was checked')
  })
})

describe('scanDependencies: rule selection', () => {
  const parsed = parseLockfile(
    'npm',
    npmLock({
      '': { dependencies: { axios: '0.21.0', chalk: '5.6.1' } },
      'node_modules/axios': { version: '0.21.0' },
      'node_modules/chalk': { version: '5.6.1' },
    }),
  )

  it('emits nothing at all when no rule is enabled', () => {
    expect(scan({ parsed, enabled: new Set() })).toEqual([])
  })

  it.each(ALL_RULES)('only ever emits %s findings when only %s is enabled', (rule) => {
    const found = scan({
      parsed,
      manifests: [{ file: 'package.json', source: JSON.stringify({ dependencies: { axios: '0.21.0', chalk: '5.6.1', ghost: '^1.0.0' } }) }],
      snapshot: { ...freshSnapshot(), fetchedAt: new Date(Date.now() - 400 * 86_400_000).toISOString() },
      unsupportedLockfiles: [{ file: 'yarn.lock', manager: 'yarn' }],
      enabled: new Set([rule]),
    })

    expect(found.length).toBeGreaterThan(0)
    expect(new Set(found.map((diagnostic) => diagnostic.engineRuleId))).toEqual(new Set([rule]))
  })
})
