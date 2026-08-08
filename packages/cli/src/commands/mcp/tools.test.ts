import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import {
  SNAPSHOT_FORMAT_VERSION,
  SNAPSHOT_PATH_ENV,
  writeAdvisorySnapshot,
} from '@misaon/slop-gate-engine-deps-security'
import { baselinePathFor, entriesOf, runCheck, writeBaseline, type SlopGateConfig } from '@misaon/slop-gate-core'
import { DEFAULT_CONFIG, loadCliConfig } from '../../config.ts'
import { defaultEngines } from '../../engine-registry.ts'
import { callCheck, callExplain, callPropose, type ToolContext } from './tools.ts'

let dir: string
let context: ToolContext
let originalSnapshotPath: string | undefined

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-mcp-tools-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  await writeFile(join(dir, 'clean.ts'), 'export const value = 1\n')
  await writeFile(
    join(dir, 'slop-gate.config.ts'),
    "export default { extends: ['recommended'], rules: { 'dead-code.unused-file': 'off', 'types.type-error': 'off' } }\n",
  )
  originalSnapshotPath = process.env[SNAPSHOT_PATH_ENV]
  process.env[SNAPSHOT_PATH_ENV] = await installAdvisoryFixture(dir)
  context = { serverRoot: dir, version: '0.0.0' }
})

afterEach(async () => {
  if (originalSnapshotPath === undefined) delete process.env[SNAPSHOT_PATH_ENV]
  else process.env[SNAPSHOT_PATH_ENV] = originalSnapshotPath
  await rm(dir, { recursive: true, force: true })
})

const structured = <T>(result: { structuredContent?: Record<string, unknown> }): T => result.structuredContent as T

const loadedConfig = async (): Promise<SlopGateConfig> => {
  const loaded = await loadCliConfig(dir, DEFAULT_CONFIG)
  if (loaded.kind === 'error') throw new Error(loaded.message)
  return loaded.config
}

type CheckStructured = {
  outcome: string
  complete: boolean
  gaps: { kind: string; engine?: string; detail: string; remedy?: string; concepts: string[] }[]
  counts: { error: number; warn: number; info: number }
  concepts: { concept: string; section: string; findingCount: number; tier: string | null }[]
  reportTruncated: boolean
  uncoveredConcepts: string[]
  unknownConfigKeys: number
}

async function installAdvisoryFixture(root: string): Promise<string> {
  const directory = join(root, '.advisory-snapshot')
  await writeAdvisorySnapshot(
    directory,
    {
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      source: 'fixture://advisories',
      fetchedAt: new Date().toISOString(),
      digest: 'f'.repeat(64),
      vulnerableAdvisories: 1,
      maliciousAdvisories: 0,
    },
    { vulnerable: {}, malicious: {} },
  )
  return directory
}

async function withoutActionlint<T>(work: () => Promise<T>): Promise<T> {
  const saved = process.env['SLOP_GATE_ACTIONLINT_PATH']
  process.env['SLOP_GATE_ACTIONLINT_PATH'] = join(dir, 'nowhere', 'actionlint')
  try {
    return await work()
  } finally {
    if (saved === undefined) delete process.env['SLOP_GATE_ACTIONLINT_PATH']
    else process.env['SLOP_GATE_ACTIONLINT_PATH'] = saved
  }
}

test('a clean run says clean, and says so in both channels', async () => {
  const result = await callCheck({}, context)
  const data = structured<CheckStructured>(result)

  expect(data.outcome).toBe('clean')
  expect(data.complete).toBe(true)
  expect(data.gaps).toEqual([])
  expect(result.content[0]?.text).toContain('coverage: no findings. Nothing was omitted.')
  expect(result.isError).toBeUndefined()
})

test('a baseline that accepted every finding also makes an empty list unrepresentable as clean', async () => {
  await writeFile(join(dir, 'dirty.ts'), 'export function f() {\n  debugger\n}\n')

  const before = structured<CheckStructured>(await callCheck({}, context))
  expect(before.outcome).toBe('findings')
  expect(before.counts.error).toBeGreaterThan(0)

  const run = await runCheck({
    rootDir: dir,
    config: await loadedConfig(),
    engines: defaultEngines(dir, undefined, undefined),
    useBaseline: false,
  })
  await writeBaseline(baselinePathFor(dir), entriesOf(run.diagnostics))

  const data = structured<CheckStructured>(await callCheck({}, context))

  expect(data.counts).toEqual({ error: 0, warn: 0, info: 0 })
  expect(data.concepts).toEqual([])
  expect(data.outcome).toBe('incomplete')
  expect(data.complete).toBe(false)

  const gap = data.gaps.find((entry) => entry.kind === 'baseline-accepted')
  expect(gap?.engine).toBeUndefined()
  expect(gap?.detail).toContain('do not read an empty findings list as clean')
  expect(gap?.remedy).toBe('sgate check --no-baseline')
  expect(gap?.concepts).toContain('correctness.no-debugger')
})

