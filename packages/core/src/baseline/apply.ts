import type { Diagnostic, Severity } from '../diagnostics/types.ts'
import { compareStrings } from '../ordering.ts'
import type { BaselineFile, BaselineSummary } from './types.ts'

export type BaselineMatcher = {
  /**
   * `true` when the baseline holds this finding, which the caller reads as "do not report it and do not count
   * it". Records the match, so `summarise()` can tell an entry that was used from one that was not.
   */
  accepts: (diagnostic: Diagnostic) => boolean
  summarise: () => BaselineSummary
}

/**
 * Matching is on the fingerprint and nothing else. The fingerprint already carries the concept and the path
 * (spec §10.1), so re-checking either here would be redundant; re-checking the *position* would put back the
 * line-sensitivity that §10.1 excludes on purpose, and is the one thing this must not do. Consequences someone
 * will hit: an unrelated edit above a finding keeps it accepted — window and occurrence index both unchanged,
 * which is the property that makes a baseline usable at all; editing the accepted line itself un-accepts it,
 * deliberately, because touching a line you agreed to carry is the moment to decide whether to fix it; a rename
 * un-accepts every finding in the file, which `sgate baseline update` re-keys in one command; and a copy-paste
 * is a new finding, because a second copy is second debt.
 *
 * **The alternative to keying on the path — a second, path-free key — was rejected**: it would make two
 * identical findings in two files interchangeable, so accepting one would silently accept the other, and a
 * baseline must never accept a finding nobody looked at.
 *
 * **`EngineCapabilities.deterministic` was declined, and a baseline being its would-be reader is not enough to
 * add it.** §10.2 leaves a baseline exactly one thing it could do with such a flag — warn that these entries
 * may drift — and an engine-level boolean is the wrong granularity: instability is per *rule*, and actionlint
 * is stable for every rule but `actionlint/action`, so the flag would warn about the twelve other workflow
 * concepts it owns in order to warn about one, the crying-wolf failure `isCoverageGap` exists to avoid. It
 * would also be false on every default run, because §10.2 keeps the measured-unstable rule out of
 * `recommended`. Drift shows up as **stale entries** instead, per run, counted and named by concept.
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
