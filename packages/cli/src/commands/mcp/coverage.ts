import type { CheckResult } from '@misaon/slop-gate-core'
import { isCoverageGap } from '@misaon/slop-gate-reporters'

export type CoverageGap = {
  readonly kind: 'engine-failed' | 'engine-unavailable' | 'baseline-accepted'
  readonly engine?: string
  readonly detail: string
  readonly remedy?: string
  readonly concepts: readonly string[]
}

export type CheckOutcome = 'clean' | 'findings' | 'incomplete' | 'incomplete-with-findings'

export function coverageGaps(result: CheckResult): CoverageGap[] {
  const gaps: CoverageGap[] = []

  for (const failure of result.engineFailures) {
    gaps.push({
      kind: 'engine-failed',
      engine: failure.engine,
      detail: `engine \`${failure.engine}\` failed — ${failure.message}. Nothing it would have reported appears in this result.`,
      concepts: [],
    })
  }

  for (const engine of result.unavailableEngines.filter(isCoverageGap)) {
    gaps.push({
      kind: 'engine-unavailable',
      engine: engine.engine,
      detail:
        `engine \`${engine.engine}\` is registered but not installed here — ${engine.reason}. ` +
        'Nothing it would have reported appears in this result; do not read an empty findings list as clean.',
      ...(engine.install === undefined ? {} : { remedy: engine.install }),
      concepts: engine.displaced.map((record) => record.concept),
    })
  }

  const baseline = result.baseline
  if (baseline !== null && baseline.accepted > 0) {
    gaps.push({
      kind: 'baseline-accepted',
      detail:
        `a baseline accepted ${baseline.accepted} finding${baseline.accepted === 1 ? '' : 's'} — ${baseline.path}. ` +
        'They are real findings, absent from this result; do not read an empty findings list as clean.',
      remedy: 'sgate check --no-baseline',
      concepts: baseline.acceptedByConcept.map((group) => group.concept),
    })
  }

  return gaps
}

export function checkOutcome(result: CheckResult, gaps: readonly CoverageGap[]): CheckOutcome {
  const found = result.diagnostics.length > 0
  if (gaps.length > 0) return found ? 'incomplete-with-findings' : 'incomplete'
  return found ? 'findings' : 'clean'
}