test('an absent engine that cost the run coverage makes an empty findings list unrepresentable as clean', async () => {
  await mkdir(join(dir, '.github', 'workflows'), { recursive: true })
  await writeFile(join(dir, '.github', 'workflows', 'ci.yml'), 'on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n')

  const result = await withoutActionlint(() => callCheck({}, context))
  const data = structured<CheckStructured>(result)

  expect(data.counts).toEqual({ error: 0, warn: 0, info: 0 })
  expect(data.concepts).toEqual([])

  expect(data.outcome).toBe('incomplete')
  expect(data.complete).toBe(false)

  const gap = data.gaps.find((entry) => entry.kind === 'engine-unavailable')
  expect(gap?.engine).toBe('actionlint')
  expect(gap?.detail).toContain('do not read an empty findings list as clean')
  expect(gap?.remedy).toBe('sgate engines install actionlint')
  expect(gap?.concepts.length).toBeGreaterThan(0)

  const text = result.content[0]?.text ?? ''
  expect(text).toContain('INCOMPLETE: engine `actionlint`')
  expect(text).toContain('so this is not a clean result')
  expect(text).toContain('Make `actionlint` runnable here')
})

test('the two channels agree about whether the run was complete', async () => {
  await mkdir(join(dir, '.github', 'workflows'), { recursive: true })
  await writeFile(join(dir, '.github', 'workflows', 'ci.yml'), 'on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n')

  for (const [label, run] of [
    ['equipped', () => callCheck({}, context)],
    ['stripped', () => withoutActionlint(() => callCheck({}, context))],
  ] as const) {
    const result = await run()
    const data = structured<CheckStructured>(result)
    const saysIncomplete = (result.content[0]?.text ?? '').includes('INCOMPLETE:')
    expect(data.outcome.startsWith('incomplete'), label).toBe(saysIncomplete)
    expect(data.complete, label).toBe(!saysIncomplete)
  }
})

test('an absent engine that would have owned nothing here is not called a gap', async () => {
  const data = structured<CheckStructured>(await withoutActionlint(() => callCheck({}, context)))
  expect(data.outcome).toBe('clean')
  expect(data.gaps).toEqual([])
  expect(data.uncoveredConcepts.length).toBeGreaterThan(0)
})

test('a bounded report still reports every concept at its true count', async () => {
  await writeFile(join(dir, 'spread.ts'), Array.from({ length: 12 }, (_, i) => `export const v${i} = { ...{ a: ${i} } }`).join('\n'))

  const full = structured<CheckStructured>(await callCheck({}, context))
  const squeezed = await callCheck({ maxTokens: 600 }, context)
  const bounded = structured<CheckStructured>(squeezed)

  expect(full.concepts[0]?.findingCount).toBe(12)
  expect(bounded.concepts).toEqual(full.concepts)
  expect(bounded.reportTruncated).toBe(true)
  expect(squeezed.content[0]?.text).toContain('omitted:')
})

test('reportTruncated is read off the report handed over, not predicted from the budget being set', async () => {
  await writeFile(join(dir, 'spread.ts'), 'export const v = { ...{ a: 1 } }\n')
  expect(structured<CheckStructured>(await callCheck({ maxTokens: 50_000 }, context)).reportTruncated).toBe(false)
})

test('the concept rollup carries the same automated/judgement split the report prints', async () => {
  await writeFile(join(dir, 'spread.ts'), 'export const v = { ...{ a: 1 } }\n')

  const result = await callCheck({}, context)
  const data = structured<CheckStructured>(result)
  const text = result.content[0]?.text ?? ''

  expect(data.concepts.length).toBeGreaterThan(0)
  for (const concept of data.concepts) {
    expect(text).toContain(`### ${concept.concept}`)
    expect(text).toContain(concept.section === 'automated' ? '## automated' : '## judgement')
  }
})

test('a rootDir outside the directory the server was started in is refused, as a tool error', async () => {
  const nested = join(dir, 'inner')
  await mkdir(nested)
  const result = await callCheck({ rootDir: join('..', '..') }, { ...context, serverRoot: nested })

  expect(result.isError).toBe(true)
  expect(result.content[0]?.text).toContain('must be inside the directory this server was started in')
  expect(result.structuredContent).toBeUndefined()
})

