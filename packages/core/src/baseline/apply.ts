import type { Diagnostic, Severity } from '../diagnostics/types.ts'
import { compareStrings } from '../ordering.ts'
import type { BaselineFile, BaselineSummary } from './types.ts'

export type BaselineMatcher = {
  /**
   * `true` when the baseline holds this finding, which the caller reads as "do not report it and do
   * not count it". Records the match, so `summarise()` can tell an entry that was used from one that
   * was not.
   */
  accepts: (diagnostic: Diagnostic) => boolean
  summarise: () => BaselineSummary
}

/**
 * Matching is on the fingerprint and nothing else.
 *
 * The fingerprint already carries the concept and the path (spec §10.1), so re-checking either here
 * would be redundant; re-checking the *position* would put back the line-sensitivity that §10.1
 * excludes on purpose, and is the one thing this must not do. What follows from that, stated because
 * each is a real consequence someone will hit:
 *
 * - **An unrelated edit above a finding keeps it accepted.** Its window and its occurrence among
 *   identical windows are both unchanged, so the fingerprint is. This is the property that makes a
 *   baseline usable at all.
 * - **Editing the accepted line itself un-accepts it.** The window changed, so it is a new finding and
 *   the old entry goes stale. Deliberate: touching a line you agreed to carry is the moment to decide
 *   whether to fix it, and the report says which entry it was.
 * - **A rename un-accepts every finding in the file.** The path is in the fingerprint. `sgate baseline
 *   update` re-keys them in one command, and its output says how many moved. The alternative — a
 *   second, path-free key — was rejected: it would make two identical findings in two files
 *   interchangeable, so accepting one would silently accept the other, and a baseline must never
 *   accept a finding nobody looked at.
 * - **A copy-paste is a new finding.** Same window, next occurrence index, different fingerprint.
 *   Correct: a second copy is second debt.
 *
 * **`EngineCapabilities.deterministic` was declined, and a baseline being its would-be reader is not
 * enough to add it.** §10.2 leaves a baseline exactly one thing it could do with such a flag — warn
 * that these entries may drift — and an engine-level boolean is the wrong granularity to do it with.
 * Instability is per *rule*: actionlint is stable for every rule but `actionlint/action`, so the flag
 * would warn about the twelve other workflow concepts it owns in order to warn about one, which is the
 * crying-wolf failure `isCoverageGap` exists to avoid. It would also fire when there is nothing to warn
 * about, because §10.2 keeps the measured-unstable rule out of `recommended` — so on the default path
 * the flag is false on every run while no unstable rule is elected.
 *
 * What this does instead is better than a warning and needs no new type: drift shows up as **stale
 * entries**, per run, counted and named by concept. §10.2 is right to refuse *detecting* instability at
 * run time; a baseline does not detect it, it records it afterwards, which is strictly more
 * informative than a static "may drift". The stale line is deliberately not hedged for this case —
 * qualifying every run's "these are fixed" against a rule the user had to enable by hand, past its own
 * recorded measurement, would weaken the message everywhere it is true.
 */
export function createBaselineMatcher(input: { path: string; file: BaselineFile }): BaselineMatcher {
  const byFingerprint = new Map(input.file.accepted.map((entry) => [entry.fingerprint, entry]))
  const matched = new Set<string>()
  const bySeverity: Record<Severity, number> = { error: 0, warn: 0, info: 0 }
  const byConcept = new Map<string, number>()
  let accepted = 0

  return {
    accepts: (diagnostic) => {
      if (!byFingerprint.has(diagnostic.fingerprint)) return false
      matched.add(diagnostic.fingerprint)
      accepted += 1
      bySeverity[diagnostic.severity] += 1
      byConcept.set(diagnostic.concept, (byConcept.get(diagnostic.concept) ?? 0) + 1)
      return true
    },
    summarise: () => ({
      path: input.path,
      entries: input.file.accepted.length,
      accepted,
      acceptedBySeverity: { ...bySeverity },
      acceptedByConcept: [...byConcept]
        .map(([concept, count]) => ({ concept, count }))
        .sort((a, b) => b.count - a.count || compareStrings(a.concept, b.concept)),
      // The file's own order, which `serializeBaseline` already fixed — so two runs over one
      // repository report the same stale entries in the same order without sorting again here.
      stale: input.file.accepted.filter((entry) => !matched.has(entry.fingerprint)),
    }),
  }
}
