import type { ByteRange, FixKind, Severity } from '../diagnostics/types.ts'

export type FixTier = FixKind

export const FIX_TIER_RANK: Readonly<Record<FixKind, number>> = { safe: 0, suggested: 1, unsafe: 2 }

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
  | 'overlap'
  | 'out-of-range'

export type DroppedEdit = {
  readonly edit: CandidateEdit
  readonly reason: DropReason
  readonly winner?: CandidateEdit
}

export type ArbitrationResult = {
  readonly applied: readonly CandidateEdit[]
  readonly dropped: readonly DroppedEdit[]
}
