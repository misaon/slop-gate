import { expect, test } from 'vitest'
import type { CheckResult } from '@misaon/slop-gate-core'
import { createReporter } from './index.ts'

const result: CheckResult = {
  diagnostics: [],
  counts: { error: 0, warn: 0, info: 0 },
  engineFailures: [],
  unavailableEngines: [],
  stats: { filesScanned: 1, filesAnalysed: 1, filesFromCache: 0, enginesRun: 1, durationMs: 1 },
  ruleset: { enabledConcepts: 2, suppressed: 0, uncovered: [], unknownKeys: [] },
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
  expect(parsed.version).toBe(2)
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
