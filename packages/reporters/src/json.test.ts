import { expect, test } from 'vitest'
import type { CheckResult } from '@misaon/slop-gate-core'
import { createReporter } from './index.ts'

const result: CheckResult = {
  diagnostics: [],
  counts: { error: 0, warn: 0, info: 0 },
  engineFailures: [],
  unavailableEngines: [],
  baseline: null,
  stats: { filesScanned: 1, filesAnalysed: 1, filesFromCache: 0, cacheByEngine: [], enginesRun: 1, durationMs: 1 },
  ruleset: { enabledConcepts: 2, overlaps: 0, uncovered: [], unknownKeys: [] },
}

test('emits a single versioned json document on done', () => {
  let output = ''
  const reporter = createReporter('json', {
    write: (chunk) => (output += chunk),
    color: false,
    unicode: true,
    width: 80,
    version: '0.0.0',
    readSource: () => null,
  })
  reporter.onEvent({ type: 'done', result })

  const parsed = JSON.parse(output) as { version: number; counts: unknown; diagnostics: unknown[] }
  expect(parsed.version).toBe(4)
  expect(parsed.diagnostics).toEqual([])
  expect(parsed.counts).toEqual({ error: 0, warn: 0, info: 0 })
})

test('writes nothing before done so the document stays valid json', () => {
  let output = ''
  const reporter = createReporter('json', {
    write: (chunk) => (output += chunk),
    color: false,
    unicode: true,
    width: 80,
    version: '0.0.0',
    readSource: () => null,
  })
  reporter.onEvent({ type: 'engine-failed', engine: 'oxlint', message: 'x' })

  expect(output).toBe('')
})

test('an engine that could not run is in the document, so no consumer reads empty as clean', () => {
  let output = ''
  const reporter = createReporter('json', {
    write: (chunk) => (output += chunk),
    color: false,
    unicode: true,
    width: 80,
    version: '0.0.0',
    readSource: () => null,
  })
  reporter.onEvent({
    type: 'done',
    result: {
      ...result,
      unavailableEngines: [
        {
          engine: 'astgrep',
          reason: '`ast-grep` was not found on PATH',
          install: 'brew install ast-grep',
          displaced: [
            {
              concept: 'slop.stub-implementation',
              languages: ['ts'],
              wouldOwn: { engine: 'astgrep', engineRuleId: 'stub-implementation' },
              insteadOwnedBy: undefined,
            },
          ],
        },
      ],
    },
  })

  const parsed = JSON.parse(output) as { unavailableEngines: { engine: string; install: string; displaced: unknown[] }[] }
  expect(parsed.unavailableEngines).toHaveLength(1)
  expect(parsed.unavailableEngines[0]?.engine).toBe('astgrep')
  expect(parsed.unavailableEngines[0]?.install).toBe('brew install ast-grep')
  expect(parsed.unavailableEngines[0]?.displaced).toHaveLength(1)
})

test('emits the baseline block as null when no baseline was read, never omitted', () => {
  let output = ''
  const reporter = createReporter('json', {
    write: (chunk) => (output += chunk),
    color: false,
    unicode: true,
    width: 80,
    version: '0.0.0',
    readSource: () => null,
  })
  reporter.onEvent({ type: 'done', result })

  expect(JSON.parse(output)).toHaveProperty('baseline', null)
})

test('carries the whole baseline summary, so an empty diagnostics array can be read correctly', () => {
  let output = ''
  const reporter = createReporter('json', {
    write: (chunk) => (output += chunk),
    color: false,
    unicode: true,
    width: 80,
    version: '0.0.0',
    readSource: () => null,
  })
  reporter.onEvent({
    type: 'done',
    result: {
      ...result,
      baseline: {
        path: '.slop-gate/baseline.json',
        entries: 3,
        accepted: 2,
        acceptedBySeverity: { error: 1, warn: 1, info: 0 },
        acceptedByConcept: [{ concept: 'slop.double-cast', count: 2 }],
        stale: [{ file: 'src/gone.ts', concept: 'slop.double-cast', fingerprint: 'zzzz' }],
      },
    },
  })

  const parsed = JSON.parse(output) as { diagnostics: unknown[]; baseline: { accepted: number; stale: unknown[] } }
  expect(parsed.diagnostics).toEqual([])
  expect(parsed.baseline.accepted).toBe(2)
  expect(parsed.baseline.stale).toHaveLength(1)
})

const capture = (over: Partial<CheckResult>): Record<string, unknown> => {
  let output = ''
  const reporter = createReporter('json', {
    write: (chunk) => (output += chunk),
    color: false,
    unicode: true,
    width: 80,
    version: '0.0.0',
    readSource: () => null,
  })
  reporter.onEvent({ type: 'done', result: { ...result, ...over } })
  return JSON.parse(output) as Record<string, unknown>
}

test('a document from a run nobody timed has no timings key at all, not an empty one', () => {
  expect('timings' in capture({})).toBe(false)
})

test('carries the timing breakdown verbatim, phases and per-rule counts both', () => {
  const parsed = capture({
    timings: {
      startupMs: 61.2,
      phases: [{ name: 'normalize:oxlint', durationMs: 6.2, count: 307 }],
      unattributedMs: 9.8,
      rules: [{ ruleRefKey: 'oxlint/no-debugger', findings: 23 }],
    },
  })

  expect(parsed['timings']).toEqual({
    startupMs: 61.2,
    phases: [{ name: 'normalize:oxlint', durationMs: 6.2, count: 307 }],
    unattributedMs: 9.8,
    rules: [{ ruleRefKey: 'oxlint/no-debugger', findings: 23 }],
  })
  // Additive: a v4 reader finds every key it knew exactly where it was.
  expect(parsed['version']).toBe(4)
})
