import { ruleRefKey, type RuleOverlap, type RulesConflicts } from '@misaon/slop-gate-core'
import { displayWidth } from '../display-width.ts'
import { createFrameKit, plural } from '../box.ts'
import type { RulesReporterContext } from './context.ts'

export const RULES_CONFLICTS_JSON_VERSION = 2

function deadOverrideText(key: string): string {
  return `\`${key}\` does not name a known concept or a rule any engine provides.`
}

export function renderRulesConflictsPretty(conflicts: RulesConflicts, context: RulesReporterContext): void {
  const { paint, frameTop, frameRow, frameBottom, writeUnit, inner } = createFrameKit(context)

  {
    const left = `  ${context.unicode ? '◆' : '*'}  slop-gate rules conflicts`
    const right = `v${context.version} `
    const gap = Math.max(1, inner - displayWidth(left) - displayWidth(right))
    writeUnit([frameTop(), frameRow(paint('bold', left) + ' '.repeat(gap) + right), frameBottom()])
  }

  if (conflicts.overlaps.length === 0 && conflicts.deadOverrides.length === 0) {
    writeUnit([`  ${paint('green', 'No rule overlaps or dead overrides in this run.')}`])
  }

  if (conflicts.overlaps.length > 0) {
    const byConcept = new Map<string, RuleOverlap[]>()
    for (const record of conflicts.overlaps) {
      const forConcept = byConcept.get(record.concept) ?? []
      forConcept.push(record)
      byConcept.set(record.concept, forConcept)
    }

    const lines = [paint('bold', `  Rule overlaps (${conflicts.overlaps.length})`)]
    for (const [concept, records] of byConcept) {
      lines.push(`    ${paint('bold', concept)}`)
      lines.push(`      winner: ${ruleRefKey(records[0]!.winner)}`)
      for (const record of records) {
        lines.push(`      loser:  ${ruleRefKey(record.loser)} (${record.reason})`)
      }
    }
    writeUnit(lines)
  }

  if (conflicts.deadOverrides.length > 0) {
    const lines = [paint('bold', `  Dead overrides (${conflicts.deadOverrides.length})`)]
    for (const key of conflicts.deadOverrides) lines.push(`    ${key} — ${deadOverrideText(key)}`)
    writeUnit(lines)
  }

  const footer = [`  ${plural(conflicts.overlaps.length, 'rule overlap')} · ${plural(conflicts.deadOverrides.length, 'dead override')}`]
  writeUnit([frameTop(), ...footer.map((line) => frameRow(line)), frameBottom()])
}

export function renderRulesConflictsJson(conflicts: RulesConflicts, context: RulesReporterContext): void {
  context.write(`${JSON.stringify({ version: RULES_CONFLICTS_JSON_VERSION, ...conflicts }, null, 2)}\n`)
}
