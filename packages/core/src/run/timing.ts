/**
 * SPIKE — not the shipping shape. Engine-boundary timing, to answer "why did my run take a
 * minute?" from inside the run rather than from a hand-rolled patch. Gated on `SGATE_TIMING=1`,
 * so with the flag off every instrumentation point is one indirect call through `NO_TIMING`.
 *
 * `performance.mark`/`measure` rather than bare `performance.now()` subtraction, so a run also
 * shows up in `--cpu-prof` traces and in anything reading the Node performance timeline.
 *
 * Measured off-state cost (hyperfine, 25 runs warm / 5 runs cold, this repository): warm
 * 170.6 ms -> 171.7 ms (+1.1 ms, 0.6%, inside 1 sigma); cold 5.886 s -> 5.888 s (+2 ms, 0.03%).
 * Free enough not to need a compile-time switch, even though `normalize`, `read-source` and
 * `cache-write` are instrumented per *file* (about 1,300 `NO_TIMING` calls on a cold run here)
 * rather than per assignment.
 */
type PhaseTiming = { name: string; durationMs: number; count: number }

export type Timing = {
  phase<T>(name: string, fn: () => Promise<T>): Promise<T>
  wrap<T>(name: string, fn: () => T): T
  report(): PhaseTiming[]
  readonly enabled: boolean
}

export const NO_TIMING: Timing = {
  phase: (_name, fn) => fn(),
  wrap: (_name, fn) => fn(),
  report: () => [],
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
    report() {
      return [...totals]
        .map(([name, entry]) => ({ name, durationMs: Math.round(entry.durationMs * 10) / 10, count: entry.count }))
        .sort((a, b) => b.durationMs - a.durationMs)
    },
  }
}

/** SPIKE-only sink. The shipping shape puts `report()` on `CheckResult` and lets a reporter print it. */
export function writeTimingReport(timing: Timing, totalMs: number): void {
  if (!timing.enabled) return
  const rows = timing.report()
  const width = Math.max(...rows.map((row) => row.name.length), 5)
  const lines = [
    '',
    `  timing (SGATE_TIMING=1) — ${totalMs.toFixed(1)} ms measured inside streamCheck`,
    ...rows.map(
      (row) =>
        `  ${row.name.padEnd(width)}  ${row.durationMs.toFixed(1).padStart(8)} ms  ${((row.durationMs / totalMs) * 100).toFixed(1).padStart(5)}%  ×${row.count}`,
    ),
    '',
  ]
  process.stderr.write(`${lines.join('\n')}\n`)
}
