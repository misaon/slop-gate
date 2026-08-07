import { expect, test } from 'vitest'
import type { Diagnostic } from '../diagnostics/types.ts'
import { unionMs, buildTimingReport, createTiming, NO_TIMING } from './timing.ts'

const diagnostic = (ruleRefKey: string): Diagnostic => ({
  concept: 'correctness.no-debugger',
  ruleRefKey,
  engine: 'oxlint',
  severity: 'error',
  message: 'x',
  file: 'src/a.ts',
  range: { start: 0, end: 1 },
  position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 },
  docsUrl: 'https://example.test/x',
  fingerprint: 'abc',
})

test('NO_TIMING runs the work and measures nothing', async () => {
  expect(await NO_TIMING.phase('p', async () => 1)).toBe(1)
  expect(NO_TIMING.wrap('w', () => 2)).toBe(2)
  expect(NO_TIMING.measured()).toEqual([])
  expect(NO_TIMING.enabled).toBe(false)
})

test('a phase entered twice reports one row with a count of two', async () => {
  const timing = createTiming()

  await timing.phase('probe', async () => undefined)
  await timing.phase('probe', async () => undefined)
  timing.wrap('sort', () => undefined)

  const probe = timing.measured().find((phase) => phase.name === 'probe')
  expect(probe?.count).toBe(2)
  expect(timing.measured().find((phase) => phase.name === 'sort')?.count).toBe(1)
})

test('a phase is measured even when the work throws, so a failed engine still accounts for its time', async () => {
  const timing = createTiming()

  await expect(timing.phase('run', async () => { throw new Error('boom') })).rejects.toThrow('boom')
  expect(() =>
    timing.wrap('normalize', () => {
      throw new Error('bang')
    }),
  ).toThrow('bang')

  expect(timing.measured().map((phase) => phase.name).sort()).toEqual(['normalize', 'run'])
})

test('startup, the phases and the residual account for the whole of the reported duration', () => {
  const report = buildTimingReport({
    busyMs: 0,
    phases: [
      { name: 'run:oxlint', durationMs: 40, count: 1 },
      { name: 'discover', durationMs: 10, count: 1 },
    ],
    startupMs: 60,
    insideMs: 55,
    diagnostics: [],
  })

  const summed = report.startupMs + report.phases.reduce((sum, phase) => sum + phase.durationMs, 0) + report.unattributedMs
  expect(summed).toBeCloseTo(115, 5)
  expect(report.startupMs).toBe(60)
  expect(report.unattributedMs).toBe(5)
})

test('measured phases are ordered longest first', () => {
  const report = buildTimingReport({
    busyMs: 0,
    phases: [
      { name: 'discover', durationMs: 10, count: 1 },
      { name: 'run:oxlint', durationMs: 40, count: 1 },
      { name: 'normalize:oxlint', durationMs: 10, count: 300 },
    ],
    startupMs: 60,
    insideMs: 60,
    diagnostics: [],
  })

  expect(report.phases.map((phase) => phase.name)).toEqual(['run:oxlint', 'discover', 'normalize:oxlint'])
})

test('a caller that did not claim its process start reports no startup at all', () => {
  const report = buildTimingReport({
    busyMs: 0,
    phases: [{ name: 'discover', durationMs: 10, count: 1 }],
    startupMs: 0,
    insideMs: 12,
    diagnostics: [],
  })

  expect(report.startupMs).toBe(0)
  expect(report.unattributedMs).toBe(2)
})

test('per rule the report carries a finding count, which is what an engine boundary can honestly give', () => {
  const report = buildTimingReport({
    busyMs: 0,
    phases: [],
    startupMs: 1,
    insideMs: 1,
    diagnostics: [
      diagnostic('oxlint/no-debugger'),
      diagnostic('tsc/2345'),
      diagnostic('oxlint/no-debugger'),
      diagnostic('astgrep/stub-implementation'),
    ],
  })

  expect(report.rules).toEqual([
    { ruleRefKey: 'oxlint/no-debugger', findings: 2 },
    { ruleRefKey: 'astgrep/stub-implementation', findings: 1 },
    { ruleRefKey: 'tsc/2345', findings: 1 },
  ])
})

test('overlapping phases do not report a run that spent less time than it did', () => {
  // Two engines, 40 ms each, running inside the same 45 ms window. Summing them says 80 ms was
  // attributed out of a 50 ms run, and the old subtraction reported -30 ms unattributed.
  const report = buildTimingReport({
    busyMs: 45,
    phases: [
      { name: 'run:tsc', durationMs: 40, count: 1 },
      { name: 'run:knip', durationMs: 40, count: 1 },
    ],
    startupMs: 10,
    insideMs: 50,
    diagnostics: [],
  })

  expect(report.unattributedMs).toBe(5)
  expect(report.busyMs).toBe(45)
})

test('sequential phases report the wall clock they occupied', () => {
  const report = buildTimingReport({
    busyMs: 50,
    phases: [
      { name: 'run:tsc', durationMs: 30, count: 1 },
      { name: 'run:knip', durationMs: 20, count: 1 },
    ],
    startupMs: 10,
    insideMs: 55,
    diagnostics: [],
  })

  expect(report.unattributedMs).toBe(5)
  expect(report.busyMs).toBe(50)
})

test('unionMs counts overlap once', () => {
  expect(unionMs([])).toBe(0)
  expect(unionMs([{ start: 0, end: 10 }])).toBe(10)
  expect(unionMs([{ start: 0, end: 10 }, { start: 20, end: 30 }])).toBe(20)
  expect(unionMs([{ start: 0, end: 10 }, { start: 5, end: 15 }])).toBe(15)
  expect(unionMs([{ start: 0, end: 30 }, { start: 5, end: 10 }])).toBe(30)
})
