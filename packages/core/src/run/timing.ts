import type { Diagnostic } from '../diagnostics/types.ts'
import { compareStrings } from '../ordering.ts'

export type MeasuredPhase = {
  name: string
  durationMs: number
  count: number
}

type RuleFindings = { ruleRefKey: string; findings: number }

export type TimingReport = {
  startupMs: number
  phases: readonly MeasuredPhase[]
  unattributedMs: number
  /**
   * Wall clock with at least one phase in flight. Engines run concurrently, so the phases overlap
   * and their durations sum above this — `startupMs + busyMs + unattributedMs` is the run, the sum
   * of the phases is not.
   */
  busyMs: number
  rules: readonly RuleFindings[]
}

export type Timing = {
  phase<T>(name: string, fn: () => Promise<T>): Promise<T>
  wrap<T>(name: string, fn: () => T): T
  measured(): readonly MeasuredPhase[]
  /** Wall clock with at least one phase in flight. Below the sum of phases once engines overlap. */
  busyMs(): number
  readonly enabled: boolean
}

export const NO_TIMING: Timing = {
  phase: (_name, fn) => fn(),
  wrap: (_name, fn) => fn(),
  measured: () => [],
  busyMs: () => 0,
  enabled: false,
}

export function createTiming(): Timing {
  const totals = new Map<string, { durationMs: number; count: number }>()
  const intervals: Array<{ start: number; end: number }> = []
  let sequence = 0

  const record = (name: string, startMark: string): void => {
    const measure = performance.measure(name, startMark)
    const entry = totals.get(name) ?? { durationMs: 0, count: 0 }
    entry.durationMs += measure.duration
    entry.count += 1
    totals.set(name, entry)
    intervals.push({ start: measure.startTime, end: measure.startTime + measure.duration })
    performance.clearMarks(startMark)
    performance.clearMeasures(name)
  }

  return {
    enabled: true,
    async phase(name, fn) {
      const startMark = `${name}#${(sequence += 1)}`
      performance.mark(startMark)
      try {
        return await fn()
      } finally {
        record(name, startMark)
      }
    },
    wrap(name, fn) {
      const startMark = `${name}#${(sequence += 1)}`
      performance.mark(startMark)
      try {
        return fn()
      } finally {
        record(name, startMark)
      }
    },
    measured() {
      return [...totals].map(([name, entry]) => ({ name, durationMs: entry.durationMs, count: entry.count }))
    },
    busyMs() {
      return unionMs(intervals)
    },
  }
}

/** Total length of the union of the intervals — overlap counted once. */
export function unionMs(intervals: readonly { start: number; end: number }[]): number {
  if (intervals.length === 0) return 0
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  let total = 0
  let { start, end } = sorted[0]!
  for (const interval of sorted.slice(1)) {
    if (interval.start > end) {
      total += end - start
      start = interval.start
      end = interval.end
    } else if (interval.end > end) {
      end = interval.end
    }
  }
  return total + (end - start)
}

export type TimingReportInput = {
  phases: readonly MeasuredPhase[]
  startupMs: number
  insideMs: number
  busyMs: number
  diagnostics: readonly Diagnostic[]
}

const round1 = (ms: number): number => Math.round(ms * 10) / 10

export function buildTimingReport(input: TimingReportInput): TimingReport {
  const measured = [...input.phases].sort((a, b) => b.durationMs - a.durationMs || compareStrings(a.name, b.name))
  const attributed = measured.reduce((sum, phase) => sum + phase.durationMs, 0)
  // Engines run concurrently, so the phases overlap and their sum exceeds the run. What is left
  // unaccounted for is the wall clock with nothing in flight, not the wall clock minus the sum —
  // that subtraction goes negative and reports a run that spent less time than it did.
  const busy = Math.min(input.busyMs === 0 ? attributed : input.busyMs, input.insideMs)

  const findings = new Map<string, number>()
  for (const diagnostic of input.diagnostics) findings.set(diagnostic.ruleRefKey, (findings.get(diagnostic.ruleRefKey) ?? 0) + 1)

  return {
    startupMs: round1(input.startupMs),
    phases: measured.map((phase) => ({ name: phase.name, durationMs: round1(phase.durationMs), count: phase.count })),
    unattributedMs: round1(Math.max(0, input.insideMs - busy)),
    busyMs: round1(busy),
    rules: [...findings]
      .map(([ruleRefKey, count]) => ({ ruleRefKey, findings: count }))
      .sort((a, b) => b.findings - a.findings || compareStrings(a.ruleRefKey, b.ruleRefKey)),
  }
}
