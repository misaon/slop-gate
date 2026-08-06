import {
  conceptById,
  ruleRefKey,
  splitRuleSetting,
  wasEnabledBeforeBeingDisabled,
  type ConceptEnablement,
  type ConceptId,
  type ConceptOwnership,
  type ConceptWhy,
  type FrameworkEvidence,
  type IneligibleCandidate,
  type OverrideMention,
  type ProvenanceLayer,
  type RuleLevel,
  type RuleSetting,
} from '@misaon/slop-gate-core'
import { displayWidth } from '../display-width.ts'
import { createFrameKit, plural } from '../box.ts'
import { wrapText } from '../wrap-text.ts'
import type { RulesReporterContext } from './context.ts'
import { indexCandidates, levelGlyph, tierOf } from './shared.ts'

export const RULES_WHY_JSON_VERSION = 2

const EVIDENCE_SHOWN = 4

const LAYER_LABEL: Readonly<Record<ProvenanceLayer, string>> = {
  preset: 'preset',
  framework: 'framework',
  'framework-override': 'path-scoped framework',
  'root-config': 'root config',
  'workspace-config': 'workspace config',
  override: 'override',
}

function evidenceText(evidence: FrameworkEvidence): string {
  switch (evidence.kind) {
    case 'manifest-dependency':
      return `\`${evidence.name}\` in ${evidence.file} (${evidence.field})`
    case 'path-present':
      return `${evidence.file} is present`
    case 'config-literal':
      return `\`${evidence.property}\` is \`${evidence.value}\` in ${evidence.file}`
  }
}

function firstFew(values: readonly string[], keep = 3): string {
  const shown = values.slice(0, keep).join(', ')
  return values.length <= keep ? shown : `${shown}, +${values.length - keep} more`
}

function sourceText(mention: OverrideMention): string {
  const scoped = /^(framework \S+) \((.*)\)$/.exec(mention.source)
  return scoped === null ? mention.source : `${scoped[1]} (${firstFew(scoped[2]!.split(', '))})`
}

function settingText(setting: RuleSetting): string {
  const { level, options } = splitRuleSetting(setting)
  if (options === undefined) return level
  return options.length === 0 ? `${level} (options cleared)` : `${level} ${JSON.stringify(options)}`
}

function optionsSummary(enablement: ConceptEnablement): string | undefined {
  if (enablement.options.length === 0) return undefined
  const from = enablement.optionsFrom
  const source = from === undefined ? '' : ` — from ${LAYER_LABEL[from.layer]} \`${from.source}\``
  return `Options: ${JSON.stringify(enablement.options)}${source}`
}

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
    lines.push(`      ${LAYER_LABEL[step.layer].padEnd(21)} ${step.source} -> ${settingText(step.setting)}`)
  }
  for (const override of enablement.overrides) {
    lines.push(`      ${LAYER_LABEL[override.layer].padEnd(21)} ${sourceText(override)} -> ${settingText(override.setting)}`)
  }
  return lines
}

