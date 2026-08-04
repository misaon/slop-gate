import { expect, test } from 'vitest'
import type { CheckResult, Diagnostic, Severity } from '@misaon/slop-gate-core'
import { createReporter, type ReporterName } from './index.ts'
import { PLATFORM_LIMITS, PLATFORM_SEVERITY } from './platform.ts'

const diagnostic = (over: Partial<Diagnostic> = {}): Diagnostic => ({
  concept: 'correctness.no-debugger',
  ruleRefKey: 'oxlint/no-debugger',
  engine: 'oxlint',
  severity: 'error',
  message: '`debugger` statement is not allowed',
  file: 'src/a.ts',
  range: { start: 22, end: 30 },
  position: { startLine: 2, startColumn: 3, endLine: 2, endColumn: 11 },
  fingerprint: 'abc123',
  ...over,
})

const resultWith = (diagnostics: readonly Diagnostic[]): CheckResult => ({
  diagnostics: [...diagnostics],
  counts: { error: 0, warn: 0, info: 0 },
  engineFailures: [],
  unavailableEngines: [],
  baseline: null,
  stats: { filesScanned: 1, filesAnalysed: 1, filesFromCache: 0, cacheByEngine: [], enginesRun: 1, durationMs: 1 },
  ruleset: { enabledConcepts: 1, overlaps: 0, uncovered: [], unknownKeys: [] },
})

/** Runs a reporter over a diagnostic stream and a `done`, exactly as the CLI drives it. */
const render = (name: ReporterName, diagnostics: readonly Diagnostic[]): string => {
  let output = ''
  const reporter = createReporter(name, {
    write: (chunk) => (output += chunk),
    color: false,
    unicode: true,
    width: 80,
    version: '1.2.3',
    readSource: () => null,
  })
  for (const one of diagnostics) reporter.onEvent({ type: 'diagnostic', diagnostic: one })
  reporter.onEvent({ type: 'done', result: resultWith(diagnostics) })
  return output
}

const SEVERITIES = ['error', 'warn', 'info'] as const satisfies readonly Severity[]

test('no platform is told that a warning is an error', () => {
  // The mapping is where the policy silently inverts: a `warn` does not fail a slop-gate run, so a `warn`
  // arriving as a platform error turns every advisory finding into a red pull request.
  for (const platform of ['sarif', 'github', 'gitlab'] as const) {
    expect(PLATFORM_SEVERITY[platform].warn).not.toBe(PLATFORM_SEVERITY[platform].error)
    expect(PLATFORM_SEVERITY[platform].info).not.toBe(PLATFORM_SEVERITY[platform].error)
  }
})

test('every severity has a distinct name on every platform, so none collapses into another', () => {
  for (const platform of ['sarif', 'github', 'gitlab'] as const) {
    const names = SEVERITIES.map((severity) => PLATFORM_SEVERITY[platform][severity])
    expect(new Set(names).size).toBe(SEVERITIES.length)
  }
})

test('sarif only uses the three levels the format accepts', () => {
  expect(SEVERITIES.map((s) => PLATFORM_SEVERITY.sarif[s])).toEqual(['error', 'warning', 'note'])
})

test('gitlab claims neither critical nor blocker, which nothing in a diagnostic measures', () => {
  // Widened deliberately: against the `as const` table these two are already a *compile* error, which is the
  // stronger guarantee. The runtime assertion is what survives someone widening the table's type later.
  const claimed: ReadonlySet<string> = new Set(SEVERITIES.map((s) => PLATFORM_SEVERITY.gitlab[s]))

  expect(claimed.has('critical')).toBe(false)
  expect(claimed.has('blocker')).toBe(false)
})

test('sarif carries the fingerprint as a partial fingerprint, which is what stops re-reporting on every push', () => {
  const log = JSON.parse(render('sarif', [diagnostic()])) as {
    version: string
    runs: { tool: { driver: { name: string; rules: { id: string }[] } }; results: { ruleId: string; level: string; partialFingerprints: Record<string, string> }[] }[]
  }

  expect(log.version).toBe('2.1.0')
  expect(log.runs[0]?.tool.driver.name).toBe('slop-gate')
  expect(log.runs[0]?.tool.driver.rules.map((r) => r.id)).toEqual(['correctness.no-debugger'])
  expect(log.runs[0]?.results[0]?.ruleId).toBe('correctness.no-debugger')
  expect(log.runs[0]?.results[0]?.level).toBe('error')
  // `partialFingerprints`, not `fingerprints`: editing the line legitimately produces a new one.
  expect(log.runs[0]?.results[0]?.partialFingerprints).toEqual({ slopGateFingerprint: 'abc123' })
})

test('sarif anchors a fileless diagnostic on the root rather than inventing a path', () => {
  const log = JSON.parse(render('sarif', [diagnostic({ file: null })])) as {
    runs: { results: { locations: { physicalLocation: { artifactLocation: { uri: string }; region?: unknown } }[] }[] }[]
  }
  const location = log.runs[0]?.results[0]?.locations[0]?.physicalLocation

  expect(location?.artifactLocation.uri).toBe('.')
  expect(location?.region).toBeUndefined()
})

