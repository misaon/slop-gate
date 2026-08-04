import type { Severity } from '@misaon/slop-gate-core'

/**
 * How a severity is named on each platform we report to.
 *
 * **One table, not one per reporter.** The mapping is the place a policy silently inverts: `warn` does not fail
 * a slop-gate run (`EXIT_CODES` — only errors, or warnings past an explicit `--max-warnings`, do), so a `warn`
 * arriving as a platform *error* turns every advisory finding into a red pull request and makes the level
 * distinction meaningless. Three reporters each doing their own conversion is three chances to get that wrong
 * and no single place to check it.
 *
 * GitLab's scale is the one that needs a decision rather than a lookup: it offers `info`, `minor`, `major`,
 * `critical` and `blocker`, and only three of those can be earned honestly. `major` for an error, `minor` for a
 * warning. `critical` and `blocker` are deliberately unused — nothing in a `Diagnostic` measures blast radius,
 * and claiming it from a lint category would be inventing severity we never established.
 */
export const PLATFORM_SEVERITY = {
  /** SARIF 2.1.0 `result.level`. The only accepted values are `error`, `warning` and `note`. */
  sarif: { error: 'error', warn: 'warning', info: 'note' },
  /** The GitHub Actions workflow command name: `::error`, `::warning`, `::notice`. */
  github: { error: 'error', warn: 'warning', info: 'notice' },
  /** GitLab Code Quality `severity`. */
  gitlab: { error: 'major', warn: 'minor', info: 'info' },
} as const satisfies Record<string, Readonly<Record<Severity, string>>>

/**
 * How many findings each platform will accept or display, and what it does with the rest.
 *
 * Both truncate, and **neither says that it did** — which is the failure §12.4 refuses for timings, arriving
 * from outside. GitHub renders 10 annotations per level per step and 50 per job, drops the rest with no
 * indication in the UI, and does not document the numbers on the workflow-commands page (they are in *Actions
 * limits*, and the community has complained about the silence for years). SARIF accepts 25,000 results per run
 * and displays the top 5,000 by severity.
 *
 * A reporter that hits one of these has to say so in the stream it *does* control, because a truncated report
 * is indistinguishable from a clean one to the reader looking at the platform.
 */
export const PLATFORM_LIMITS = {
  /** Per level, per step. 50 per job across all steps, which a single reporter cannot see or enforce. */
  githubAnnotationsPerLevel: 10,
  /** `runs[].results` length GitHub's code-scanning ingest accepts. */
  sarifResultsPerRun: 25_000,
} as const

/**
 * Escapes a workflow-command message body: `%`, CR and LF, in that order.
 *
 * `%` first, or the escapes introduced by the later replacements are escaped again. A raw newline would end the
 * command and leave the rest of the message on stdout as ordinary log text — which is how a multi-line
 * diagnostic silently loses everything after its first line.
 *
 * Mirrors `escapeData` in `actions/toolkit`'s `@actions/core`, which is the only normative description of this
 * encoding; the workflow-commands documentation does not cover it.
 */
export const escapeCommandData = (value: string): string =>
  value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')

/**
 * Escapes a workflow-command *property* value, which additionally cannot contain `:` or `,`.
 *
 * Those two are the command's own delimiters — `::error file=…,line=…::message` — so a title containing a colon
 * would truncate the property list and produce an annotation attached to the wrong place, or to nothing.
 * Mirrors `escapeProperty` in `actions/toolkit`.
 */
export const escapeCommandProperty = (value: string): string =>
  escapeCommandData(value).replaceAll(':', '%3A').replaceAll(',', '%2C')
