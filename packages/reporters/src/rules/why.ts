import {
  conceptById,
  ruleRefKey,
  splitRuleSetting,
  wasEnabledBeforeBeingDisabled,
  type ConceptEnablement,
  type ConceptWhy,
  type IneligibleCandidate,
  type ProvenanceLayer,
  type RuleSetting,
} from '@misaon/slop-gate-core'
import { displayWidth } from '../display-width.ts'
import { createFrameKit, plural } from '../frame.ts'
import type { RulesReporterContext } from './context.ts'
import { indexCandidates, levelGlyph, tierOf } from './shared.ts'

export const RULES_WHY_JSON_VERSION = 1

const LAYER_LABEL: Readonly<Record<ProvenanceLayer, string>> = {
  preset: 'preset',
  'root-config': 'root config',
  'workspace-config': 'workspace config',
  override: 'override',
}

function settingText(setting: RuleSetting): string {
  const { level, options } = splitRuleSetting(setting)
  return Object.keys(options).length > 0 ? `${level} ${JSON.stringify(options)}` : level
}

/** One sentence answering "is this enabled, and by what" — the first of the six answers `sgate
 *  rules why` can give (see the module doc comment on `explainConcept`). */
function enablementSummary(enablement: ConceptEnablement): string {
  if (enablement.enabled) {
    const step = enablement.baseProvenance.at(-1)
    if (step !== undefined) return `enabled at \`${enablement.level}\` by ${LAYER_LABEL[step.layer]} \`${step.source}\``
    const override = enablement.overrides.at(-1)
    return override === undefined
      ? `enabled at \`${enablement.level}\``
      : `enabled at \`${enablement.level}\`, only by override \`${override.source}\``
  }
  if (wasEnabledBeforeBeingDisabled(enablement.baseProvenance)) {
    const enabledStep = enablement.baseProvenance.find((step) => splitRuleSetting(step.setting).level !== 'off')!
    const disabledStep = enablement.baseProvenance.at(-1)!
    return (
      `${LAYER_LABEL[enabledStep.layer]} \`${enabledStep.source}\` enabled this at \`${splitRuleSetting(enabledStep.setting).level}\`, ` +
      `but ${LAYER_LABEL[disabledStep.layer]} \`${disabledStep.source}\` turned it off`
    )
  }
  return 'no preset or config layer ever enables this concept'
}

function provenanceLines(enablement: ConceptEnablement): string[] {
  const lines: string[] = []
  for (const step of enablement.baseProvenance) {
    lines.push(`      ${LAYER_LABEL[step.layer].padEnd(17)} ${step.source} -> ${settingText(step.setting)}`)
  }
  for (const override of enablement.overrides) {
    lines.push(`      ${'override'.padEnd(17)} ${override.source} -> ${settingText(override.setting)}`)
  }
  return lines
}

/**
 * Why a candidate that never contested this concept was rejected — the reasons `why` can explain
 * because `electOwners` now records them (`ElectionResult.ineligible`), plus one presentational
 * addition: a `'missing-capability'` naming `types` gets the M2 blocker cited, since that specific
 * gap has a known, documented cause rather than being an open question.
 */
function ineligibilityText(record: IneligibleCandidate): string {
  switch (record.reason) {
    case 'deprecated':
      return 'deprecated'
    case 'engine-not-participating':
      return `no \`${record.candidate.engine}\` engine is registered in this run`
    case 'missing-capability':
      return record.capability === 'types'
        ? 'requires type information (`types`), which no participating engine provides yet — ' +
            'type-aware support is not wired up (see "Blocks M2" in docs/superpowers/specs/2026-07-31-m0-followups.md)'
        : `requires capability \`${record.capability}\`, which no participating engine provides`
    case 'language-mismatch':
      return 'this repository has no files in a language this rule applies to'
    case 'pinned-to-other-engine':
      return '`owners` pins this concept to a different engine, which offers no rule for it'
  }
}

/**
 * The one-line bottom-line `why`'s closing frame always carries — the thing a reader who skipped
 * straight to the bottom still needs: does this concept produce findings right now, and through
 * what. Every other section explains *why* the verdict is what it is; this is the verdict itself.
 */