test('sarif says so when it drops findings past what the platform ingests', () => {
  const many = Array.from({ length: PLATFORM_LIMITS.sarifResultsPerRun + 1 }, (_, index) =>
    diagnostic({ fingerprint: `f${index}` }),
  )

  const log = JSON.parse(render('sarif', many)) as {
    runs: { results: unknown[]; invocations?: { toolExecutionNotifications: { message: { text: string } }[] }[] }[]
  }

  expect(log.runs[0]?.results).toHaveLength(PLATFORM_LIMITS.sarifResultsPerRun)
  expect(log.runs[0]?.invocations?.[0]?.toolExecutionNotifications[0]?.message.text).toContain(`${many.length} findings`)
})

test('sarif adds no truncation notice when nothing was dropped', () => {
  const log = JSON.parse(render('sarif', [diagnostic()])) as { runs: { invocations?: unknown }[] }
  expect(log.runs[0]?.invocations).toBeUndefined()
})

test('a github annotation names the file, the range and the concept', () => {
  const output = render('github', [diagnostic()])

  expect(output.split('\n')[0]).toBe(
    '::error title=correctness.no-debugger,file=src/a.ts,line=2,col=3,endLine=2,endColumn=11::`debugger` statement is not allowed',
  )
})

test('a github annotation escapes the characters that would truncate the command', () => {
  // A raw newline ends the command and leaves the rest on stdout as log text; a colon or comma in a property
  // ends the property list. Both produce an annotation attached to the wrong place, silently.
  const output = render('github', [
    diagnostic({ concept: 'a:b,c', message: 'first\nsecond 50% of, it: done\r' }),
  ])

  expect(output).toContain('title=a%3Ab%2Cc')
  expect(output).toContain('::first%0Asecond 50%25 of, it: done%0D')
  // Exactly one command line, which is the property being asserted.
  expect(output.split('\n').filter((line) => line.startsWith('::'))).toHaveLength(1)
})

test('a github annotation for a fileless diagnostic omits file rather than guessing one', () => {
  const output = render('github', [diagnostic({ file: null })])

  expect(output).toContain('::error title=correctness.no-debugger::')
  expect(output).not.toContain('file=')
})

test('github reports an engine failure as its own annotation, not as a finding', () => {
  let output = ''
  const reporter = createReporter('github', {
    write: (chunk) => (output += chunk),
    color: false,
    unicode: true,
    width: 80,
    version: '1.2.3',
    readSource: () => null,
  })
  reporter.onEvent({ type: 'engine-failed', engine: 'knip', message: 'could not parse: {x}' })

  expect(output).toContain('::error title=slop-gate::engine knip failed: could not parse: {x}')
})

test('github says how many annotations it will hide, since GitHub does not', () => {
  const many = Array.from({ length: PLATFORM_LIMITS.githubAnnotationsPerLevel + 5 }, (_, index) =>
    diagnostic({ severity: 'warn', fingerprint: `f${index}` }),
  )

  const output = render('github', many)

  // A notice, so the warning that says warnings are hidden cannot itself be one of the hidden warnings.
  expect(output).toContain(`::notice title=slop-gate::${many.length} warning annotations were emitted`)
})

test('github adds no notice when every annotation fits', () => {
  expect(render('github', [diagnostic()])).not.toContain('::notice')
})

test('gitlab emits the field names code quality requires, and a path with no ./ prefix', () => {
  const report = JSON.parse(render('gitlab', [diagnostic({ severity: 'warn' })])) as {
    description: string
    check_name: string
    fingerprint: string
    severity: string
    location: { path: string; lines: { begin: number } }
  }[]

  expect(report[0]).toEqual({
    description: '`debugger` statement is not allowed',
    check_name: 'correctness.no-debugger',
    fingerprint: 'abc123',
    severity: 'minor',
    location: { path: 'src/a.ts', lines: { begin: 2 } },
  })
  expect(report[0]?.location.path.startsWith('./')).toBe(false)
})

test('gitlab points a fileless diagnostic at the config file, which is what it is about', () => {
  const report = JSON.parse(render('gitlab', [diagnostic({ file: null })])) as { location: { path: string; lines: { begin: number } } }[]

  expect(report[0]?.location).toEqual({ path: 'slop-gate.config.ts', lines: { begin: 1 } })
})

test('the platform formats write nothing before done except github, which streams by design', () => {
  for (const name of ['sarif', 'gitlab'] as const) {
    let output = ''
    const reporter = createReporter(name, {
      write: (chunk) => (output += chunk),
      color: false,
      unicode: true,
      width: 80,
      version: '1.2.3',
      readSource: () => null,
    })
    reporter.onEvent({ type: 'diagnostic', diagnostic: diagnostic() })

    // Truncating either would produce an invalid document rather than a smaller one.
    expect(output).toBe('')
  }
})
