import { expect, test } from 'vitest'
import type { CheckResult } from '@misaon/slop-gate-core'
import { createReporter } from './index.ts'

const result: CheckResult = {
  diagnostics: [],
  counts: { error: 0, warn: 0, info: 0 },
  engineFailures: [],
  stats: { filesScanned: 1, filesFromCache: 0, enginesRun: 1, durationMs: 1 },
  ruleset: { enabledConcepts: 2, suppressed: 0, uncovered: [], unknownKeys: [] },
}

test('emits a single versioned json document on done', () => {
  let output = ''
  const reporter = createReporter('json', { write: (chunk) => (output += chunk), color: false, readSource: () => null })
  reporter.onEvent({ type: 'done', result })

  const parsed = JSON.parse(output) as { version: number; counts: unknown; diagnostics: unknown[] }
  expect(parsed.version).toBe(1)
  expect(parsed.diagnostics).toEqual([])
  expect(parsed.counts).toEqual({ error: 0, warn: 0, info: 0 })
})

test('writes nothing before done so the document stays valid json', () => {
  let output = ''
  const reporter = createReporter('json', { write: (chunk) => (output += chunk), color: false, readSource: () => null })
  reporter.onEvent({ type: 'engine-failed', engine: 'oxlint', message: 'x' })

  expect(output).toBe('')
})
