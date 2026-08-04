import type { Severity } from '../diagnostics/types.ts'

export const BASELINE_VERSION = 1

export type BaselineEntry = {
  readonly file: string | null
  readonly concept: string
  readonly fingerprint: string
}

export type BaselineFile = {
  readonly version: number
  readonly accepted: readonly BaselineEntry[]
}

export type BaselineSummary = {
  readonly path: string
  readonly entries: number
  readonly accepted: number
  readonly acceptedBySeverity: Readonly<Record<Severity, number>>
  readonly acceptedByConcept: readonly { readonly concept: string; readonly count: number }[]
  readonly stale: readonly BaselineEntry[]
}
