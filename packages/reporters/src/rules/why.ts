import {
  conceptById,
  ruleRefKey,
  splitRuleSetting,
  wasEnabledBeforeBeingDisabled,
  type ConceptEnablement,
  type ConceptOwnership,
  type ConceptWhy,
  type FrameworkEvidence,
  type IneligibleCandidate,
  type ProvenanceLayer,
  type RuleSetting,
} from '@misaon/slop-gate-core'
import { displayWidth } from '../display-width.ts'
import { createFrameKit, plural } from '../frame.ts'
import { wrapText } from '../wrap-text.ts'
import type { RulesReporterContext } from './context.ts'
import { indexCandidates, levelGlyph, tierOf } from './shared.ts'

export const RULES_WHY_JSON_VERSION = 1

const LAYER_LABEL: Readonly<Record<ProvenanceLayer, string>> = {
  preset: 'preset',
  framework: 'framework',
  'framework-override': 'path-scoped framework',
  'root-config': 'root config',
  'workspace-config': 'workspace config',
  override: 'override',
}

/**
 * One line of evidence, phrased so the reader can act on it: which file declares the thing that made
 * detection fire. "Off because NestJS" is a dead end for someone who disagrees; naming the manifest
 * and the dependency tells them exactly what to change, and tells them immediately if detection is
 * wrong (spec §23.4).
 */
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

function settingText(setting: RuleSetting): string {
  const { level, options } = splitRuleSetting(setting)
  if (options === undefined) return level
  // `[]` is a layer explicitly clearing the options it inherited, which is a different statement
  // from the bare level above and has to read as one, or the provenance table shows two identical
  // rows for two different decisions.
  return options.length === 0 ? `${level} (options cleared)` : `${level} ${JSON.stringify(options)}`
}

/**
 * The effective options and the layer that decided them — the options half of the same question
 * `enablementSummary` answers for the level, and separate from it because the two can be settled by
 * different layers: `extends: ['recommended']` plus `'pedantic.eqeqeq': 'error'` takes its level
 * from the config file and its options from the preset. Rendered only when there are options, so
 * every concept that has none looks exactly as it did.
 */
