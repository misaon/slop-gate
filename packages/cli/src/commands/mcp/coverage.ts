import type { CheckResult } from '@misaon/slop-gate-core'
import { isCoverageGap } from '@misaon/slop-gate-reporters'

/**
 * Why a run did not see everything it was configured to see. One entry per cause, mirroring the
 * order and the vocabulary of the `agent` reporter's own incompleteness block so the prose and the
 * structure of a single `check` result cannot tell different stories.
 */
export type CoverageGap = {
  readonly kind: 'engine-failed' | 'engine-unavailable'
  readonly engine?: string
  readonly detail: string
  /** What the caller can do about it, when there is anything. Absent means there is nothing to run. */
  readonly remedy?: string
  /** Concepts this gap left unchecked or handed to a lower-ranked rule. Empty for an engine failure,
   *  which loses whatever it would have found without arbitration ever recording what that was. */
  readonly concepts: readonly string[]
}

/**
 * `clean` is reachable only from a run with no findings **and** no gaps.
 *
 * There is deliberately no value that means "nothing found" on its own. The failure this tool
 * surface exists to prevent is a caller reading a `check` result as a pass when an engine was
 * missing, and the cheapest way to prevent it is to make the reassuring word unreachable in that
 * state: a partial run is `incomplete` or `incomplete-with-findings`, and both lead with the
 * correction in the first token a reader sees.
 */
export type CheckOutcome = 'clean' | 'findings' | 'incomplete' | 'incomplete-with-findings'

/**
 * `result.ruleset.uncovered` is deliberately **not** one of these, and the reason is worth stating
 * because it looks like an omission.
 *
 * The `agent` reporter's `coverage:` line — the sentence the whole honesty design is arranged around
 * — counts engine gaps and nothing else, while printing `uncovered:` separately as a notice. Driving
 * `outcome` off `uncovered` too would put the structure and the prose of one result in
 * contradiction, which is worse than either rule on its own.
 *
 * It would also cry wolf. `uncovered` is "no *capable* candidate", and an engine that is registered
 * but not installed is not capable — so every concept an absent optional engine owns lands there
 * whether or not the repository contains a single file of the language it applies to. On a fixture
 * with no workflows and no actionlint, that is thirteen concepts none of which had anything to
 * check, and `unavailableEngines` already reports that engine correctly as having cost the run
 * nothing. The count is still surfaced beside these gaps, just not as one.
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

  // `isCoverageGap`, not `unavailableEngines.length`. An absent engine that would have lost every
  // contest anyway cost this run nothing, and calling that incomplete would teach a caller to
  // discount the word on the run where it matters — the reporter's argument, read from the
  // reporter's own predicate rather than restated here.
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

  return gaps
}

export function checkOutcome(result: CheckResult, gaps: readonly CoverageGap[]): CheckOutcome {
  const found = result.diagnostics.length > 0
  if (gaps.length > 0) return found ? 'incomplete-with-findings' : 'incomplete'
  return found ? 'findings' : 'clean'
}
