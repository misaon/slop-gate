import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { RULE_ENTRIES, createWalkFileSource, runCheck } from '@misaon/slop-gate-core'
import { ACTIONLINT_PATH_ENV, CACHE_DIR_ENV, createActionlintEngine, resolveActionlintBinary } from './index.ts'

/**
 * Availability-gated ownership, end to end, against a real binary that is really absent.
 *
 * The machinery — `unavailableEngines`, `'engine-unavailable'`, `ElectionResult.displaced` — landed
 * with stub engines and has never met a real adapter, because until now no shipped adapter declared
 * `availability()`. That is what this file is for.
 *
 * **What it deliberately does not show is a handover.** The plan was for actionlint to take
 * `correctness.parse-error` from the `schema` engine when present and hand it back when absent, which
 * would have produced a `displaced` entry with `insteadOwnedBy` set. The corpus measurement removed
 * the case for that transfer — zero parse errors and zero duplicate keys across 403 real workflow
 * files, against a recorded regression in position quality if it happened — so actionlint claims
 * neither concept and nothing else claims a `config.workflow-*` one. The transition it does prove is
 * the other shape: concepts that are owned when the binary is present and are a *reported coverage
 * gap*, `insteadOwnedBy: undefined`, when it is not.
 */
const run = promisify(execFile)
const installed = resolveActionlintBinary()
// Inlined at each call site rather than aliased: `oxlint`'s vitest rules only recognise a test
// through the `test.*` member expression, so a `const withBinary = test.skipIf(...)` binding makes
// every assertion inside look like a standalone `expect`.
const noBinary = installed === undefined

const WORKFLOW = [
  'on: push',
  'jobs:',
  '  a:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: echo ${{ matrix.nope }}',
  '',
].join('\n')

let dir: string
let saved: Record<string, string | undefined>

const options = () => ({
  rootDir: dir,
  config: { rules: { 'config.workflow-expression': 'warn' } } as never,
  entries: RULE_ENTRIES as never,
  fileSource: createWalkFileSource(),
  cacheDir: join(dir, '.slop-gate', 'cache'),
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-actionlint-availability-'))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  await mkdir(join(dir, '.github', 'workflows'), { recursive: true })
  await writeFile(join(dir, '.github', 'workflows', 'ci.yml'), WORKFLOW)
  await run('git', ['init', '-q', dir])
  saved = { path: process.env['PATH'], override: process.env[ACTIONLINT_PATH_ENV], cache: process.env[CACHE_DIR_ENV] }
})

afterEach(async () => {
  for (const [key, value] of [
    ['PATH', saved['path']],
    [ACTIONLINT_PATH_ENV, saved['override']],
    [CACHE_DIR_ENV, saved['cache']],
  ] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await rm(dir, { recursive: true, force: true })
})

function hideActionlint(): void {
  // A `PATH` and a cache that genuinely contain nothing, and no override — the resolver runs for real
  // against a filesystem where the binary is really not there.
  process.env['PATH'] = join(dir, 'empty-path')
  process.env[CACHE_DIR_ENV] = join(dir, 'empty-cache')
  delete process.env[ACTIONLINT_PATH_ENV]
}

test.skipIf(noBinary)('with the binary present, actionlint owns its concepts and reports', async () => {
  process.env[ACTIONLINT_PATH_ENV] = installed!.command
  const result = await runCheck({ ...options(), engines: [createActionlintEngine()] })

  expect(result.unavailableEngines).toEqual([])
  expect(result.engineFailures).toEqual([])
  expect(result.diagnostics.map((diagnostic) => [diagnostic.engine, diagnostic.concept, diagnostic.severity])).toEqual([
    ['actionlint', 'config.workflow-expression', 'warn'],
  ])
  expect(result.diagnostics[0]?.file).toBe('.github/workflows/ci.yml')
})

test('with the binary absent, the concept is a named coverage gap rather than a silent pass', async () => {
  // Runs whether or not actionlint is installed: hiding it is the point of the test.
  hideActionlint()
  const result = await runCheck({ ...options(), engines: [createActionlintEngine()] })

  expect(result.diagnostics).toEqual([])
  expect(result.engineFailures).toEqual([])
  expect(result.unavailableEngines).toHaveLength(1)
  expect(result.unavailableEngines[0]).toMatchObject({
    engine: 'actionlint',
    reason: expect.stringContaining('actionlint was not found'),
    install: 'sgate engines install actionlint',
  })
  // `displaced` names the concept and leaves `insteadOwnedBy` undefined, which is the accurate
  // answer: actionlint would have owned this and nothing else claims it, so nothing steps in. This is
  // the shape the machinery was never exercised in — every prior test had a substitute engine ready
  // to take over — and it is the one a real absent actionlint actually produces.
  expect(result.unavailableEngines[0]?.displaced).toEqual([
    {
      concept: 'config.workflow-expression',
      languages: ['github-workflow'],
      wouldOwn: { engine: 'actionlint', engineRuleId: 'expression' },
      insteadOwnedBy: undefined,
    },
  ])
})

test('an absent engine is a coverage gap, never an engine failure', async () => {
  // The distinction `IneligibilityReason` draws: "this build does not include actionlint" and
  // "actionlint is not installed here" are different facts, and neither is "actionlint crashed".
  hideActionlint()
  const result = await runCheck({ ...options(), engines: [createActionlintEngine()] })
  expect(result.engineFailures).toEqual([])
  expect(result.counts).toEqual({ error: 0, warn: 0, info: 0 })
})

test.skipIf(noBinary)('the same repository, the same config, differs only by whether the binary is there', async () => {
  // Stated as one assertion because it is the property the whole optional-engine design exists to
  // deliver: absence changes coverage, and says so, rather than changing the verdict silently.
  hideActionlint()
  const absent = await runCheck({ ...options(), engines: [createActionlintEngine()] })

  process.env[ACTIONLINT_PATH_ENV] = installed!.command
  const present = await runCheck({ ...options(), engines: [createActionlintEngine()] })

  expect([absent.diagnostics.length, absent.unavailableEngines.length]).toEqual([0, 1])
  expect([present.diagnostics.length, present.unavailableEngines.length]).toEqual([1, 0])
})
