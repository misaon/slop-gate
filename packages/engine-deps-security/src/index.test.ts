import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EngineError, type Engine, type EngineRuleSetting, type RawDiagnostic, type RunContext } from '@misaon/slop-gate-core'
import type { AdvisoryTable } from './advisory.ts'
import { createDepsSecurityEngine } from './index.ts'
import { writeAdvisorySnapshot } from './install.ts'
import { DEPS_SECURITY_RULES, type DepsSecurityRuleId } from './rules.ts'
import { INSTALL_COMMAND, SNAPSHOT_FORMAT_VERSION } from './snapshot.ts'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const vulnerable = JSON.parse(readFileSync(join(fixtures, 'advisories.vulnerable.json'), 'utf8')) as AdvisoryTable
const malicious = JSON.parse(readFileSync(join(fixtures, 'advisories.malicious.json'), 'utf8')) as AdvisoryTable

let root: string
let snapshotDir: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sgate-deps-engine-'))
  snapshotDir = join(root, '.snapshot')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const installSnapshot = async (fetchedAt = new Date().toISOString()) => {
  await writeAdvisorySnapshot(
    snapshotDir,
    {
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      source: 'fixture://advisories',
      fetchedAt,
      digest: 'd'.repeat(64),
      vulnerableAdvisories: 96,
      maliciousAdvisories: 6,
    },
    { vulnerable, malicious },
  )
}

const engineFor = () => createDepsSecurityEngine({ env: { SLOP_GATE_ADVISORIES_PATH: snapshotDir } })

const context = (): RunContext => ({ rootDir: root, tmpDir: join(root, '.slop-gate', 'tmp') })

const allRules = new Map<string, EngineRuleSetting>(Object.keys(DEPS_SECURITY_RULES).map((rule) => [rule, ['warn'] as const]))

async function runEngine(engine: Engine, rules = allRules, files: readonly string[] = ['package.json']): Promise<RawDiagnostic[]> {
  const handle = await engine.materializeConfig(rules, context())
  const out: RawDiagnostic[] = []
  for await (const diagnostic of engine.run(
    { files: files.map((path) => ({ path, language: 'json', size: 0 }) as never) },
    handle,
    context(),
    AbortSignal.timeout(30_000),
  )) {
    out.push(diagnostic)
  }
  return out
}

const npmLock = (packages: Record<string, unknown>) => JSON.stringify({ lockfileVersion: 3, packages })

describe('availability', () => {
  it('is a coverage gap naming the install command when no snapshot exists', async () => {
    const result = await engineFor().availability?.()

    expect(result?.available).toBe(false)
    expect(result).toMatchObject({ install: INSTALL_COMMAND })
    expect(result && 'reason' in result ? result.reason : '').toContain(snapshotDir)
  })

  it('is available once a snapshot is installed', async () => {
    await installSnapshot()
    expect(await engineFor().availability?.()).toEqual({ available: true })
  })

  it('stays available when the snapshot is old, and says so as a finding instead', async () => {
    await installSnapshot(new Date(Date.now() - 200 * 86_400_000).toISOString())
    expect(await engineFor().availability?.()).toEqual({ available: true })

    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { lodash: '4.17.21' } }))
    await writeFile(join(root, 'package-lock.json'), npmLock({ '': { dependencies: { lodash: '4.17.21' } }, 'node_modules/lodash': { version: '4.17.21' } }))

    const found = await runEngine(engineFor())
    expect(found.map((diagnostic) => diagnostic.engineRuleId)).toContain('coverage-gap')
  })
})

describe('version', () => {
  it('identifies the snapshot rather than this package, so a refresh invalidates the cache', async () => {
    await installSnapshot('2026-08-01T00:00:00.000Z')
    expect(await engineFor().version()).toBe(`osv-npm@2026-08-01+${'d'.repeat(12)}`)
  })

  it('refuses rather than inventing a version when no snapshot exists', async () => {
    await expect(engineFor().version()).rejects.toThrow(EngineError)
  })
})

describe('materializeConfig', () => {
  it('writes only the rules that are on, and hashes them', async () => {
    await installSnapshot()
    const selection = new Map<string, EngineRuleSetting>([
      ['vulnerability', ['warn'] as const],
      ['malware', ['off'] as const],
    ])

    const handle = await engineFor().materializeConfig(selection, context())
    expect(handle.ruleCount).toBe(1)
    expect(JSON.parse(readFileSync(handle.path, 'utf8'))).toEqual({ rules: ['vulnerability'] })
  })

  it('keeps a rule set to off out of the payload even when it carries options', async () => {
    await installSnapshot()
    const selection = new Map<string, EngineRuleSetting>([
      ['vulnerability', ['warn']],
      ['malware', ['off', { probe: true }]],
    ])

    const handle = await engineFor().materializeConfig(selection, context())
    expect(handle.ruleCount).toBe(1)
    expect(JSON.parse(readFileSync(handle.path, 'utf8'))).toEqual({ rules: ['vulnerability'] })
  })

  it('hashes the same selection identically regardless of the order it arrived in', async () => {
    await installSnapshot()
    const forward = await engineFor().materializeConfig(
      new Map([
        ['malware', ['warn'] as const],
        ['vulnerability', ['warn'] as const],
      ]),
      context(),
    )
    const reverse = await engineFor().materializeConfig(
      new Map([
        ['vulnerability', ['warn'] as const],
        ['malware', ['warn'] as const],
      ]),
      context(),
    )
    expect(forward.rulesetHash).toBe(reverse.rulesetHash)
  })

  it('creates the temp directory the caller only promised the path of', async () => {
    await installSnapshot()
    const handle = await engineFor().materializeConfig(allRules, context())
    expect(readFileSync(handle.path, 'utf8')).toContain('vulnerability')
  })
})