function optionsSummary(enablement: ConceptEnablement): string | undefined {
  if (enablement.options.length === 0) return undefined
  const from = enablement.optionsFrom
  const source = from === undefined ? '' : ` — from ${LAYER_LABEL[from.layer]} \`${from.source}\``
  return `Options: ${JSON.stringify(enablement.options)}${source}`
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
    lines.push(`      ${LAYER_LABEL[step.layer].padEnd(21)} ${step.source} -> ${settingText(step.setting)}`)
  }
  for (const override of enablement.overrides) {
    lines.push(`      ${LAYER_LABEL[override.layer].padEnd(21)} ${override.source} -> ${settingText(override.setting)}`)
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
    // Deliberately different words from the case above. "Not registered" is a property of the build;
    // "not installed" is a property of this machine, and it is the one the reader can act on.
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

/**
 * True when `owner` is undefined for a reason *other* than a genuine coverage gap: every
 * ineligible candidate recorded for this concept failed only on language. Mirrors
 * `RulesListEntry.languageMismatch` (core), computed here instead of carried as its own field —
 * `why`, unlike `list`, already has the full `ineligible` array for this one concept, so checking
 * it directly is reading a recorded fact, not re-deriving one.
 */
function isLanguageMismatch(explanation: ConceptWhy): boolean {
  return (
    explanation.ownership.length === 0 &&
    !explanation.uncovered &&
    !explanation.servicedBySlopGate &&
    explanation.ineligible.some((record) => record.reason === 'language-mismatch')
  )
}

/**
 * Ownership as one phrase, whether one rule owns the concept everywhere or several split it by
 * language.
 *
 * Languages are named **only when ownership is actually split**. For the overwhelmingly common
 * single-owner case they would be noise — the reader asked who owns a concept, not which file
 * extensions exist — and the answer has to stay short enough to sit inside one sentence. When two
 * engines do own it, naming the languages is the entire content of the answer.
 */
function describeOwnership(ownership: readonly ConceptOwnership[]): string {
  if (ownership.length === 1) return `\`${ruleRefKey(ownership[0]!.owner)}\``
  return ownership
    .map(({ owner, languages }) => `\`${ruleRefKey(owner)}\` for ${languages.join(', ')}`)
    .join(' and ')
}

/**
 * The one-line bottom-line `why`'s closing frame always carries — the thing a reader who skipped
 * straight to the bottom still needs: does this concept produce findings right now, and through
 * what. Every other section explains *why* the verdict is what it is; this is the verdict itself.
 */
function verdict(explanation: ConceptWhy): string {
  if (explanation.servicedBySlopGate) return 'Emitted by slop-gate itself, not by any engine rule.'
  if (!explanation.enablement.enabled) {
    // Filtered to the profiles that actually asked for `off`. A profile that asked for a *level* and
    // was overruled by the user's own `off` is in this list too, and attributing the silence to it
    // would name the one party that wanted the opposite.
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
    const options = optionsSummary(explanation.enablement)
    if (options !== undefined) lines.push(`  ${options}`)
    if (explanation.pinnedOwner !== undefined) lines.push(`  Pinned owner: \`${explanation.pinnedOwner}\` (via \`owners\` in config)`)
    writeUnit(lines)
  }

  if (explanation.frameworks.length > 0) {
    const lines: string[] = []
    for (const framework of explanation.frameworks) {
      const verb = framework.setting === 'off' ? 'turns this off' : `asks for \`${framework.setting}\``
      const where = framework.paths === undefined ? '' : ` under ${framework.paths.map((glob) => `\`${glob}\``).join(', ')}`
      lines.push(`  ${paint('bold', 'Framework')}: ${framework.id} ${verb}${where} — ${framework.summary}`)
      for (const evidence of framework.evidence) lines.push(`      detected via ${evidenceText(evidence)}`)
      for (const line of wrapText(framework.reason, Math.max(1, width - 6))) lines.push(`      ${line}`)
      // The count is the whole warrant for an addition (spec §23.5), so it is rendered next to the
      // reason rather than hidden behind `--format json`: a profile that turns a rule *on* is asking
      // to produce findings on code that passed yesterday, and the reader is owed the number.
      if (framework.measured !== undefined) {
        const { findings, falsePositives, repository } = framework.measured
        lines.push(`      ${paint('dim', `measured on ${repository}: ${findings} findings, ${falsePositives} false`)}`)
      }
    }
    // The precedence rule in the one line the reader actually needs: not the whole model, only the
    // clause that decided *this* concept. Printed only when a profile asked for something the
    // cascade did not grant, which is the sole case where the model is not self-evident from the
    // provenance table directly above.
    // A path-scoped profile is excluded even when its level differs from `enablement.level`: that
    // level is `maxLevelOf`, the strongest anywhere in the repository, and a profile that asked for
    // something *only under its globs* got exactly what it asked for there. Calling it overruled
    // would report a defeat that did not happen — and hide the real one if it ever did.
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

  // Never non-empty for a shipped profile, so this costs the common rendering nothing — see
  // `ConceptWhy.rejectedFrameworkAdditions` for why it is surfaced at all.
  if (explanation.rejectedFrameworkAdditions.length > 0) {
    const lines = [`  ${paint('dim', 'Framework additions refused for want of a measurement')}`]
    for (const rejection of explanation.rejectedFrameworkAdditions) {
      const prefix = `    ${rejection.id} wanted \`${rejection.level}\` — `
      const [first, ...rest] = wrapText(rejection.refusal, Math.max(1, width - displayWidth(prefix)))
      lines.push(`${prefix}${first}`, ...rest.map((line) => `${' '.repeat(displayWidth(prefix))}${line}`))
    }
    writeUnit(lines)
  }

  // Not filtered to this concept — a profile that stood down has no adjustments to filter by, which
  // is the whole reason to surface it: the reader is looking at a finding some profile would have
  // removed, and the actionable part is which parameter it could not resolve.
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
      const glyph = levelGlyph(explanation.enablement.level as never, context, paint)
      const label = explanation.ownership.length === 1 ? 'Owner' : 'Owners'
      const lines = [`  ${glyph}  ${label}:`]
      for (const { owner, languages } of explanation.ownership) {
        const tier = tierOf(candidateIndex, owner)
        // The language list is dropped for a sole owner for the same reason `describeOwnership`
        // drops it: it answers a question nobody asked unless ownership is genuinely split.
        const scope = explanation.ownership.length === 1 ? '' : ` for ${languages.join(', ')}`
        lines.push(`      ${paint('bold', ruleRefKey(owner))}${tier === undefined ? '' : ` (tier ${tier})`}${scope}`)
      }
      // One extra line per displaced owner, inside the same block. A reader looking at who owns a
      // concept needs "and a better owner is one install away" in the same glance, not in a separate
      // section further down — and it has to stay one line, or the model is too complicated.
      for (const record of explanation.displaced) {
        lines.push(
          `      ${paint('dim', `${ruleRefKey(record.wouldOwn)} would own ${record.languages.join(', ')} — not installed`)}`,
        )
      }
      // Kept on one line in the common case, so the single-owner rendering is unchanged.
      const single = explanation.ownership.length === 1 && explanation.displaced.length === 0
      writeUnit(single ? [`${lines[0]!.replace(/:$/, ':')} ${lines[1]!.trim()}`] : lines)
    } else if (explanation.uncovered) {
      writeUnit([`  ${paint('yellow', 'Uncovered')} — no capable engine in this run owns this concept.`])
    } else if (isLanguageMismatch(explanation)) {
      writeUnit([`  ${paint('dim', 'Not applicable')} — no files here in a language this concept covers. Not a coverage gap.`])
    }

    if (explanation.suppressed.length > 0) {
      const lines = [`  ${paint('bold', 'Suppressed candidates')} (lost arbitration to the owner above)`]
      for (const record of explanation.suppressed) {
        const tier = tierOf(candidateIndex, record.suppressed)
        // The languages are what make a suppression checkable: "lost to oxlint on ts" is a claim a
        // reader can verify, where a bare "lost" invites the question this whole change answers.
        const scope = explanation.ownership.length > 1 ? ` on ${record.languages.join(', ')}` : ''
        lines.push(`    ${ruleRefKey(record.suppressed)}${tier === undefined ? '' : ` (tier ${tier})`} — ${record.reason}${scope}`)
      }
      writeUnit(lines)
    }

    if (explanation.ineligible.length > 0) {
      const lines = [`  ${paint('bold', 'Other candidates that never contested this concept')}`]
      for (const record of explanation.ineligible) {
        // The M2-blocker reason in particular (`ineligibilityText`'s `missing-capability`/`types`
        // case) is 180+ characters — measured printing this against a real type-aware concept, it
        // ran to 228 and overflowed every normal terminal width unwrapped. Wrapped the same way
        // `pretty.ts` wraps a diagnostic message: on plain text via `wrapText`, continuation lines
        // aligned under this candidate's own prefix (which varies in length row to row, so the
        // indent is computed per record rather than reusing one fixed column).
        const prefix = `    ${ruleRefKey(record.candidate)} — `
        const detailWidth = Math.max(1, width - displayWidth(prefix))
        const [firstLine, ...continuationLines] = wrapText(ineligibilityText(record), detailWidth)
        const indent = ' '.repeat(displayWidth(prefix))
        lines.push(`${prefix}${firstLine}`, ...continuationLines.map((line) => `${indent}${line}`))
      }
      writeUnit(lines)
    }
  }

  // Wrapped, not truncated. The verdict is the one line a reader who skipped everything else still
  // gets, and a concept split across engines by language names two rules and their languages in it —
  // measured at 96 characters for `correctness.parse-error` on this repository, well past any frame.
  // Cutting the sentence off mid-word would lose exactly the half that the split makes interesting.
  writeUnit([
    frameTop(),
    ...wrapText(verdict(explanation), Math.max(1, inner - 2)).map((line) => frameRow(`  ${line}`)),
    frameBottom(),
  ])
}

export function renderRulesWhyJson(explanation: ConceptWhy, context: RulesReporterContext): void {
  context.write(`${JSON.stringify({ version: RULES_WHY_JSON_VERSION, ...explanation }, null, 2)}\n`)
}
