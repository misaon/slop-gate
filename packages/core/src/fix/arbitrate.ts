import type { ByteRange, Severity } from '../diagnostics/types.ts'
import { compareStrings } from '../ordering.ts'
import type { ArbitrationResult, CandidateEdit, DroppedEdit } from './types.ts'

const SEVERITY_STRENGTH: Readonly<Record<Severity, number>> = { error: 2, warn: 1, info: 0 }

/**
 * Whether two edits may not both be applied to the same buffer.
 *
 * Half-open intervals, so **exactly adjacent ranges do not conflict** — `[4,10)` and `[10,14)`
 * describe neighbouring spans of text, and dropping one of them would throw away a perfectly
 * applicable fix on every `}` followed by a `)`.
 *
 * The second clause is the case the interval formula gets wrong. A zero-width range is an
 * *insertion point*, and `s < e` is false for it, so `[5,5)` reads as conflicting with nothing at
 * all — including another insertion at `[5,5)`. Two insertions at one offset have no defined order
 * between them (whichever is spliced second lands first), and an insertion sharing its offset with a
 * replacement that starts there is the same ambiguity with an extra way to be surprising. Both are
 * called conflicts so one is dropped and re-run next pass against a buffer where the question no
 * longer arises, rather than resolved by whichever way the sort happened to fall.
 */
export function rangesConflict(a: ByteRange, b: ByteRange): boolean {
  if (a.start < b.end && b.start < a.end) return true
  return a.start === b.start && (a.start === a.end || b.start === b.end)
}

/**
 * Total precedence order over conflicting edits (spec §11 step 2: "the higher-priority edit wins —
 * priority comes from the registry, then severity, then rule id"). Negative when `a` beats `b`.
 *
 * The three fields the spec names do not by themselves make the order *total*: every entry in the
 * shipped registry carries `priority: 50` (the generator emits a fixed value — see
 * `scripts/generate-registry.ts`), so in practice one rule reporting two overlapping findings falls
 * all the way through to a tie. The range and replacement are appended so it cannot: a tie there
 * would make the winner depend on input order, and `arbitrateEdits` would stop being a function of
 * its input set.
 */
function compareEditPrecedence(a: CandidateEdit, b: CandidateEdit): number {
  return (
    b.priority - a.priority ||
    SEVERITY_STRENGTH[b.severity] - SEVERITY_STRENGTH[a.severity] ||
    compareStrings(a.ruleId, b.ruleId) ||
    a.range.start - b.range.start ||
    a.range.end - b.range.end ||
    compareStrings(a.replacement, b.replacement)
  )
}

/**
 * Spec §11 step 2, for one file: reduce every gathered edit to a non-overlapping set, dropping the
 * losers so their rules can re-run next pass.
 *
 * Implemented as a greedy accept in **precedence** order rather than the sort-by-offset-then-compare
 * the spec's wording suggests, because that wording under-specifies a case it does not mention: with
 * three edits where A overlaps B and B overlaps C but A and C are disjoint, a left-to-right walk has
 * to decide whether beating B entitles A to also displace C, and either answer makes the outcome
 * depend on which end the walk started from. Accepting in precedence order and rejecting anything
 * that conflicts with an already-accepted edit gives the same answer for any input ordering, which
 * is the property that matters: `applied` is sorted by start offset on the way out, so the caller
 * still receives exactly what step 2 promises.
 *
 * `bufferLength` is the length of the file in **bytes**. An edit outside it is dropped as
 * `'out-of-range'` and — deliberately — is not allowed to block anything: a stale or malformed range
 * from an engine must not be able to suppress a valid fix by "winning" a conflict it should never
 * have been in. It is never clamped into range; a clamped edit is a rewrite of text nobody chose.
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
