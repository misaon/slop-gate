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
import { defaultEngines } from '../../engines.ts'
import { callCheck, callExplain, callPropose, type ToolContext } from './tools.ts'

let dir: string
let context: ToolContext
let originalSnapshotPath: string | undefined

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-mcp-tools-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  await writeFile(join(dir, 'clean.ts'), 'export const a = 1\n')
  // Pinned rather than inherited, and the reason is that these tests are about the MCP tool's own
  // output shape, not about what `recommended` happens to contain this month. Two of its concepts
  // cannot be satisfied by a bare temp directory at all: `types.type-error` needs a tsconfig and an
  // installed `typescript`, and `dead-code.unused-file` calls every file here unreachable because
  // there is no entry point. Left inherited, both turned "a clean run says clean" red the first time
  // the preset grew — a test asserting the preset's size through a hole in the fixture. Everything
  // these tests actually drive (oxlint findings, the actionlint gap, schema) is untouched.
  await writeFile(
    join(dir, 'slop-gate.config.ts'),
    "export default { extends: ['recommended'], rules: { 'types.type-error': 'off', 'dead-code.unused-file': 'off' } }\n",
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

/** The fixture's own config, resolved the way every command resolves it. */
const loadedConfig = async (): Promise<SlopGateConfig> => {
  const loaded = await loadCliConfig(dir, DEFAULT_CONFIG)
  if (loaded.kind === 'error') throw new Error(loaded.message)
  return loaded.config
}

type CheckStructured = {
  outcome: string
  complete: boolean
  gaps: Array<{ kind: string; engine?: string; detail: string; remedy?: string; concepts: string[] }>
  counts: { error: number; warn: number; info: number }
  concepts: Array<{ concept: string; section: string; findings: number; tier: string | null }>
  reportTruncated: boolean
  uncoveredConcepts: string[]
  unknownConfigKeys: number
}

/**
 * Gives the dependency-security engine an advisory snapshot, so what these tests describe is the
 * tool rather than whether this machine has ever run `sgate engines install advisories`. Same
 * discipline as the actionlint stub below: construct the premise, never inherit it from a laptop.
 *
 * Dated now, deliberately. A snapshot past a week old reports its own age as a finding — that is the
 * engine working correctly, and here it would be indistinguishable from the regressions these tests
 * exist to catch. The tables are empty because none of these fixtures has a lockfile to match
 * against; what is being constructed is availability, not findings.
 */
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

/**
 * Forces actionlint absent through the override its own resolver reads first, which is
 * documented to resolve to nothing rather than fall through to `PATH`. Constructed rather than
 * assumed, so this holds on a developer machine with actionlint installed and on a CI runner without
 * it — the mistake `packages/cli/src/commands/check.test.ts` records having made once already.
 */
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

// --- check: the honesty properties ---------------------------------------------------------------

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
  // Same failure as the absent-engine case below, from the other cause: every engine ran and saw
  // everything, and the result is still not the whole truth. `baseline-accepted` is a `CoverageGap`
  // for exactly that reason — reusing the mechanism is what keeps `outcome` and the report's own
  // `coverage:` line from disagreeing about one run.
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
  // The failure this whole surface exists to prevent, exercised end to end: zero findings, and the
  // result must still be impossible to read as a pass. A workflow file is what gives actionlint
  // something it would have owned — without one its absence displaces nothing and is correctly *not*
  // a gap, which is the sibling property pinned below.
  await mkdir(join(dir, '.github', 'workflows'), { recursive: true })
  await writeFile(join(dir, '.github', 'workflows', 'ci.yml'), 'on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n')

  const result = await withoutActionlint(() => callCheck({}, context))
  const data = structured<CheckStructured>(result)

  expect(data.counts).toEqual({ error: 0, warn: 0, info: 0 })
  expect(data.concepts).toEqual([])

  // There is no value of `outcome` that reads as a pass here. That is the point of the enum.
  expect(data.outcome).toBe('incomplete')
  expect(data.complete).toBe(false)

  const gap = data.gaps.find((entry) => entry.kind === 'engine-unavailable')
  expect(gap?.engine).toBe('actionlint')
  expect(gap?.detail).toContain('do not read an empty findings list as clean')
  expect(gap?.remedy).toBe('sgate engines install actionlint')
  expect(gap?.concepts.length).toBeGreaterThan(0)

  // And the text half, which is the `agent` reporter's own and not re-derived here.
  const text = result.content[0]?.text ?? ''
  expect(text).toContain('INCOMPLETE: engine `actionlint`')
  expect(text).toContain('so this is not a clean result')
  // Not "Install": `tsc` can also be a gap, with a tsconfig rather than a download as the remedy,
  // so the reporters phrase every gap neutrally.
  expect(text).toContain('Make `actionlint` runnable here')
})

