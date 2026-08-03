import type { RawDiagnostic } from '@misaon/slop-gate-core'
import { FOREIGN_SUPPRESSION_RULE_ID } from './rules.ts'

/**
 * `biome-ignore`, plus the three related directives Biome 2.x accepts — `biome-ignore-all` for a whole
 * file and `biome-ignore-start`/`-end` for a span. Each is reported separately: a `-start` without its
 * `-end` suppresses more than the author meant, and both halves being visible is what shows that.
 */
const DIRECTIVE = /biome-ignore(?:-all|-start|-end)?/g

/** The rule selector a directive names, e.g. `lint/suspicious/noDuplicateProperties`. */
const SELECTOR = /^(?:-all|-start|-end)?\s+([\w/]+)/

const encoder = new TextEncoder()

/**
 * Finds suppression comments written for Biome rather than for slop-gate.
 *
 * **Why the adapter does this instead of asking Biome.** A `biome-ignore` removes a finding from the
 * JSON report with **no trace of any kind** — the diagnostic is simply absent, `summary.errors` stays 0,
 * there is no counter for suppressed diagnostics and no flag to disable them (verified against 2.5.6) —
 * so a stylesheet carrying one is indistinguishable from a clean one. That matters more here than in
 * general because D2 has `sgate init` replace the repository's own Biome configuration: a comment
 * orphaned by **our own migration** goes on silencing findings slop-gate now owns, invisibly and
 * indefinitely.
 *
 * Deliberately a substring scan. It cannot miss a real directive, which is the only error that would
 * matter, and its worst failure — naming a `biome-ignore` inside a string or a commented-out block —
 * still tells the reader this file carries a suppression we did not write.
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
