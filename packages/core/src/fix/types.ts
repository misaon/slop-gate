import type { ByteRange, FixKind, Severity } from '../diagnostics/types.ts'

/**
 * The tier a `sgate fix` run is willing to apply (spec §11, D7). Deliberately the same union as `FixKind`
 * rather than a second vocabulary keyed to `--suggest`/`--unsafe`: a tier is "the highest `FixKind` this run
 * accepts", so one type expresses both sides of the comparison and no mapping table can drift.
 */
export type FixTier = FixKind

/** Higher accepts everything lower. `FIX_TIER_RANK[edit.kind] <= FIX_TIER_RANK[tier]` is the gate. */
export const FIX_TIER_RANK: Readonly<Record<FixKind, number>> = { safe: 0, suggested: 1, unsafe: 2 }

/**
 * Spec §11 step 1's `(range, replacement, kind, ruleRefKey)` tuple, plus what step 2's tiebreak needs
 * (`priority` from the registry, `severity` from the resolved level) and the `concept` the oscillation
 * diagnostic reports against. `range` is **byte offsets** into the file's UTF-8 bytes, matching
 * `Diagnostic.range` (spec §10) while `replacement` is text — `applyEdits` reconciles the two units, which
 * is why a fix is never applied by slicing a JavaScript string.
 */
export type CandidateEdit = {
  readonly file: string
  readonly range: ByteRange
  readonly replacement: string
  readonly kind: FixKind
  readonly ruleRefKey: string
  readonly concept: string
  readonly priority: number
  readonly severity: Severity
}

type DropReason =
  /** Lost spec §11 step 2's overlap tiebreak. Re-run next pass. */
  | 'overlap'
  /** `range` does not lie within the buffer. Never clamped — clamping is how a file gets corrupted. */
  | 'out-of-range'

export type DroppedEdit = {
  readonly edit: CandidateEdit
  readonly reason: DropReason
  /** The edit that beat it, for `'overlap'`. Absent for `'out-of-range'`, which has no winner. */
  readonly winner?: CandidateEdit
}

export type ArbitrationResult = {
  /** Non-overlapping, sorted by start offset ascending — the order spec §11 step 2 calls for. */
  readonly applied: readonly CandidateEdit[]
  readonly dropped: readonly DroppedEdit[]
}
