import type { Severity } from '../diagnostics/types.ts'

/**
 * Bumped when a reader can no longer make sense of an older file. `sgate check` refuses a version it
 * does not know rather than guessing, because the failure mode of guessing is a baseline that quietly
 * accepts nothing and a build that fails on findings a team already agreed to carry.
 */
export const BASELINE_VERSION = 1

/**
 * One accepted finding. `fingerprint` is the whole of the identity (spec §10.1); `file` and `concept` are there so
 * the file can be reviewed in a diff — accepting 609 findings is a decision, and a list of 32-hex strings is not
 * something anyone can approve. `file` is `null` for an orchestrator-level finding with nothing to attribute,
 * exactly as on `Diagnostic`.
 *
 * Deliberately **no line number, no message and no severity.** All three would go stale without invalidating
 * anything — a line number the moment an unrelated line is added above (the churn §10.1 excludes line numbers to
 * avoid), a message the moment an engine rewords it — and a stale field in a committed file is worse than an
 * absent one, because a reader has no way to tell which it is.
 */
export type BaselineEntry = {
  readonly file: string | null
  readonly concept: string
  readonly fingerprint: string
}

export type BaselineFile = {
  readonly version: number
  readonly accepted: readonly BaselineEntry[]
}

/**
 * What a run has to say about its baseline, so no reporter can present a green run as a clean one. Required on
 * `CheckResult` for the reason `unavailableEngines` is (see there): the shape of the mistake is a caller
 * forgetting it. `null` means no baseline file was read — not "an empty one was".
 */
export type BaselineSummary = {
  /** Repo-relative POSIX path of the file that was read. */
  readonly path: string
  /** Entries in the file, whether or not they matched. */
  readonly entries: number
  /** Findings this run produced and the baseline accepted. They are **not** in `CheckResult.diagnostics` and not
   *  in `counts`, so they cannot fail the build — which is exactly why every reporter has to print this number. */
  readonly accepted: number
  readonly acceptedBySeverity: Readonly<Record<Severity, number>>
  /** Sorted by count descending, then concept, so two runs over one repository print one order. */
  readonly acceptedByConcept: readonly { readonly concept: string; readonly count: number }[]
  /**
   * Entries that matched nothing this run: the finding was fixed, or the file was renamed, or the accepted line
   * itself was edited. Reported rather than pruned — a shrinking baseline is the only evidence that adopting one
   * did not just make the debt permanent — and `sgate baseline update` is what removes them.
   */
  readonly stale: readonly BaselineEntry[]
}
