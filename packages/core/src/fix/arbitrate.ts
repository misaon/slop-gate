import type { ByteRange, Severity } from '../diagnostics/types.ts'
import { compareStrings } from '../ordering.ts'
import type { ArbitrationResult, CandidateEdit, DroppedEdit } from './types.ts'

const SEVERITY_STRENGTH: Readonly<Record<Severity, number>> = { error: 2, warn: 1, info: 0 }

export function rangesConflict(a: ByteRange, b: ByteRange): boolean {
  if (a.start < b.end && b.start < a.end) return true
  return a.start === b.start && (a.start === a.end || b.start === b.end)
}

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
