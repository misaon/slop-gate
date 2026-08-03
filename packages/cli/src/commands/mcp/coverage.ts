import type { CheckResult } from '@misaon/slop-gate-core'
import { isCoverageGap } from '@misaon/slop-gate-reporters'

/**
 * Why a run did not see everything it was configured to see. One entry per cause, mirroring the order and the
 * vocabulary of the `agent` reporter's own incompleteness block so the prose and the structure of a single
 * `check` result cannot tell different stories.
 */
export type CoverageGap = {
  readonly kind: 'engine-failed' | 'engine-unavailable' | 'baseline-accepted'
  /** Absent for `baseline-accepted`, which is a property of the run rather than of any one engine. */
  readonly engine?: string
  readonly detail: string
  /** What the caller can do about it, when there is anything. Absent means there is nothing to run. */
  readonly remedy?: string
  /** Concepts this gap left unchecked or handed to a lower-ranked rule. Empty for an engine failure, which
   *  loses whatever it would have found without arbitration ever recording what that was. */
  readonly concepts: readonly string[]
}

/**
 * `clean` is reachable only from a run with no findings **and** no gaps — there is deliberately no value that
 * means "nothing found" on its own. The failure this tool surface exists to prevent is a caller reading a
 * `check` result as a pass when an engine was missing, and the cheapest way to prevent it is to make the
 * reassuring word unreachable in that state.
 */
export type CheckOutcome = 'clean' | 'findings' | 'incomplete' | 'incomplete-with-findings'

/**
 * `result.ruleset.uncovered` is deliberately **not** one of these, because it looks like an omission. The
 * `agent` reporter's `coverage:` line counts engine gaps and nothing else, printing `uncovered:` separately as
 * a notice, so driving `outcome` off `uncovered` too would put the structure and the prose of one result in
 * contradiction. It would also cry wolf: `uncovered` is "no *capable* candidate" and a registered-but-absent
 * engine is not capable, so every concept it owns lands there whether or not the repository contains a single
 * file of the language it applies to. The count is still surfaced beside these gaps, just not as one.
 */
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

  // `isCoverageGap`, not `unavailableEngines.length`. An absent engine that would have lost every contest
  // anyway cost this run nothing, and calling that incomplete would teach a caller to discount the word on the
  // run where it matters. Read from the reporter's own predicate rather than restated here.
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

  // A baseline is not a *coverage* gap in the literal sense — every engine ran and saw everything — and it is
  // one here anyway, because this type's job is not to classify causes but to make `clean` unreachable when the
  // result is not the whole truth. A run whose findings were all accepted returns an empty `diagnostics` array,
  // and that is exactly the state a caller must not read as a pass. `--require-engines` is unaffected:
  // `resolveExitCode` reads `unavailableEngines`, not `gaps`, so a baselined run does not become exit 3.
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
