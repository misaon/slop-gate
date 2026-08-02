import type { RawDiagnostic } from '@misaon/slop-gate-core'
import { FOREIGN_SUPPRESSION_RULE_ID } from './rules.ts'

/**
 * `biome-ignore`, plus the three related directives Biome 2.x accepts — `biome-ignore-all` for a
 * whole file and `biome-ignore-start`/`-end` for a span. One pattern covers all four because they
 * share a prefix, and each is reported separately: a `-start` without its `-end` suppresses more
 * than the author meant, and both halves being visible is what lets a reader see that.
 */
const DIRECTIVE = /biome-ignore(?:-all|-start|-end)?/g

/** The rule selector a directive names, e.g. `lint/suspicious/noDuplicateProperties`. */
const SELECTOR = /^(?:-all|-start|-end)?\s+([\w/]+)/

const encoder = new TextEncoder()

/**
 * Finds suppression comments written for Biome rather than for slop-gate, and reports each one.
 *
 * **Why the adapter does this instead of asking Biome.** A `biome-ignore` comment removes a finding
 * from the JSON report with **no trace of any kind**: the diagnostic is simply absent,
 * `summary.errors` stays 0, there is no counter for suppressed diagnostics and no flag to disable
 * them. Verified directly against 2.5.6. So a stylesheet carrying one is indistinguishable, in
 * everything Biome tells us, from a clean stylesheet.
 *
 * That is the same class of failure as an engine that is not installed reading as a clean run, and
 * this codebase's answer to that class is always the same: state the gap out loud. It is worse here
 * than in general, because D2 has `sgate init` replace the repository's own Biome configuration —
 * so a comment orphaned by **our own migration** goes on silencing findings that slop-gate now owns,
 * invisibly and indefinitely.
 *
 * Deliberately a substring scan rather than anything cleverer. It runs over bytes the caller has
 * already read for the byte-offset conversion, so it costs nothing; it cannot miss a real directive,
 * which is the only error that would matter; and its worst failure is naming a `biome-ignore` inside
 * a string or a commented-out block, which is a note saying "this file carries a suppression we did
 * not write" — still true, and still worth a reader's attention.
 */
export function findForeignSuppressions(file: string, source: string): RawDiagnostic[] {
  const results: RawDiagnostic[] = []
  for (const match of source.matchAll(DIRECTIVE)) {
    const start = encoder.encode(source.slice(0, match.index)).length
    const selector = SELECTOR.exec(source.slice(match.index + 'biome-ignore'.length))?.[1]
    results.push({
      engineRuleId: FOREIGN_SUPPRESSION_RULE_ID,
      message:
        `This stylesheet carries a \`${match[0]}\` comment${selector === undefined ? '' : ` for \`${selector}\``}. ` +
        'It silences the underlying engine with nothing in its output to say so, so slop-gate cannot ' +
        'tell a finding it hid from a finding that never existed. Replace it with ' +
        'a `sgate-disable`-family directive with a reason, which slop-gate can see, attribute, and ' +
        'report as unused once it stops matching.',
      severity: 'warning',
      file,
      range: { start, end: start + encoder.encode(match[0]).length },
    })
  }
  return results
}
