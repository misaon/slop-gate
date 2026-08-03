import type { ByteRange, FixKind, Severity } from '../diagnostics/types.ts'

/**
 * The tier a `sgate fix` run is willing to apply (spec §11, D7). Deliberately the same union as
 * `FixKind` rather than a second vocabulary keyed to the CLI's own `--suggest`/`--unsafe` spelling:
 * a tier is "the highest `FixKind` this run accepts", so one type expresses both sides of that
 * comparison and no mapping table can drift.
 */
export type FixTier = FixKind

/** Higher accepts everything lower. `FIX_TIER_RANK[edit.kind] <= FIX_TIER_RANK[tier]` is the gate. */
export const FIX_TIER_RANK: Readonly<Record<FixKind, number>> = { safe: 0, suggested: 1, unsafe: 2 }

/**
 * One `(range, replacement, kind, ruleRefKey)` tuple as spec §11 step 1 defines it, plus the two fields
 * step 2's tiebreak needs (`priority` from the registry, `severity` from the resolved level) and the
 * `concept` the oscillation diagnostic reports against.
 *
 * `range` is **byte offsets** into the file's UTF-8 bytes, matching `Diagnostic.range` (spec §10);
 * `replacement` is text. `applyEdits` is the only thing that reconciles those two units, and it is
 * the reason a fix is never applied by slicing a JavaScript string.
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

export type DropReason =
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
