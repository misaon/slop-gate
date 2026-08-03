import type { ByteRange, Severity } from '../diagnostics/types.ts'
import { compareStrings } from '../ordering.ts'
import type { ArbitrationResult, CandidateEdit, DroppedEdit } from './types.ts'

const SEVERITY_STRENGTH: Readonly<Record<Severity, number>> = { error: 2, warn: 1, info: 0 }

/**
 * Half-open intervals, so **exactly adjacent ranges do not conflict** — `[4,10)` and `[10,14)` describe
 * neighbouring spans, and dropping one would throw away a perfectly applicable fix on every `}` followed
 * by a `)`.
 *
 * The second clause is the case the interval formula gets wrong. A zero-width range is an *insertion
 * point*, and `s < e` is false for it, so `[5,5)` reads as conflicting with nothing — including another
 * insertion at `[5,5)`. Two insertions at one offset have no defined order (whichever is spliced second
 * lands first), so both cases are called conflicts and one is dropped to re-run next pass against a buffer
 * where the question no longer arises, rather than resolved by whichever way the sort fell.
 */
export function rangesConflict(a: ByteRange, b: ByteRange): boolean {
  if (a.start < b.end && b.start < a.end) return true
  return a.start === b.start && (a.start === a.end || b.start === b.end)
}

/**
 * Total precedence order over conflicting edits (spec §11 step 2: "the higher-priority edit wins —
 * priority comes from the registry, then severity, then rule id"). Negative when `a` beats `b`.
 *
 * Those three fields are not by themselves *total*: every entry in the shipped registry carries
 * `priority: 50` (see `scripts/generate-registry.ts`), so one rule reporting two overlapping findings
 * falls all the way through to a tie. Range and replacement are appended so it cannot — a tie there would
 * make the winner depend on input order, and `arbitrateEdits` would stop being a function of its input set.
 */
function compareEditPrecedence(a: CandidateEdit, b: CandidateEdit): number {
  return (
    b.priority - a.priority ||
    SEVERITY_STRENGTH[b.severity] - SEVERITY_STRENGTH[a.severity] ||
    compareStrings(a.ruleRefKey, b.ruleRefKey) ||
    a.range.start - b.range.start ||
    a.range.end - b.range.end ||
    compareStrings(a.replacement, b.replacement)
  )
}

/**
 * Spec §11 step 2, for one file: reduce every gathered edit to a non-overlapping set, dropping the
 * losers so their rules can re-run next pass.
 *
 * A greedy accept in **precedence** order, not the sort-by-offset-then-compare the spec's wording suggests,
 * because that wording under-specifies a case: with A overlapping B and B overlapping C but A and C
 * disjoint, a left-to-right walk must decide whether beating B entitles A to displace C too, and either
 * answer makes the outcome depend on which end the walk started from. Precedence order gives the same
 * answer for any input ordering; `applied` is sorted by start offset on the way out, so the caller still
 * receives exactly what step 2 promises.
 *
 * `bufferLength` is in **bytes**. An out-of-range edit is dropped before arbitration and deliberately not
 * allowed to block anything — a stale range must not suppress a valid fix by "winning" a conflict it should
 * never have been in — and it is never clamped: a clamped edit rewrites text nobody chose.
 */
export function arbitrateEdits(candidates: readonly CandidateEdit[], bufferLength: number): ArbitrationResult {
  const dropped: DroppedEdit[] = []
  const inRange: CandidateEdit[] = []

  for (const candidate of candidates) {
    const { start, end } = candidate.range
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > bufferLength) {
      dropped.push({ edit: candidate, reason: 'out-of-range' })
      continue
    }
    inRange.push(candidate)
  }

  const applied: CandidateEdit[] = []
  for (const candidate of [...inRange].sort(compareEditPrecedence)) {
    const winner = applied.find((accepted) => rangesConflict(accepted.range, candidate.range))
    if (winner === undefined) applied.push(candidate)
    else dropped.push({ edit: candidate, reason: 'overlap', winner })
  }

  applied.sort((a, b) => a.range.start - b.range.start || a.range.end - b.range.end)
  return { applied, dropped }
}
