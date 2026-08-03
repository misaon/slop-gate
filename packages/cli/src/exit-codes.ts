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
  /**
   * Registered engines whose tooling is absent (`CheckResult.unavailableEngines`). Never affects the exit code on
   * its own: an optional engine missing from a laptop must still leave a useful run.
   */
  unavailableEngines?: readonly unknown[]
  /**
   * `--require-engines`. Fails on *any* absent engine, not only one that cost this run coverage: the flag asserts
   * a property of the machine, and a CI job whose image lacks hadolint should learn it on the run that installs
   * the image, not months later on the pull request that adds the first Dockerfile.
   */
  requireEngines?: boolean
  maxWarnings?: number
}

export function resolveExitCode(input: ExitCodeInput): number {
  if (input.engineFailures.length > 0) return EXIT_CODES.engine
  // Ahead of findings for the same reason a failure is: a run missing an engine it was told to have did not answer
  // the question that was asked, so its finding count is not the verdict.
  if (input.requireEngines === true && (input.unavailableEngines?.length ?? 0) > 0) return EXIT_CODES.engine
  if (input.counts.error > 0) return EXIT_CODES.findings
  if (input.maxWarnings !== undefined && input.counts.warn > input.maxWarnings) return EXIT_CODES.findings
  return EXIT_CODES.clean
}
