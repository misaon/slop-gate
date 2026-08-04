import type { RawDiagnostic } from '@misaon/slop-gate-core'
import { FOREIGN_SUPPRESSION_RULE_ID } from './rules.ts'

const DIRECTIVE = /biome-ignore(?:-all|-start|-end)?/g

const SELECTOR = /^(?:-all|-start|-end)?\s+([\w/]+)/

const encoder = new TextEncoder()

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