test('the two channels agree about whether the run was complete', async () => {
  // The property that matters more than either channel's wording: the prose and the structure are
  // computed from one predicate, so a reader who trusts one is never contradicted by the other.
  // Asserted over both states rather than the interesting one alone — a check that only ever sees
  // the incomplete case would pass just as well if `outcome` were hard-coded.
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
  // The other direction, and the reason `isCoverageGap` is a predicate rather than a length check.
  // This fixture has no workflow, so actionlint's absence costs it nothing — reporting that as
  // incomplete would teach a caller to discount the word on the run where it matters.
  //
  // `uncoveredConcepts` is non-empty here anyway, and that is the trap this test exists to pin. An
  // engine that is registered but not installed is not *capable*, so every concept it owns lands in
  // `ruleset.uncovered` regardless of whether the repository holds a single file it would have
  // looked at — thirteen workflow concepts, in a directory with no workflows. Letting that drive
  // `outcome` would mark a clean run incomplete on any machine missing an optional engine, and would
  // put the structure at odds with the report's own `coverage:` line, which counts engines only.
  const data = structured<CheckStructured>(await withoutActionlint(() => callCheck({}, context)))
  expect(data.outcome).toBe('clean')
  expect(data.gaps).toEqual([])
  expect(data.uncoveredConcepts.length).toBeGreaterThan(0)
})

test('a bounded report still reports every concept at its true count', async () => {
  // The structural half of "a group header is never dropped". A caller that squeezed the prose has
  // not been told there is less to fix than there is.
  await writeFile(join(dir, 'spread.ts'), Array.from({ length: 12 }, (_, i) => `export const v${i} = { ...{ a: ${i} } }`).join('\n'))

  const full = structured<CheckStructured>(await callCheck({}, context))
  const squeezed = await callCheck({ maxTokens: 600 }, context)
  const bounded = structured<CheckStructured>(squeezed)

  expect(full.concepts[0]?.findings).toBe(12)
  expect(bounded.concepts).toEqual(full.concepts)
  expect(bounded.reportTruncated).toBe(true)
  expect(squeezed.content[0]?.text).toContain('omitted:')
})

