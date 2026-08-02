import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { RULE_ENTRIES, compareStrings, type InventoryFile, type RawDiagnostic, type RunContext } from '@misaon/slop-gate-core'
import { ACTIONLINT_RULE_IDS, ACTIONLINT_PATH_ENV, createActionlintEngine, resolveActionlintBinary } from './index.ts'

const run = promisify(execFile)
const installed = resolveActionlintBinary()
// Inlined at each call site rather than aliased: `oxlint`'s vitest rules only recognise a test
// through the `test.*` member expression, so a `const withBinary = test.skipIf(...)` binding makes
// every assertion inside look like a standalone `expect`.
const noBinary = installed === undefined

let workspace: string
let context: RunContext

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'sgate-actionlint-'))
  await mkdir(join(workspace, 'repo', '.github', 'workflows'), { recursive: true })
  await mkdir(join(workspace, 'tmp'), { recursive: true })
  // actionlint resolves local actions and reusable workflows against the nearest `.git`; without one
  // it disables both silently, so `workflow-call` would appear to pass by never running.
  await run('git', ['init', '-q', join(workspace, 'repo')])
  context = { rootDir: join(workspace, 'repo'), tmpDir: join(workspace, 'tmp') }
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

async function workflow(name: string, source: string): Promise<InventoryFile> {
  const relative = ['.github', 'workflows', name].join('/')
  await writeFile(join(context.rootDir, '.github', 'workflows', name), source, 'utf8')
  return {
    path: relative,
    language: 'github-workflow',
    workspace: '',
    size: new TextEncoder().encode(source).length,
    mtimeMs: 0,
  }
}

async function lint(files: readonly InventoryFile[], rules: readonly string[]): Promise<RawDiagnostic[]> {
  const engine = createActionlintEngine()
  const handle = await engine.materializeConfig(new Map(rules.map((rule) => [rule, 'warn' as const])), context)
  const found: RawDiagnostic[] = []
  try {
    for await (const diagnostic of engine.run({ files }, handle, context, AbortSignal.timeout(30_000))) found.push(diagnostic)
  } finally {
    await handle.dispose()
  }
  return found
}

test('every rule the adapter can report has a registry entry, and vice versa', () => {
  // The agreement `SCHEMA_RULE_IDS` has with its own entries, for the same reason: actionlint cannot
  // be asked for a subset of its rules, so the adapter filters output against the elected selection.
  // A rule it can emit but the registry has never heard of would be dropped, silently removing
  // coverage nobody knew they had.
  const registered = RULE_ENTRIES.filter((entry) => entry.engine === 'actionlint').map((entry) => entry.engineRuleId)
  expect([...registered].sort(compareStrings)).toEqual([...ACTIONLINT_RULE_IDS].sort(compareStrings))
})

test('availability is filesystem-only: it never executes the binary it finds', async () => {
  // The contract `Engine.availability` states at length, proved rather than trusted. The "binary" is
  // a script that records having been run; availability must leave no trace, and `version()` — which
  // is allowed to spawn — must leave one, or the first half of the assertion would pass vacuously
  // against a script that never worked.
  const marker = join(workspace, 'was-executed')
  const script = join(workspace, 'actionlint')
  await writeFile(script, `#!/bin/sh\necho ran >> ${JSON.stringify(marker)}\necho "1.7.12"\n`, { mode: 0o755 })

  const engine = createActionlintEngine({ binaryPath: script })
  expect(await engine.availability?.()).toEqual({ available: true })
  expect(existsSync(marker)).toBe(false)

  expect(await engine.version()).toBe('1.7.12')
  expect(existsSync(marker)).toBe(true)
})

test('an absent binary is a reported coverage gap naming the command that fixes it', async () => {
  const previous = process.env[ACTIONLINT_PATH_ENV]
  const previousPath = process.env['PATH']
  const previousCache = process.env['SLOP_GATE_CACHE_DIR']
  try {
    // A PATH and a cache that genuinely contain nothing, so this exercises the real resolver rather
    // than an injected stub — this is the only place the absent-binary path is driven end to end.
    process.env['PATH'] = join(workspace, 'empty-path')
    process.env['SLOP_GATE_CACHE_DIR'] = join(workspace, 'empty-cache')
    delete process.env[ACTIONLINT_PATH_ENV]

    const availability = await createActionlintEngine().availability?.()
    expect(availability?.available).toBe(false)
    expect(availability).toMatchObject({
      reason: expect.stringContaining('actionlint was not found'),
      install: 'sgate engines install actionlint',
    })
  } finally {
    if (previous === undefined) delete process.env[ACTIONLINT_PATH_ENV]
    else process.env[ACTIONLINT_PATH_ENV] = previous
    if (previousPath === undefined) delete process.env['PATH']
    else process.env['PATH'] = previousPath
    if (previousCache === undefined) delete process.env['SLOP_GATE_CACHE_DIR']
    else process.env['SLOP_GATE_CACHE_DIR'] = previousCache
  }
})

