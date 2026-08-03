import { LEVEL_TO_SEVERITY, ruleRefKey, type RuleEntry, type RuleLevel, type RuleRef } from '@misaon/slop-gate-core'
import type { FrameKit } from '../box.ts'
import { SEVERITY_GLYPH, SEVERITY_GLYPH_ASCII, SEVERITY_STYLE } from '../severity.ts'
import type { RulesReporterContext } from './context.ts'

/** The longest severity word (`error`) — every level column pads to this so level text lines up. */
export const LEVEL_COLUMN_WIDTH = 5

/** A level's glyph, painted in its severity colour — the same vocabulary `check`'s pretty reporter
 *  uses for a finding's severity, reused here for a concept's configured *level*. */
export function levelGlyph(level: Exclude<RuleLevel, 'off'>, context: RulesReporterContext, paint: FrameKit['paint']): string {
  const glyph = context.unicode ? SEVERITY_GLYPH : SEVERITY_GLYPH_ASCII
  const severity = LEVEL_TO_SEVERITY[level]
  return paint(SEVERITY_STYLE[severity], glyph[severity])
}

/** Builds a `candidate ruleRefKey -> RuleEntry` index once per render, so a renderer can look up a
 *  candidate's tier or docs URL by the `RuleRef` election/ineligibility records carry. */
export function indexCandidates(candidates: readonly RuleEntry[]): ReadonlyMap<string, RuleEntry> {
  return new Map(candidates.map((entry) => [ruleRefKey(entry), entry]))
}

export function tierOf(index: ReadonlyMap<string, RuleEntry>, ref: RuleRef): number | undefined {
  return index.get(ruleRefKey(ref))?.tier
}
