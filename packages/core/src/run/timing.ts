import type { Diagnostic } from '../diagnostics/types.ts'
import { compareStrings } from '../ordering.ts'

/**
 * Where a run's time went — the measurement half of `--timing` (spec §12.4, §15). Core measures and puts
 * the report on `CheckResult`; the reporters decide whether and how to print it. Nothing here writes to
 * a stream, and nothing here reads an environment variable: a run is instrumented because the caller
 * asked (`CheckOptions.timing`), which is the only thing a `--timing` flag can honestly mean.
 *
 * `performance.mark`/`measure` rather than bare `performance.now()` subtraction, so an instrumented run
 * also shows up in `--cpu-prof` traces and in anything else reading the Node performance timeline.
 *
 * **Off, this costs one indirect call through `NO_TIMING` per span** — and there are 3,307 of them on a
 * cold run of this repository, because `read-source`, `normalize` and `cache-write` are measured per
 * *file* rather than per assignment. Measured, not assumed: `packages/core` built twice from one tree,
 * once with all 22 wrapper call sites removed, swapping only its `dist` between hyperfine benchmarks in
 * a single invocation. Warm, both orders: absent 156.8 ms ± 1.8 / 156.4 ms ± 1.7, present-and-off
 * 155.3 ms ± 2.0 / 157.1 ms ± 3.5. Cold: absent 6.123 s ± 0.080, present-and-off 6.101 s ± 0.107.
 *
 * The instrumented build was *faster* on minima in both warm rounds, which is the only honest reading:
 * the cost is below this machine's run-to-run drift and no percentage can be claimed for it. Free enough
 * not to need a compile-time switch; see spec §12.4 for the table.
 */
export type MeasuredPhase = {
  /**
   * `discover`, `run:oxlint`, `normalize:tsc` — the phase, with the engine it belongs to where one
   * does. Engine-suffixed names are what makes the report "per engine" in the sense §12.4 promises.
   */
  name: string
  durationMs: number
  /** How many spans were summed: 1 for a whole-run phase, once per file for the per-file ones. */
  count: number
}

/**
 * Findings attributed to one registry rule.
 *
 * **A count, not a duration, and that is the whole point.** Spec §12 and §15 originally promised a
 * `--timing` breakdown "per engine and rule"; per engine is measurable and is above, per rule is not.
 * An engine here is an external process — we hand `tsc` a program and `oxlint` a file list and read
 * what comes back — and neither reports how long any one of its own rules took, so any per-rule
 * millisecond figure slop-gate printed would be invented. The count is what the boundary genuinely
 * knows, and the time our own share of a rule's cost lands in is the `normalize:<engine>` and
 * `arbitrate` phases above. See §12.4 for the amended promise.
 */
export type RuleFindings = { ruleRefKey: string; findings: number }

/**
 * **`startupMs + Σ phases + unattributedMs === stats.durationMs`**, to within the 0.1 ms each is
 * rounded to. That identity is the whole design: `durationMs` measures from process start (see
 * `CheckOptions.startedAt`), so a breakdown that reported only what happened inside `streamCheck`
 * would leave a user subtracting to find the rest of their own run.
 *
 * Three fields rather than one array of named rows, because two of the three are not phases and a
 * reporter would otherwise have to recognise them by their names to treat them differently — which it
 * must, since they are the two it has to explain.
 */
export type TimingReport = {
  /**
   * Everything before `streamCheck` was entered. On a one-shot CLI process that is node boot, the ESM
   * module graph and `loadCliConfig`, and **core cannot split it further because core was not running
   * for any of it** — all it can see is the gap between `CheckOptions.startedAt` and its own first
   * statement. `0` for a long-lived host, which has no process start to charge to this run.
   */
  startupMs: number
  /**
   * Each measured phase, longest first. The inventory walk is `discover`; rule-registry arbitration is
   * `arbitrate`; an engine's own subprocess time is `run:<engine>`; our own work on what it returned is
   * `normalize:<engine>`.
   */
  phases: readonly MeasuredPhase[]
  /**
   * `streamCheck`'s own span minus its phases. Two things live in here and both are real: the
   * orchestrator's own glue (planning, the cache-hit tallies, the filters between a diagnostic and the
   * stream), and **the consumer's time between yields** — `streamCheck` is an async generator, so while
   * `pretty` renders a code frame the run is suspended inside a `yield` and the clock is still running.
   *
   * A negative value would mean two phases overlapped and one was counted twice; it is left unclamped
   * so that reads as the instrumentation bug it is rather than as a plausible zero.
   */
  unattributedMs: number
  /** Descending by count, then by `ruleRefKey`. See `RuleFindings` for why this is not a duration. */
  rules: readonly RuleFindings[]
}

export type Timing = {
  phase<T>(name: string, fn: () => Promise<T>): Promise<T>
  wrap<T>(name: string, fn: () => T): T
  /** One row per distinct phase name, in first-entered order. Empty for `NO_TIMING`. */
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

  // In a `finally`, so a phase whose work threw is still measured: an engine that fails after 30
  // seconds is exactly the run someone reaches for `--timing` to explain, and dropping its span would
  // move that time into `unattributed` where it names nothing.
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
  /** `Timing.measured()`, unrounded. */
  phases: readonly MeasuredPhase[]
  /** `streamCheck`'s first statement minus `CheckOptions.startedAt`; `0` when the caller passed none. */
  startupMs: number
  /** `streamCheck`'s own span, from its first statement to the `done` event. */
  insideMs: number
  /** The run's visible findings, for the per-rule counts. */
  diagnostics: readonly Diagnostic[]
}

/** Tenths of a millisecond: finer than the measurement is repeatable to, coarse enough to read. */
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
