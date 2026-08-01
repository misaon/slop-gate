import { CONCEPT_GROUPS, ruleRefKey, type RulesListEntry } from '@misaon/slop-gate-core'
import { displayWidth, padEndDisplay, truncateEnd } from '../display-width.ts'
import type { FrameKit } from '../frame.ts'
import { createFrameKit, plural } from '../frame.ts'
import type { RulesReporterContext } from './context.ts'
import { levelGlyph, LEVEL_COLUMN_WIDTH } from './shared.ts'

export const RULES_LIST_JSON_VERSION = 1

const CONCEPT_COLUMN_WIDTH = 40

/**
 * The base cascade's last-touching layer, or `'override'` when only an override ever mentions it —
 * a one-word version of `RulesListEntry.enablement`'s full trail, which `sgate rules why` shows in
 * full. Every entry here is enabled by construction (`buildRulesList` only includes
 * `anyEnabledConcepts` members), so the `'?'` fallback is unreachable in practice; kept only so this
 * function is total rather than trusting that invariant silently.
 */
function enablementTag(entry: RulesListEntry): string {
  const last = entry.enablement.baseProvenance.at(-1)
  if (last === undefined) return entry.enablement.overrides.length > 0 ? 'override' : '?'
  if (last.layer === 'preset') return 'preset'
  if (last.layer === 'root-config') return 'root-config'
  return 'workspace-config'
}

function ownerText(entry: RulesListEntry, paint: FrameKit['paint']): string {
  if (entry.servicedBySlopGate) return 'emitted by slop-gate itself'
  if (entry.uncovered) return paint('yellow', 'uncovered — no capable engine in this repo')
  // The common case in practice, not a rare corner: verified running this against the real CLI,
  // `recommended`'s 271 enabled concepts include well over a hundred JSX/Vue/framework-scoped ones
  // this repository's own TypeScript file set never exercises. Rendering that as a bare "no owner"
  // reads as a bug; it is the documented, harmless distinction `ElectionResult.uncovered` itself
  // draws (see `RulesListEntry.languageMismatch`).
  if (entry.languageMismatch) return paint('dim', 'not applicable — no files here in a language this covers')
  // Unreachable given today's `electOwners` contract (owner null, not uncovered, not serviced and
  // not a language mismatch cannot occur together) — kept so this function still produces
  // *something* legible if that contract is ever loosened, rather than rendering `undefined`.
  if (entry.owner === null) return paint('dim', '(no elected owner)')
  return ruleRefKey(entry.owner)
}

export function renderRulesListPretty(entries: readonly RulesListEntry[], context: RulesReporterContext): void {
  const { paint, frameTop, frameRow, frameBottom, writeUnit, inner } = createFrameKit(context)

  {
    const left = `  ${context.unicode ? '◆' : '*'}  slop-gate rules list`
    const right = `v${context.version} `
    const gap = Math.max(1, inner - displayWidth(left) - displayWidth(right))
    writeUnit([frameTop(), frameRow(paint('bold', left) + ' '.repeat(gap) + right), frameBottom()])
  }

  if (entries.length === 0) {
    writeUnit([`  ${paint('dim', 'No enabled concepts.')}`])
  } else {
    const byGroup = new Map<string, RulesListEntry[]>()
    for (const entry of entries) {
      const forGroup = byGroup.get(entry.group) ?? []
      forGroup.push(entry)
      byGroup.set(entry.group, forGroup)
    }
    // `CONCEPT_GROUPS` order first (the taxonomy's own order), then any group it does not list —
    // there should never be one, since every concept's group is validated against it
    // (concepts/validate.ts), but a listing must still show a row it does not recognise rather than
    // silently drop it.
    const orderedGroups = [
      ...CONCEPT_GROUPS.filter((group) => byGroup.has(group)),
      ...[...byGroup.keys()].filter((group) => !(CONCEPT_GROUPS as readonly string[]).includes(group)),
    ]

    for (const group of orderedGroups) {
      const rows = byGroup.get(group)!
      const lines = [paint('bold', `  ${group} (${rows.length})`)]
      for (const entry of rows) {
        const glyph = levelGlyph(entry.level, context, paint)
        const level = padEndDisplay(entry.level, LEVEL_COLUMN_WIDTH)
        const concept = padEndDisplay(truncateEnd(entry.concept, CONCEPT_COLUMN_WIDTH), CONCEPT_COLUMN_WIDTH)
        const owner = ownerText(entry, paint)
        const overlap = entry.suppressedCount > 0 ? paint('dim', ` · ${plural(entry.suppressedCount, 'overlap')}`) : ''
        const tag = paint('dim', `[${enablementTag(entry)}]`)
        lines.push(`    ${glyph}  ${level}  ${concept}  ${owner}${overlap}  ${tag}`)
      }
      writeUnit(lines)
    }
  }

  const uncoveredCount = entries.filter((entry) => entry.uncovered).length
  const languageMismatchCount = entries.filter((entry) => entry.languageMismatch).length
  const overlapCount = entries.reduce((sum, entry) => sum + entry.suppressedCount, 0)

  const footer = [`  ${plural(entries.length, 'enabled concept')}`]
  if (overlapCount > 0) {
    footer.push(`  ${paint('dim', `${plural(overlapCount, 'rule overlap')} — see \`sgate rules conflicts\` for detail.`)}`)
  }
  if (uncoveredCount > 0) {
    footer.push(
      `  ${paint('yellow', `${plural(uncoveredCount, 'enabled concept')} ${uncoveredCount === 1 ? 'has' : 'have'} no capable engine in this repo.`)}`,
    )
  }
  if (languageMismatchCount > 0) {
    footer.push(
      `  ${paint('dim', `${plural(languageMismatchCount, 'enabled concept')} ${languageMismatchCount === 1 ? 'is' : 'are'} not applicable — no matching-language files here.`)}`,
    )
  }
  writeUnit([frameTop(), ...footer.map((line) => frameRow(line)), frameBottom()])
}

export function renderRulesListJson(entries: readonly RulesListEntry[], context: RulesReporterContext): void {
  context.write(`${JSON.stringify({ version: RULES_LIST_JSON_VERSION, entries }, null, 2)}\n`)
}