function verdict(explanation: ConceptWhy): string {
  if (explanation.servicedBySlopGate) return 'Emitted by slop-gate itself, not by any engine rule.'
  if (!explanation.enablement.enabled) return 'Produces no findings: not enabled by any layer.'
  if (explanation.owner !== undefined) return `Produces findings via \`${ruleRefKey(explanation.owner)}\`.`
  return 'Produces no findings: enabled, but no capable engine owns it in this run.'
}

export function renderRulesWhyPretty(explanation: ConceptWhy, context: RulesReporterContext): void {
  const { paint, frameTop, frameRow, frameBottom, writeUnit, inner } = createFrameKit(context)

  {
    const left = `  ${context.unicode ? '◆' : '*'}  slop-gate rules why`
    const right = `v${context.version} `
    const gap = Math.max(1, inner - displayWidth(left) - displayWidth(right))
    writeUnit([frameTop(), frameRow(paint('bold', left) + ' '.repeat(gap) + right), frameBottom()])
  }

  if (!explanation.isKnownConcept) {
    writeUnit([
      `  ${paint('bold', explanation.concept)}`,
      `  ${paint('red', 'Not a recognised concept id.')} Run \`sgate rules list\` to see what is available.`,
    ])
    return
  }

  const definition = conceptById(explanation.concept as never)
  writeUnit([`  ${paint('bold', explanation.concept)}`, `  ${paint('dim', definition.title)}`])

  if (explanation.servicedBySlopGate) {
    writeUnit([
      `  ${paint('dim', 'Emitted directly by slop-gate itself — no engine rule ever claims this concept, so arbitration')}`,
      `  ${paint('dim', 'never runs for it.')}`,
    ])
  }

  {
    const lines = [`  Enabled: ${explanation.enablement.enabled ? paint('green', 'yes') : paint('yellow', 'no')} — ${enablementSummary(explanation.enablement)}`]
    lines.push(...provenanceLines(explanation.enablement))
    if (explanation.pinnedOwner !== undefined) lines.push(`  Pinned owner: \`${explanation.pinnedOwner}\` (via \`owners\` in config)`)
    writeUnit(lines)
  }

  if (!explanation.servicedBySlopGate && !explanation.enablement.enabled) {
    const lines =
      explanation.candidates.length === 0
        ? [`  ${paint('dim', 'No registry entry declares this concept at all — enabling it would still find no owner.')}`]
        : [
            `  ${paint('dim', `${plural(explanation.candidates.length, 'registry entry')} could serve this concept once it is enabled:`)}`,
            ...explanation.candidates.map((candidate) => `    ${ruleRefKey(candidate)}`),
          ]
    writeUnit(lines)
  }

  if (!explanation.servicedBySlopGate && explanation.enablement.enabled) {
    const candidateIndex = indexCandidates(explanation.candidates)

    if (explanation.owner !== undefined) {
      const tier = tierOf(candidateIndex, explanation.owner)
      const glyph = levelGlyph(explanation.enablement.level as never, context, paint)
      writeUnit([`  ${glyph}  Owner: ${paint('bold', ruleRefKey(explanation.owner))}${tier === undefined ? '' : ` (tier ${tier})`}`])
    } else if (explanation.uncovered) {
      writeUnit([`  ${paint('yellow', 'Uncovered')} — no capable engine in this run owns this concept.`])
    }

    if (explanation.suppressed.length > 0) {
      const lines = [`  ${paint('bold', 'Suppressed candidates')} (lost arbitration to the owner above)`]
      for (const record of explanation.suppressed) {
        const tier = tierOf(candidateIndex, record.suppressed)
        lines.push(`    ${ruleRefKey(record.suppressed)}${tier === undefined ? '' : ` (tier ${tier})`} — ${record.reason}`)
      }
      writeUnit(lines)
    }

    if (explanation.ineligible.length > 0) {
      const lines = [`  ${paint('bold', 'Other candidates that never contested this concept')}`]
      for (const record of explanation.ineligible) {
        lines.push(`    ${ruleRefKey(record.candidate)} — ${ineligibilityText(record)}`)
      }
      writeUnit(lines)
    }
  }

  writeUnit([frameTop(), frameRow(`  ${verdict(explanation)}`), frameBottom()])
}

export function renderRulesWhyJson(explanation: ConceptWhy, context: RulesReporterContext): void {
  context.write(`${JSON.stringify({ version: RULES_WHY_JSON_VERSION, ...explanation }, null, 2)}\n`)
}