function ineligibilityText(record: IneligibleCandidate): string {
  switch (record.reason) {
    case 'deprecated':
      return 'deprecated'
    case 'engine-not-participating':
      return `no \`${record.candidate.engine}\` engine is registered in this run`
    case 'engine-unavailable':
      return `\`${record.candidate.engine}\` is registered but not installed on this machine`
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

function isLanguageMismatch(explanation: ConceptWhy): boolean {
  return (
    explanation.ownership.length === 0 &&
    !explanation.uncovered &&
    !explanation.servicedBySlopGate &&
    explanation.ineligible.some((record) => record.reason === 'language-mismatch')
  )
}

function describeOwnership(ownership: readonly ConceptOwnership[]): string {
  if (ownership.length === 1) return `\`${ruleRefKey(ownership[0]!.owner)}\``
  return ownership
    .map(({ owner, languages }) => `\`${ruleRefKey(owner)}\` for ${languages.join(', ')}`)
    .join(' and ')
}

function verdict(explanation: ConceptWhy): string {
  if (explanation.servicedBySlopGate) return 'Emitted by slop-gate itself, not by any engine rule.'
  if (!explanation.enablement.enabled) {
    const framework = explanation.frameworks.filter((entry) => entry.setting === 'off').at(-1)
    return framework === undefined
      ? 'Produces no findings: not enabled by any layer.'
      : `Produces no findings: framework \`${framework.id}\` turned it off.`
  }
  if (explanation.ownership.length > 0) return `Produces findings via ${describeOwnership(explanation.ownership)}.`
  if (isLanguageMismatch(explanation)) {
    return 'Produces no findings: no matching-language files in this repository.'
  }
  return 'Produces no findings: enabled, but no capable engine owns it in this run.'
}

export function renderRulesWhyPretty(explanation: ConceptWhy, context: RulesReporterContext): void {
  const { paint, frameTop, frameRow, frameBottom, writeUnit, inner, width } = createFrameKit(context)

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

  const definition = conceptById(explanation.concept as ConceptId)
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
    const options = optionsSummary(explanation.enablement)
    if (options !== undefined) lines.push(`  ${options}`)
    if (explanation.pinnedOwner !== undefined) lines.push(`  Pinned owner: \`${explanation.pinnedOwner}\` (via \`owners\` in config)`)
    writeUnit(lines)
  }

  if (explanation.frameworks.length > 0) {
    const lines: string[] = []
    for (const framework of explanation.frameworks) {
      const verb = framework.setting === 'off' ? 'turns this off' : `asks for \`${framework.setting}\``
      const where =
        framework.paths === undefined ? '' : ` under ${firstFew(framework.paths.map((glob) => `\`${glob}\``))}`
      lines.push(`  ${paint('bold', 'Framework')}: ${framework.id} ${verb}${where} — ${framework.summary}`)
      for (const evidence of framework.evidence.slice(0, EVIDENCE_SHOWN)) {
        lines.push(`      detected via ${evidenceText(evidence)}`)
      }
      if (framework.evidence.length > EVIDENCE_SHOWN) {
        lines.push(`      ${paint('dim', `and ${framework.evidence.length - EVIDENCE_SHOWN} more detection sites`)}`)
      }
      for (const line of wrapText(framework.reason, Math.max(1, width - 6))) lines.push(`      ${line}`)
      if (framework.measured !== undefined) {
        const { findings, falsePositives, repository } = framework.measured
        lines.push(`      ${paint('dim', `measured on ${repository}: ${findings} findings, ${falsePositives} false`)}`)
      }
    }
    const overruled = explanation.frameworks.filter(
      (framework) => framework.paths === undefined && framework.setting !== explanation.enablement.level,
    )
    if (overruled.length > 0) {
      const settled = explanation.enablement.baseProvenance.at(-1)
      const by = settled === undefined ? 'your configuration' : `${LAYER_LABEL[settled.layer]} \`${settled.source}\``
      lines.push(
        `      ${paint('dim', `A profile is a default: ${by} set \`${explanation.enablement.level}\` and beats ${overruled.map((framework) => `\`${framework.id}\``).join(', ')}.`)}`,
      )
    }
    writeUnit(lines)
  }

  if (explanation.rejectedFrameworkAdditions.length > 0) {
    const lines = [`  ${paint('dim', 'Framework additions refused for want of a measurement')}`]
    for (const rejection of explanation.rejectedFrameworkAdditions) {
      const prefix = `    ${rejection.id} wanted \`${rejection.level}\` — `
      const [first, ...rest] = wrapText(rejection.refusal, Math.max(1, width - displayWidth(prefix)))
      lines.push(`${prefix}${first}`, ...rest.map((line) => `${' '.repeat(displayWidth(prefix))}${line}`))
    }
    writeUnit(lines)
  }

  if (explanation.inapplicableFrameworks.length > 0) {
    const lines = [`  ${paint('dim', 'Frameworks detected but not applied')}`]
    for (const framework of explanation.inapplicableFrameworks) {
      const prefix = `    ${framework.id} — `
      const [first, ...rest] = wrapText(framework.blocked, Math.max(1, width - displayWidth(prefix)))
      lines.push(`${prefix}${first}`, ...rest.map((line) => `${' '.repeat(displayWidth(prefix))}${line}`))
    }
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

    if (explanation.ownership.length > 0) {
      const glyph = levelGlyph(explanation.enablement.level as Exclude<RuleLevel, 'off'>, context, paint)
      const label = explanation.ownership.length === 1 ? 'Owner' : 'Owners'
      const lines = [`  ${glyph}  ${label}:`]
      for (const { owner, languages } of explanation.ownership) {
        const tier = tierOf(candidateIndex, owner)
        const scope = explanation.ownership.length === 1 ? '' : ` for ${languages.join(', ')}`
        lines.push(`      ${paint('bold', ruleRefKey(owner))}${tier === undefined ? '' : ` (tier ${tier})`}${scope}`)
      }
      for (const record of explanation.displaced) {
        lines.push(
          `      ${paint('dim', `${ruleRefKey(record.wouldOwn)} would own ${record.languages.join(', ')} — not installed`)}`,
        )
      }
      const single = explanation.ownership.length === 1 && explanation.displaced.length === 0
      writeUnit(single ? [`${lines[0]!} ${lines[1]!.trim()}`] : lines)
    } else if (explanation.uncovered) {
      writeUnit([`  ${paint('yellow', 'Uncovered')} — no capable engine in this run owns this concept.`])
    } else if (isLanguageMismatch(explanation)) {
      writeUnit([`  ${paint('dim', 'Not applicable')} — no files here in a language this concept covers. Not a coverage gap.`])
    }

    if (explanation.overlaps.length > 0) {
      const lines = [`  ${paint('bold', 'Lost arbitration to the owner above')}`]
      for (const record of explanation.overlaps) {
        const tier = tierOf(candidateIndex, record.loser)
        const scope = explanation.ownership.length > 1 ? ` on ${record.languages.join(', ')}` : ''
        lines.push(`    ${ruleRefKey(record.loser)}${tier === undefined ? '' : ` (tier ${tier})`} — ${record.reason}${scope}`)
      }
      writeUnit(lines)
    }

    if (explanation.ineligible.length > 0) {
      const lines = [`  ${paint('bold', 'Other candidates that never contested this concept')}`]
      for (const record of explanation.ineligible) {
        const prefix = `    ${ruleRefKey(record.candidate)} — `
        const detailWidth = Math.max(1, width - displayWidth(prefix))
        const [firstLine, ...continuationLines] = wrapText(ineligibilityText(record), detailWidth)
        const indent = ' '.repeat(displayWidth(prefix))
        lines.push(`${prefix}${firstLine}`, ...continuationLines.map((line) => `${indent}${line}`))
      }
      writeUnit(lines)
    }
  }

  writeUnit([
    frameTop(),
    ...wrapText(verdict(explanation), Math.max(1, inner - 2)).map((line) => frameRow(`  ${line}`)),
    frameBottom(),
  ])
}

export function renderRulesWhyJson(explanation: ConceptWhy, context: RulesReporterContext): void {
  context.write(`${JSON.stringify({ version: RULES_WHY_JSON_VERSION, ...explanation }, null, 2)}\n`)
}
