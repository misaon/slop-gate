import { arch, availableParallelism, loadavg, platform } from 'node:os'
import type { Measurement } from './measure.ts'

/**
 * A percentage against a baseline is only a measurement on an idle machine. Measured here: at load 2.0 of
 * 4 cores an unchanged tool reported +8.1% on startup and +8.2% on warm, both past the 5% KPI, with the
 * sample spread up from 12% to 34%. A gate whose first act is a false alarm is a gate people learn to
 * skip, so the harness says the machine is unfit rather than saying the tool got slower.
 */
const MAX_LOAD_PER_CORE = 0.25

/**
 * The one- and five-minute averages, not just the first. A machine that has only just finished a test run
 * reads 0.96 over one minute and 1.30 over five, passes a one-minute check, and then measures 4–5% high
 * across every scenario — which is a baseline that fails against itself.
 */
export function loadIsAcceptable(): { readonly ok: boolean; readonly load: number; readonly limit: number } {
  const limit = availableParallelism() * MAX_LOAD_PER_CORE
  const [oneMinute = 0, fiveMinute = 0] = loadavg()
  const load = Math.max(oneMinute, fiveMinute)
  return { ok: load <= limit, load, limit }
}

export type ScenarioName = 'startup' | 'warm' | 'cold'

export type Ceilings = { readonly wallMs: number; readonly peakRssMb: number }

/**
 * Absolute limits, alongside the percentage comparison. A budget that is only relative lets a tool get
 * arbitrarily slow in steps that each pass, and the ceiling is the statement that will not happen.
 */
export const CEILINGS: Readonly<Record<ScenarioName, Ceilings>> = {
  startup: { wallMs: 200, peakRssMb: 100 },
  warm: { wallMs: 500, peakRssMb: 130 },
  cold: { wallMs: 2900, peakRssMb: 340 },
}

export const TOLERANCE_PERCENT = 5

export type Machine = {
  readonly platform: string
  readonly arch: string
  readonly cores: number
  readonly node: string
}

export function machine(): Machine {
  return { platform: platform(), arch: arch(), cores: availableParallelism(), node: process.version }
}

export type Baseline = {
  readonly machine: Machine
  readonly recordedAt: string
  readonly scenarios: Readonly<Record<ScenarioName, Pick<Measurement, 'wallMs' | 'cpuMs' | 'peakRssMb'>>>
}

export type Verdict = {
  readonly scenario: ScenarioName
  readonly metric: 'wallMs' | 'peakRssMb'
  readonly measured: number
  readonly limit: number
  readonly kind: 'ceiling' | 'regression'
}

const changePercent = (measured: number, baseline: number): number => ((measured - baseline) / baseline) * 100

export function sameMachine(a: Machine, b: Machine): boolean {
  return a.platform === b.platform && a.arch === b.arch && a.cores === b.cores
}

/**
 * Ceilings always; the percentage comparison only against a baseline taken on the same hardware. A
 * baseline recorded on a four-core arm64 board says nothing about a CI runner, and comparing the two
 * would report a regression on every run until someone stopped believing the gate.
 */
export function judge(
  measured: Readonly<Record<ScenarioName, Pick<Measurement, 'wallMs' | 'cpuMs' | 'peakRssMb'>>>,
  baseline: Baseline | null,
): readonly Verdict[] {
  const failures: Verdict[] = []
  const comparable = baseline !== null && sameMachine(baseline.machine, machine())

  for (const scenario of Object.keys(CEILINGS) as ScenarioName[]) {
    const here = measured[scenario]
    const ceiling = CEILINGS[scenario]

    if (here.wallMs > ceiling.wallMs) {
      failures.push({ scenario, metric: 'wallMs', measured: here.wallMs, limit: ceiling.wallMs, kind: 'ceiling' })
    }
    if (here.peakRssMb > ceiling.peakRssMb) {
      failures.push({ scenario, metric: 'peakRssMb', measured: here.peakRssMb, limit: ceiling.peakRssMb, kind: 'ceiling' })
    }
    if (!comparable) continue

    const was = baseline.scenarios[scenario]
    for (const metric of ['wallMs', 'peakRssMb'] as const) {
      if (changePercent(here[metric], was[metric]) <= TOLERANCE_PERCENT) continue
      failures.push({
        scenario,
        metric,
        measured: here[metric],
        limit: was[metric] * (1 + TOLERANCE_PERCENT / 100),
        kind: 'regression',
      })
    }
  }

  return failures
}