describe('run', () => {
  const withLockfile = async () => {
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'app', dependencies: { axios: '0.21.0' } }, null, 2))
    await writeFile(
      join(root, 'package-lock.json'),
      npmLock({ '': { dependencies: { axios: '0.21.0' } }, 'node_modules/axios': { version: '0.21.0' } }),
    )
  }

  it('finds real advisories through the whole adapter, anchored in the manifest', async () => {
    await installSnapshot()
    await withLockfile()

    const found = await runEngine(engineFor())
    expect(found).toHaveLength(25)
    expect(found.every((diagnostic) => diagnostic.file === 'package.json')).toBe(true)
    expect(found.every((diagnostic) => diagnostic.engineRuleId === 'vulnerability')).toBe(true)
  })

  it('reads a pnpm lockfile as readily as an npm one', async () => {
    await installSnapshot()
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { axios: '0.21.0' } }, null, 2))
    await writeFile(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n\nimporters:\n  .:\n    dependencies:\n      axios:\n        specifier: 0.21.0\n        version: 0.21.0\nsnapshots:\n  axios@0.21.0: {}\n",
    )

    expect(await runEngine(engineFor())).toHaveLength(25)
  })

  it('emits nothing when every rule is off', async () => {
    await installSnapshot()
    await withLockfile()
    expect(await runEngine(engineFor(), new Map())).toEqual([])
  })

  it('reports an unreadable lockfile format rather than reporting nothing', async () => {
    await installSnapshot()
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { axios: '0.21.0' } }))
    await writeFile(join(root, 'yarn.lock'), '# yarn lockfile v1\n')

    const found = await runEngine(engineFor())
    expect(found).toHaveLength(1)
    expect(found[0]?.engineRuleId).toBe('coverage-gap')
    expect(found[0]?.file).toBe('yarn.lock')
    expect(found[0]?.message).toContain('yarn lockfile')
  })

  it('says so when there is no lockfile at all but there are dependencies to have checked', async () => {
    await installSnapshot()
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { axios: '0.21.0' } }))

    const found = await runEngine(engineFor())
    expect(found).toHaveLength(1)
    expect(found[0]?.message).toContain('No lockfile was found')
  })

  it('stays silent when there is no lockfile and no dependency to have missed', async () => {
    await installSnapshot()
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'app' }))

    expect(await runEngine(engineFor())).toEqual([])
  })

  it('turns an unreadable lockfile into an engine error rather than an empty result', async () => {
    await installSnapshot()
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { axios: '0.21.0' } }))
    await writeFile(join(root, 'package-lock.json'), '{ not json')

    await expect(runEngine(engineFor())).rejects.toThrow(EngineError)
  })

  it('fails loudly if the snapshot disappears between the availability probe and the run', async () => {
    await installSnapshot()
    await withLockfile()
    const engine = engineFor()
    const handle = await engine.materializeConfig(allRules, context())
    await rm(snapshotDir, { recursive: true, force: true })

    await expect(async () => {
      for await (const _ of engine.run({ files: [] }, handle, context(), AbortSignal.timeout(5000))) {
      }
    }).rejects.toThrow(EngineError)
  })

  it('reads manifests from the assigned file list, so workspace exclusions apply', async () => {
    await installSnapshot()
    await withLockfile()
    await mkdir(join(root, 'ignored'), { recursive: true })
    await writeFile(join(root, 'ignored', 'package.json'), JSON.stringify({ dependencies: { 'never-resolved': '^1.0.0' } }))

    const onlyRoot = await runEngine(engineFor(), allRules, ['package.json'])
    expect(onlyRoot.some((diagnostic) => diagnostic.file.startsWith('ignored/'))).toBe(false)

    const both = await runEngine(engineFor(), allRules, ['package.json', 'ignored/package.json'])
    expect(both.some((diagnostic) => diagnostic.file === 'ignored/package.json')).toBe(true)
  })

  it('skips the malicious table entirely when that rule is off', async () => {
    await installSnapshot()
    await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { chalk: '5.6.1' } }, null, 2))
    await writeFile(
      join(root, 'package-lock.json'),
      npmLock({ '': { dependencies: { chalk: '5.6.1' } }, 'node_modules/chalk': { version: '5.6.1' } }),
    )

    const off = new Map<string, EngineRuleSetting>([['vulnerability', ['warn'] as const]])
    expect(await runEngine(engineFor(), off)).toEqual([])

    const on = new Map<string, EngineRuleSetting>([['malware', ['warn'] as const]])
    expect(await runEngine(engineFor(), on)).toHaveLength(1)
  })
})

describe('capabilities', () => {
  it('is a project engine over the two languages a lockfile can be written in', () => {
    expect(engineFor().capabilities).toEqual({
      languages: ['json', 'yaml'],
      granularity: 'project',
      provides: [],
      fixes: false,
    })
  })

  it('declares every rule the registry names for it and no others', () => {
    const declared: readonly DepsSecurityRuleId[] = ['vulnerability', 'malware', 'missing-lockfile-entry', 'coverage-gap']
    expect(new Set(Object.keys(DEPS_SECURITY_RULES))).toEqual(new Set(declared))
  })
})