test('a rootDir inside the root is analysed', async () => {
  const nested = join(dir, 'inner')
  await mkdir(nested)
  await writeFile(join(nested, 'package.json'), JSON.stringify({ name: 'inner' }))

  const result = await callCheck({ rootDir: 'inner' }, context)
  expect(result.isError).toBeUndefined()
  expect(structured<CheckStructured>(result).outcome).toBe('clean')
})

test('explains an enabled concept and names the rule that owns it, without running an engine', async () => {
  const result = await callExplain({ concept: 'correctness.no-debugger' }, context)
  const data = structured<{ known: boolean; enabled: boolean; owners: { ruleRefKey: string }[] }>(result)

  expect(result.isError).toBeUndefined()
  expect(data.known).toBe(true)
  expect(data.enabled).toBe(true)
  expect(data.owners.map((owner) => owner.ruleRefKey)).toContain('oxlint/no-debugger')
  expect(result.content[0]?.text).toContain('correctness.no-debugger')
})

test('a rule id is answered with the concepts that rule declares, not refused blankly', async () => {
  const result = await callExplain({ concept: 'oxlint/no-debugger' }, context)

  expect(result.isError).toBe(true)
  expect(result.content[0]?.text).toContain('is a rule id, not a concept id')
  expect(result.content[0]?.text).toContain('correctness.no-debugger')
})

test('an unknown concept id is an error, not a quiet concept', async () => {
  const result = await callExplain({ concept: 'nope.not-a-concept' }, context)

  expect(result.isError).toBe(true)
  expect(structured<{ known: boolean }>(result).known).toBe(false)
})

test('proposes without writing, and says so in the payload and on disk', async () => {
  const source = 'export const v = { ...{ a: 1 } }\n'
  await writeFile(join(dir, 'spread.ts'), source)

  const result = await callPropose({ tier: 'unsafe' }, context)
  const data = structured<{
    applied: boolean
    tier: string
    command: string
    files: { file: string; diff: string }[]
    onePassOnly: boolean
  }>(result)

  expect(data.applied).toBe(false)
  expect(data.tier).toBe('unsafe')
  expect(data.command).toBe('sgate fix --unsafe')
  expect(data.onePassOnly).toBe(true)
  expect(data.files.length).toBeGreaterThan(0)
  expect(data.files[0]?.diff).toContain('---')
  expect(result.content[0]?.text).toContain('Nothing has been written')

  const { readFile } = await import('node:fs/promises')
  await expect(readFile(join(dir, 'spread.ts'), 'utf8')).resolves.toBe(source)
})

test('the safe tier is the default, matching plain `sgate fix`', async () => {
  const data = structured<{ tier: string; command: string }>(await callPropose({}, context))
  expect(data.tier).toBe('safe')
  expect(data.command).toBe('sgate fix')
})

test('a dirty worktree does not stop a proposal — there is nothing to protect', async () => {
  await writeFile(join(dir, 'spread.ts'), 'export const v = { ...{ a: 1 } }\n')
  const data = structured<{ refusal: unknown; files: unknown[] }>(await callPropose({ tier: 'unsafe' }, context))

  expect(data.refusal).toBeNull()
  expect(data.files.length).toBeGreaterThan(0)
})

test('a rootDir outside the root is refused before any engine runs', async () => {
  const nested = join(dir, 'inner')
  await mkdir(nested)
  const result = await callPropose({ rootDir: join('..', '..') }, { ...context, serverRoot: nested })
  expect(result.isError).toBe(true)
})

test('a cancelled request stops the run rather than finishing it and discarding the answer', async () => {
  await writeFile(join(dir, 'spread.ts'), 'export const v = { ...{ a: 1 } }\n')

  for (const [name, call] of [
    ['check', () => callCheck({}, { ...context, signal: AbortSignal.abort() })],
    ['propose_fixes', () => callPropose({}, { ...context, signal: AbortSignal.abort() })],
  ] as const) {
    await expect(call(), name).rejects.toThrow(/abort/i)
  }
})

test('a broken config is a tool error carrying the reason, not a silent empty result', async () => {
  await writeFile(join(dir, 'slop-gate.config.ts'), 'export default { this is not valid typescript\n')

  const result = await callCheck({}, context)
  expect(result.isError).toBe(true)
  expect(result.content[0]?.text).toContain('slop-gate could not load its configuration.')
  expect(result.content[0]?.text.length).toBeGreaterThan('slop-gate could not load its configuration.'.length + 10)
})
