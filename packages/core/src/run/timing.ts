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
  rules: readonly RuleFindings[]
}

export type Timing = {
  phase<T>(name: string, fn: () => Promise<T>): Promise<T>
  wrap<T>(name: string, fn: () => T): T
  measured(): readonly MeasuredPhase[]
  readonly enabled: boolean
}

export const NO_TIMING: Timing = {
  phase: (_name, fn) => fn(),
  wrap: (_name, fn) => fn(),
  measured: () => [],
  enabled: false,
}

export function createTiming(): Timing {
  const totals = new Map<string, { durationMs: number; count: number }>()
  let sequence = 0

  const record = (name: string, startMark: string): void => {
    const measure = performance.measure(name, startMark)
    const entry = totals.get(name) ?? { durationMs: 0, count: 0 }
    entry.durationMs += measure.duration
    entry.count += 1
    totals.set(name, entry)
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
  }
}

export type TimingReportInput = {
  phases: readonly MeasuredPhase[]
  startupMs: number
  insideMs: number
  diagnostics: readonly Diagnostic[]
}

const round1 = (ms: number): number => Math.round(ms * 10) / 10

export function buildTimingReport(input: TimingReportInput): TimingReport {
  const measured = [...input.phases].sort((a, b) => b.durationMs - a.durationMs || compareStrings(a.name, b.name))
  const attributed = measured.reduce((sum, phase) => sum + phase.durationMs, 0)

  const findings = new Map<string, number>()
  for (const diagnostic of input.diagnostics) findings.set(diagnostic.ruleRefKey, (findings.get(diagnostic.ruleRefKey) ?? 0) + 1)

  return {
    startupMs: round1(input.startupMs),
    phases: measured.map((phase) => ({ name: phase.name, durationMs: round1(phase.durationMs), count: phase.count })),
    unattributedMs: round1(input.insideMs - attributed),
    rules: [...findings]
      .map(([ruleRefKey, count]) => ({ ruleRefKey, findings: count }))
      .sort((a, b) => b.findings - a.findings || compareStrings(a.ruleRefKey, b.ruleRefKey)),
  }
}
