import type { Severity } from '@misaon/slop-gate-core'

export const EXIT_CODES = {
  clean: 0,
  findings: 1,
  config: 2,
  engine: 3,
  frozenRules: 4,
} as const

export type ExitCodeInput = {
  counts: Record<Severity, number>
  engineFailures: readonly unknown[]
  maxWarnings?: number
}

export function resolveExitCode(input: ExitCodeInput): number {
  if (input.engineFailures.length > 0) return EXIT_CODES.engine
  if (input.counts.error > 0) return EXIT_CODES.findings
  if (input.maxWarnings !== undefined && input.counts.warn > input.maxWarnings) return EXIT_CODES.findings
  return EXIT_CODES.clean
}
