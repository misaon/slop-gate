import type { CheckEvent, Diagnostic } from '@misaon/slop-gate-core'
import type { Reporter, ReporterContext } from './index.ts'
import { PLATFORM_SEVERITY } from './platform.ts'

/**
 * GitLab Code Quality, which a merge request renders as inline findings on the diff.
 *
 * Same projection as SARIF into a different envelope: a flat JSON array, one object per finding, with GitLab's
 * own field names. Declared in `.gitlab-ci.yml` as
 * `artifacts: { reports: { codequality: gl-code-quality-report.json } }`.
 *
 * **`fingerprint` is load-bearing here in a way it is not in SARIF.** GitLab diffs the report against the target
 * branch's and shows only what is new, keyed on this field alone — so a fingerprint that changed between two
 * identical runs would report every finding as newly introduced, and one that collided between two findings
 * would hide the second. Ours (§10.1) is a hash of the rule, the concept and the *text* of the line, with the
 * occurrence index for repeats within one file, which is exactly the identity that behaviour needs.
 */
export function createGitlabReporter(context: ReporterContext): Reporter {
  return {
    onEvent(event: CheckEvent) {
      if (event.type !== 'done') return
      context.write(`${JSON.stringify(event.result.diagnostics.map(toCodeQualityViolation), null, 2)}\n`)
    },
  }
}

export function toCodeQualityViolation(diagnostic: Diagnostic): unknown {
  return {
    description: diagnostic.message,
    // The concept, not `ruleRefKey`: GitLab groups and filters on `check_name`, and a concept is stable across
    // the finding changing owner after arbitration (§5.1) where `oxlint/no-debugger` is not.
    check_name: diagnostic.concept,
    fingerprint: diagnostic.fingerprint,
    severity: PLATFORM_SEVERITY.gitlab[diagnostic.severity],
    location: {
      // GitLab requires a path and rejects a `./` prefix, and `Diagnostic.file` is already repo-relative POSIX.
      // A fileless orchestrator-level finding (§10) has no honest path, so it is anchored on the config file the
      // run loaded — the thing such a finding is actually about — rather than on an invented one.
      path: diagnostic.file ?? 'slop-gate.config.ts',
      lines: { begin: diagnostic.file === null ? 1 : diagnostic.position.startLine },
    },
  }
}