test('reportTruncated is read off the report handed over, not predicted from the budget being set', async () => {
  // The reporter tries the complete document first and prints it whole when it fits, so "a budget
  // was requested" and "something was dropped" are different facts.
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

// --- rootDir containment -------------------------------------------------------------------------

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

// --- explain_concept -----------------------------------------------------------------------------

test('explains an enabled concept and names the rule that owns it, without running an engine', async () => {
  const result = await callExplain({ concept: 'correctness.no-debugger' }, context)
  const data = structured<{ known: boolean; enabled: boolean; owners: Array<{ ruleId: string }> }>(result)

  expect(result.isError).toBeUndefined()
  expect(data.known).toBe(true)
  expect(data.enabled).toBe(true)
  expect(data.owners.map((owner) => owner.ruleId)).toContain('oxlint/no-debugger')
  expect(result.content[0]?.text).toContain('correctness.no-debugger')
})

test('a rule id is answered with the concepts that rule declares, not refused blankly', async () => {
  // Every finding carries both, and only one of them is the argument here. A dead end would leave
  // the model with nothing to retry; naming the concept makes the correction the model's to make.
  const result = await callExplain({ concept: 'oxlint/no-debugger' }, context)

  expect(result.isError).toBe(true)
  expect(result.content[0]?.text).toContain('is a rule id, not a concept id')
  expect(result.content[0]?.text).toContain('correctness.no-debugger')
})

test('an unknown concept id is an error, not a quiet concept', async () => {
  // The one wrong answer that is also reassuring: reported as a success, a typo reads as "the
  // concept exists and nothing is enabling it".
  const result = await callExplain({ concept: 'nope.not-a-concept' }, context)

  expect(result.isError).toBe(true)
  expect(structured<{ known: boolean }>(result).known).toBe(false)
})

// --- propose_fixes -------------------------------------------------------------------------------

test('proposes without writing, and says so in the payload and on disk', async () => {
  const source = 'export const v = { ...{ a: 1 } }\n'
  await writeFile(join(dir, 'spread.ts'), source)

  const result = await callPropose({ tier: 'unsafe' }, context)
  const data = structured<{
    applied: boolean
    tier: string
    command: string
    files: Array<{ file: string; diff: string }>
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
  expect(await readFile(join(dir, 'spread.ts'), 'utf8')).toBe(source)
})

test('the safe tier is the default, matching plain `sgate fix`', async () => {
  const data = structured<{ tier: string; command: string }>(await callPropose({}, context))
  expect(data.tier).toBe('safe')
  expect(data.command).toBe('sgate fix')
})

test('a dirty worktree does not stop a proposal — there is nothing to protect', async () => {
  // `sgate fix --dry-run` skips the worktree rail deliberately (spec §11), and an agent mid-edit is
  // the normal case for this tool rather than an exceptional one. A refusal here would make the
  // tool useless exactly when it is wanted.
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

// --- cancellation --------------------------------------------------------------------------------

test('a cancelled request stops the run rather than finishing it and discarding the answer', async () => {
  // `notifications/cancelled` aborts `ctx.mcpReq.signal`, which is forwarded to `runCheck` and
  // `runFix`. Driven with an already-aborted signal because that is the deterministic form of the
  // question — racing a real cancellation against a 100ms check on a two-file fixture would test the
  // scheduler. What it pins is that the signal is *connected*: without the forwarding, this runs
  // every engine to completion and returns a full result.
  await writeFile(join(dir, 'spread.ts'), 'export const v = { ...{ a: 1 } }\n')

  for (const [name, call] of [
    ['check', () => callCheck({}, { ...context, signal: AbortSignal.abort() })],
    ['propose_fixes', () => callPropose({}, { ...context, signal: AbortSignal.abort() })],
  ] as const) {
    // Thrown rather than returned: the SDK turns an exception out of a handler into an `isError`
    // result and leaves the connection open, verified directly against the transport, so there is
    // nothing for this layer to add by catching it.
    await expect(call(), name).rejects.toThrow(/abort/i)
  }
})

// --- configuration failure -----------------------------------------------------------------------

test('a broken config is a tool error carrying the reason, not a silent empty result', async () => {
  // An agent told only "configuration failed, look at the server's log" cannot act. The whole point
  // of a tool execution error is that the caller can read it and correct it.
  await writeFile(join(dir, 'slop-gate.config.ts'), 'export default { this is not valid typescript\n')

  const result = await callCheck({}, context)
  expect(result.isError).toBe(true)
  expect(result.content[0]?.text).toContain('slop-gate could not load its configuration.')
  expect(result.content[0]?.text.length).toBeGreaterThan('slop-gate could not load its configuration.'.length + 10)
})
