import type { Diagnostic, Severity } from '../diagnostics/types.ts'
import { compareStrings } from '../ordering.ts'
import type { BaselineFile, BaselineSummary } from './types.ts'

export type BaselineMatcher = {
  accepts: (diagnostic: Diagnostic) => boolean
  summarise: () => BaselineSummary
}

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
      stale: input.file.accepted.filter((entry) => !matched.has(entry.fingerprint)),
    }),
  }
}
