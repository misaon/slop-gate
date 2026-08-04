import type { CheckEvent, Diagnostic, Severity } from '@misaon/slop-gate-core'
import type { Reporter, ReporterContext } from './index.ts'
import { PLATFORM_LIMITS, PLATFORM_SEVERITY, escapeCommandData, escapeCommandProperty } from './platform.ts'

/**
 * GitHub Actions workflow commands, which annotate the diff of a pull request directly.
 *
 * Strictly less capable than SARIF and strictly easier to adopt: no token, no `security-events: write`, no
 * upload step, one line of stdout per finding. Both ship because code-scanning upload needs a permission a
 * **fork pull request does not get** — and a contributor's first PR is exactly the run whose findings matter
 * most, so the format that works without permissions cannot be the one we skip.
 *
 * Emitted as it streams rather than collected at `done`: the annotations appear in the log next to the step
 * that produced them, and a run killed by a timeout still annotated everything it had found.
 */
export function createGithubReporter(context: ReporterContext): Reporter {
  const emitted: Record<Severity, number> = { error: 0, warn: 0, info: 0 }

  return {
    onEvent(event: CheckEvent) {
      if (event.type === 'diagnostic') {
        emitted[event.diagnostic.severity] += 1
        context.write(`${annotation(event.diagnostic)}\n`)
        return
      }

      if (event.type === 'engine-failed') {
        // An engine that crashed is not a finding about the code, and losing it among 10 annotations of the
        // same level would be the worst possible thing to drop. `::error` with no file attaches it to the run.
        context.write(`::error title=slop-gate::engine ${event.engine} failed: ${escapeCommandData(event.message)}\n`)
        return
      }

      if (event.type !== 'done') return
      for (const notice of truncationNotices(emitted)) context.write(`${notice}\n`)
    },
  }
}

/**
 * One workflow command. `title` carries the concept so the annotation names the rule rather than only its
 * message, which is what makes a wall of them scannable.
 *
 * A fileless diagnostic (§10, `Diagnostic.file` is `null`) is emitted with no `file` property at all rather
 * than a placeholder: GitHub then attaches it to the workflow file, which is wrong but visible, where a made-up
 * path would be a broken link.
 */
function annotation(diagnostic: Diagnostic): string {
  const properties = [
    `title=${escapeCommandProperty(diagnostic.concept)}`,
    ...(diagnostic.file === null
      ? []
      : [
          `file=${escapeCommandProperty(diagnostic.file)}`,
          `line=${diagnostic.position.startLine}`,
          `col=${diagnostic.position.startColumn}`,
          `endLine=${diagnostic.position.endLine}`,
          `endColumn=${diagnostic.position.endColumn}`,
        ]),
  ]

  return `::${PLATFORM_SEVERITY.github[diagnostic.severity]} ${properties.join(',')}::${escapeCommandData(diagnostic.message)}`
}

/**
 * Says what GitHub will hide, because GitHub will not.
 *
 * It renders 10 annotations per level per step and 50 per job, drops the rest, and shows nothing in the UI to
 * say it did — a limit documented in *Actions limits* rather than on the workflow-commands page. Without this,
 * a step reporting 400 errors and a step reporting 10 look identical in the diff, which turns the annotation
 * into a false all-clear. The notice is a `::notice` so it cannot itself consume an error or warning slot.
 */
function truncationNotices(emitted: Readonly<Record<Severity, number>>): readonly string[] {
  const cap = PLATFORM_LIMITS.githubAnnotationsPerLevel

  return (['error', 'warn', 'info'] as const)
    .filter((severity) => emitted[severity] > cap)
    .map((severity) => {
      const level = PLATFORM_SEVERITY.github[severity]
      return (
        `::notice title=slop-gate::${emitted[severity]} ${level} annotations were emitted and GitHub renders ` +
        `${cap} per step. Read the step log, or upload the SARIF report, for the rest.`
      )
    })
}