test('the materialised config is a real file, and it is what suppresses the repository’s own', async () => {
  const engine = createActionlintEngine({ binaryPath: '/bin/true' })
  const handle = await engine.materializeConfig(new Map([['events', 'warn' as const]]), context)
  expect(handle.path.startsWith(context.tmpDir)).toBe(true)
  expect(await readFile(handle.path, 'utf8')).toContain('self-hosted-runner')
  // No `ruleCount`: actionlint has no way to report how many rules it loaded, so there is nothing to
  // assert the materialised config against — stated as a test so it reads as deliberate.
  expect(handle.ruleCount).toBeUndefined()
  await handle.dispose()
})

test.skipIf(noBinary)('finds a real defect in a real workflow', async () => {
  const file = await workflow(
    'ci.yml',
    ['on: push', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo ${{ matrix.nope }}', ''].join(
      '\n',
    ),
  )
  const found = await lint([file], ['expression'])
  expect(found).toHaveLength(1)
  expect(found[0]?.engineRuleId).toBe('expression')
  expect(found[0]?.file).toBe('.github/workflows/ci.yml')
  expect(found[0]?.message).toContain('"nope" is not defined')
  const source = await readFile(join(context.rootDir, '.github', 'workflows', 'ci.yml'), 'utf8')
  // Exactly what actionlint's own `^~~~~~~~~~~` indicator underlines for this input, checked against
  // the real binary's pretty output: the whole expression, not the property name inside it.
  expect(source.slice(found[0]!.range.start, found[0]!.range.end)).toBe('matrix.nope')
})

test.skipIf(noBinary)('only the elected rules are reported', async () => {
  const file = await workflow(
    'ci.yml',
    ['on: push', 'jobs:', '  a:', '    runs-on: ubuntu-lastest', '    steps:', '      - run: echo ${{ matrix.nope }}', ''].join(
      '\n',
    ),
  )
  expect((await lint([file], ['expression'])).map((d) => d.engineRuleId)).toEqual(['expression'])
  expect((await lint([file], ['runner-label'])).map((d) => d.engineRuleId)).toEqual(['runner-label'])
  expect(
    (await lint([file], ['expression', 'runner-label'])).map((d) => d.engineRuleId).sort(compareStrings),
  ).toEqual(['expression', 'runner-label'])
})

test.skipIf(noBinary)('the repository’s own .github/actionlint.yaml is never read', async () => {
  // §13: users neither see nor maintain engine-native config files. Without `-config-file`, actionlint
  // discovers this file and the run stops matching what `sgate rules why` says it does.
  await writeFile(
    join(context.rootDir, '.github', 'actionlint.yaml'),
    ['self-hosted-runner:', '  labels:', '    - our-own-runner', ''].join('\n'),
    'utf8',
  )
  const file = await workflow(
    'ci.yml',
    ['on: push', 'jobs:', '  a:', '    runs-on: our-own-runner', '    steps:', '      - run: echo hi', ''].join('\n'),
  )
  expect((await lint([file], ['runner-label'])).map((d) => d.engineRuleId)).toEqual(['runner-label'])
})

test.skipIf(noBinary)('an empty batch lints nothing, rather than the whole repository', async () => {
  // A bare `actionlint` walks up to the nearest `.github/workflows` and lints all of it, so this is
  // the difference between "no files assigned" and "every workflow in the repository, uncached".
  await workflow('ci.yml', ['on: push', 'jobs:', '  a:', '    runs-on: ubuntu-lastest', '    steps:', '      - run: hi', ''].join('\n'))
  expect(await lint([], ['runner-label'])).toEqual([])
})

test.skipIf(noBinary)('messages never carry an absolute path', async () => {
  // `RawDiagnostic.message` reaches fingerprints, the cache key and the baseline. The `action` rule is
  // the one that embeds paths today, so it is the one driven here even though it is excluded from
  // `recommended`.
  await mkdir(join(context.rootDir, '.github', 'actions', 'local'), { recursive: true })
  await writeFile(
    join(context.rootDir, '.github', 'actions', 'local', 'action.yml'),
    ['name: local', 'description: d', 'inputs:', '  who:', '    type: string', '    description: d', 'runs:', '  using: composite', '  steps: []', ''].join('\n'),
    'utf8',
  )
  const file = await workflow(
    'ci.yml',
    ['on: push', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: ./.github/actions/local', ''].join('\n'),
  )
  const found = await lint([file], ['action'])
  expect(found).toHaveLength(1)
  expect(found[0]?.message).not.toContain(context.rootDir)
  expect(found[0]?.message).not.toContain(workspace)
  expect(found[0]?.message).toContain('".github/actions/local"')
})

test.skipIf(noBinary)('version reports the binary that actually ran, not the pinned one', async () => {
  const reported = await createActionlintEngine().version()
  const { stdout } = await run(installed!.command, ['--version'], { encoding: 'utf8' })
  expect(reported).toBe(stdout.split('\n')[0]?.trim())
})

test.skipIf(noBinary)('a file that is not a workflow at all fails loudly rather than passing silently', async () => {
  // actionlint exits 3 on a fatal error. Mapping that to "no findings" would turn an unanalysed file
  // into a clean one.
  const file = await workflow('ci.yml', 'on: push\n')
  await rm(join(context.rootDir, '.github', 'workflows', 'ci.yml'))
  await expect(lint([file], ['events'])).rejects.toThrow(/actionlint failed/)
})
