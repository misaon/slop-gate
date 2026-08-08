import {
  applyEdits,
  compareStrings,
  conceptById,
  encodeUtf8,
  FIX_TIER_RANK,
  GENERATED_CONCEPT_IDS,
  isConceptId,
  RULE_ENTRIES,
  ruleRefKey,
  unifiedDiff,
  type CheckEvent,
  type CheckResult,
  type Diagnostic,
  type FixKind,
  type RuleEntry,
  type Severity,
  type UnavailableEngine,
} from '@misaon/slop-gate-core'
import { SEVERITY_ORDER } from './severity.ts'
import type { Reporter, ReporterContext } from './index.ts'

export const AGENT_REPORT_VERSION = 1

const BYTES_PER_TOKEN = 3

const SNIPPET_MAX_CHARS = 160
const CONFIG_LOCATION = '(configuration)'
const MAX_LISTED_UNCOVERED = 8

// Built from a variable so this source never contains a literal directive: a run over this repository
// would otherwise read the example as a real suppression.
const DISABLE = 'sgate-disable'
const DISABLE_DIRECTIVE = `${DISABLE}-next-line`

const estimateTokens = (text: string): number => Math.ceil(encodeUtf8(text).length / BYTES_PER_TOKEN)

export type AgentReporterOptions = {
  entries?: readonly RuleEntry[]
}

type Section = 'automated' | 'judgement'

export type AgentGroupSummary = {
  readonly concept: string
  readonly section: Section
  readonly tier: FixKind | null
  readonly severity: Severity
  readonly findingCount: number
  readonly fileCount: number
  readonly ruleRefKeys: readonly string[]
  readonly docsUrl: string | null
}

export function summariseAgentGroups(result: CheckResult, options: AgentReporterOptions = {}): AgentGroupSummary[] {
  return collectGroups(result, options.entries ?? RULE_ENTRIES).map((group) => ({
    concept: group.concept,
    section: group.section,
    tier: group.tier,
    severity: group.primarySeverity,
    findingCount: group.diagnostics.length,
    fileCount: group.files.size,
    ruleRefKeys: group.ruleRefKeys,
    docsUrl: group.docsUrl,
  }))
}

type PricedFinding = {
  readonly diagnostic: Diagnostic
  readonly renderedBlock: string
  readonly tokens: number
}

type GroupCore = {
  readonly concept: string
  readonly diagnostics: readonly Diagnostic[]
  readonly section: Section
  readonly tier: FixKind | null
  readonly fixTouches: readonly string[]
  readonly ruleRefKeys: readonly string[]
  readonly severities: ReadonlyMap<Severity, number>
  readonly primarySeverity: Severity
  readonly files: ReadonlySet<string>
  readonly docsUrl: string | null
  readonly why: string | null
  readonly hoistedMessage: string | null
  readonly help: string | null
}

type Group = GroupCore & { readonly findings: readonly PricedFinding[] }

export function createAgentReporter(context: ReporterContext, options: AgentReporterOptions = {}): Reporter {
  const entries = options.entries ?? RULE_ENTRIES

  return {
    onEvent(event: CheckEvent) {
      if (event.type !== 'done') return
      context.write(render(event.result, context, entries))
    },
  }
}

function render(result: CheckResult, context: ReporterContext, entries: readonly RuleEntry[]): string {
  const groups = buildGroups(result, context, entries)
  const budget = context.maxTokens

  const everything = new Set(groups.flatMap((group) => group.findings))
  if (budget === undefined) return renderDocument(result, groups, everything, budget)

  const complete = renderDocument(result, groups, everything, budget)
  if (estimateTokens(complete) <= budget) return complete

  const reserved = estimateTokens(renderDocument(result, groups, new Set(), budget, { sizing: true, overBudget: true }))
  const shown = new Set<PricedFinding>()
  let spent = 0
  for (const finding of rotation(groups)) {
    if (reserved + spent + finding.tokens > budget) continue
    shown.add(finding)
    spent += finding.tokens
  }

  return renderDocument(result, groups, shown, budget, { overBudget: reserved > budget })
}

function rotation(groups: readonly Group[]): PricedFinding[] {
  const ordered: PricedFinding[] = []
  const deepest = Math.max(0, ...groups.map((group) => group.findings.length))
  for (let index = 0; index < deepest; index += 1) {
    for (const group of groups) {
      const finding = group.findings[index]
      if (finding !== undefined) ordered.push(finding)
    }
  }
  return ordered
}

function buildGroups(result: CheckResult, context: ReporterContext, entries: readonly RuleEntry[]): Group[] {
  const sources = new Map<string, string | null>()
  const readSource = (file: string): string | null => {
    if (!sources.has(file)) sources.set(file, context.readSource(file))
    return sources.get(file) ?? null
  }

  return collectGroups(result, entries).map((group) => ({
    ...group,
    findings: group.diagnostics.map((diagnostic) => {
      const renderedBlock = renderBlock(diagnostic, { hoistedMessage: group.hoistedMessage, readSource })
      return { diagnostic, renderedBlock, tokens: estimateTokens(renderedBlock) }
    }),
  }))
}

function collectGroups(result: CheckResult, entries: readonly RuleEntry[]): GroupCore[] {
  const byRuleRefKey = new Map(entries.map((entry) => [ruleRefKey(entry), entry]))

  const collected = new Map<string, Diagnostic[]>()
  for (const diagnostic of result.diagnostics) {
    const existing = collected.get(diagnostic.concept)
    if (existing) existing.push(diagnostic)
    else collected.set(diagnostic.concept, [diagnostic])
  }

  const groups: GroupCore[] = []
  for (const [concept, diagnostics] of collected) {
    const ruleRefKeys = [...new Set(diagnostics.map((diagnostic) => diagnostic.ruleRefKey))].sort(compareStrings)
    const rules = ruleRefKeys.map((key) => byRuleRefKey.get(key))
    const tier = groupTier(rules)

    const severities = new Map<Severity, number>()
    for (const diagnostic of diagnostics) severities.set(diagnostic.severity, (severities.get(diagnostic.severity) ?? 0) + 1)

    const messages = new Set(diagnostics.map((diagnostic) => diagnostic.message))
    const helps = new Set(diagnostics.map((diagnostic) => diagnostic.help ?? ''))
    const uniformHelp = helps.size === 1 && !helps.has('')

    const hoistedMessage = messages.size === 1 ? diagnostics[0]!.message : null

    groups.push({
      concept,
      diagnostics,
      section: tier === null ? 'judgement' : 'automated',
      tier,
      fixTouches: [...new Set(rules.flatMap((rule) => rule?.fixTouches ?? []))].sort(compareStrings),
      ruleRefKeys,
      severities,
      primarySeverity: SEVERITY_ORDER.find((severity) => severities.has(severity)) ?? 'info',
      files: new Set(diagnostics.map((diagnostic) => diagnostic.file ?? CONFIG_LOCATION)),
      docsUrl: diagnostics.find((diagnostic) => diagnostic.docsUrl !== undefined)?.docsUrl ?? null,
      why: curatedDescription(concept),
      hoistedMessage,
      help: uniformHelp ? (diagnostics[0]!.help ?? null) : null,
    })
  }

  return groups.sort(compareGroups)
}

function groupTier(rules: readonly (RuleEntry | undefined)[]): FixKind | null {
  let highest: FixKind | null = null
  for (const rule of rules) {
    if (rule === undefined || rule.fixKind === 'none') return null
    if (highest === null || FIX_TIER_RANK[rule.fixKind] > FIX_TIER_RANK[highest]) highest = rule.fixKind
  }
  return highest
}

function compareGroups(a: GroupCore, b: GroupCore): number {
  const section = (a.section === 'automated' ? 0 : 1) - (b.section === 'automated' ? 0 : 1)
  if (section !== 0) return section
  const severity = SEVERITY_ORDER.indexOf(a.primarySeverity) - SEVERITY_ORDER.indexOf(b.primarySeverity)
  if (severity !== 0) return severity
  return b.diagnostics.length - a.diagnostics.length || compareStrings(a.concept, b.concept)
}

function curatedDescription(concept: string): string | null {
  if (!isConceptId(concept) || GENERATED_CONCEPT_IDS.has(concept)) return null
  return conceptById(concept).description
}

type BlockContext = {
  readonly hoistedMessage: string | null
  readonly readSource: (file: string) => string | null
}

function renderBlock(diagnostic: Diagnostic, context: BlockContext): string {
  const lines = [
    context.hoistedMessage === null ? `- ${location(diagnostic)} — ${diagnostic.message}` : `- ${location(diagnostic)}`,
  ]

  const file = diagnostic.file
  if (file !== null) {
    const source = context.readSource(file)
    const snippet = source === null ? null : renderSnippet(source, diagnostic)
    if (snippet !== null) lines.push(`    ${snippet}`)
  }

  const diff = renderDiff(diagnostic, context.readSource)
  if (diff !== null) lines.push(diff)

  return lines.join('\n')
}

function location(diagnostic: Diagnostic): string {
  if (diagnostic.file === null) return CONFIG_LOCATION
  const { startLine, startColumn, endLine, endColumn } = diagnostic.position
  const start = `${diagnostic.file}:${startLine}:${startColumn}`
  if (startLine === endLine) return startColumn === endColumn ? start : `${start}-${endColumn}`
  return `${start}..${endLine}:${endColumn}`
}

function renderSnippet(source: string, diagnostic: Diagnostic): string | null {
  const lines = source.split('\n')
  const raw = lines[diagnostic.position.startLine - 1]
  if (raw === undefined) return null

  const text = raw.replace(/\r$/, '').trimEnd()
  if (text === '') return null

  const spanned = diagnostic.position.endLine - diagnostic.position.startLine
  const more = spanned > 0 ? `  (+${spanned} more line${spanned === 1 ? '' : 's'})` : ''
  const gutter = `${diagnostic.position.startLine} | `

  if (text.length <= SNIPPET_MAX_CHARS) return `${gutter}${text}${more}`

  const from = Math.max(0, Math.min(diagnostic.position.startColumn - 1 - Math.floor(SNIPPET_MAX_CHARS / 2), text.length - SNIPPET_MAX_CHARS))
  const to = from + SNIPPET_MAX_CHARS
  const head = from > 0 ? '…' : ''
  const tail = to < text.length ? '…' : ''
  return `${gutter}${head}${text.slice(from, to)}${tail}${more}`
}

function renderDiff(diagnostic: Diagnostic, readSource: (file: string) => string | null): string | null {
  const fix = diagnostic.fix
  const file = diagnostic.file
  if (fix === undefined || file === null) return null

  const source = readSource(file)
  if (source === null) return `  fix: ${fix.description} (tier ${fix.kind}; diff unavailable — ${file} could not be read)`

  const before = encodeUtf8(source)
  try {
    const after = applyEdits(
      before,
      fix.edits.map((edit) => ({
        file,
        range: edit.range,
        replacement: edit.replacement,
        kind: fix.kind,
        ruleRefKey: diagnostic.ruleRefKey,
        concept: diagnostic.concept,
        priority: 0,
        severity: diagnostic.severity,
      })),
    )
    return `  fix: ${fix.description} (tier ${fix.kind})\n${unifiedDiff(file, before, after).trimEnd()}`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `  fix: ${fix.description} (tier ${fix.kind}; diff unavailable — ${message})`
  }
}

type DocumentOptions = {
  readonly sizing?: boolean
  readonly overBudget?: boolean
}

function renderDocument(
  result: CheckResult,
  groups: readonly Group[],
  shown: ReadonlySet<PricedFinding>,
  budget: number | undefined,
  options: DocumentOptions = {},
): string {
  const total = groups.reduce((sum, group) => sum + group.findings.length, 0)
  const shownCount = groups.reduce((sum, group) => sum + group.findings.filter((finding) => shown.has(finding)).length, 0)
  const omitted = total - shownCount
  const gaps = result.unavailableEngines.filter(isCoverageGap)

  const lines: string[] = [`slop-gate agent report v${AGENT_REPORT_VERSION}`]

  const counts = SEVERITY_ORDER.filter((severity) => result.counts[severity] > 0)
    .map((severity) => `${severity} ${result.counts[severity]}`)
    .join(', ')
  lines.push(`findings: ${total}${counts === '' ? '' : ` (${counts})`}`)
  lines.push(`scope: ${result.stats.filesScanned} files scanned, ${result.stats.filesAnalysed} analysed`)

  lines.push(...incompletenessLines(result))
  const uncurated = groups.filter((group) => group.why === null).length
  if (uncurated > 0) {
    lines.push(
      `note: \`why:\` appears only where the concept has a curated rationale; ${uncurated} of ${groups.length} below are ` +
        'named after an engine rule and have none, so `docs:` is the authority for those.',
    )
  }
  lines.push('')
  lines.push(
    ...coverageLines({
      groups,
      shown,
      total,
      shownCount,
      omitted,
      gaps: gaps.length,
      accepted: result.baseline?.accepted ?? 0,
      budget,
      options,
    }),
  )

  for (const section of ['automated', 'judgement'] as const) {
    const inSection = groups.filter((group) => group.section === section)
    if (inSection.length === 0) continue
    lines.push('')
    lines.push(...sectionLines(section, inSection))
    for (const group of inSection) {
      lines.push('')
      lines.push(...groupLines(group, shown, options))
    }
  }

  lines.push('')
  lines.push(...nextActionLines(groups, options.sizing === true ? total : omitted, budget, gaps))

  return `${lines.join('\n')}\n`
}

export const isCoverageGap = (engine: UnavailableEngine): boolean => engine.displaced.length > 0

function unavailableLines(engines: readonly UnavailableEngine[]): string[] {
  const lines: string[] = []
  for (const engine of engines.filter(isCoverageGap)) {
    lines.push(
      `INCOMPLETE: engine \`${engine.engine}\` is registered but could not run here — ${engine.reason}. ` +
        'Nothing it would have reported appears below; do not read a clean section as clean.' +
        (engine.install === undefined ? '' : ` Resolve it with \`${engine.install}\`.`),
    )
    for (const record of engine.displaced) {
      if (record.insteadOwnedBy === undefined) lines.push(`  unchecked: ${record.concept} — no other engine here covers it.`)
    }
    for (const record of engine.displaced) {
      const instead = record.insteadOwnedBy
      if (instead === undefined) continue
      lines.push(
        `  downgraded: ${record.concept} — \`${ruleRefKey(instead)}\` owns it instead, ` +
          `which arbitration ranks below \`${ruleRefKey(record.wouldOwn)}\`.`,
      )
    }
  }
  for (const engine of engines.filter((candidate) => !isCoverageGap(candidate))) {
    lines.push(
      `note: engine \`${engine.engine}\` could not run here — ${engine.reason}. ` +
        'It would have owned nothing in this run, so no coverage was lost.',
    )
  }
  return lines
}

function baselineLines(baseline: CheckResult['baseline']): string[] {
  if (baseline === null) return []
  const lines: string[] = []
  if (baseline.accepted > 0) {
    lines.push(
      `INCOMPLETE: a baseline accepted ${baseline.accepted} finding${baseline.accepted === 1 ? '' : 's'} — ${baseline.path}. ` +
        'They are real findings, absent from everything below; do not read a clean file or section as clean. ' +
        'Run `sgate check --no-baseline` to see them.',
    )
    const listed = baseline.acceptedByConcept.slice(0, MAX_LISTED_UNCOVERED)
    for (const group of listed) lines.push(`  accepted: ${group.concept} — ${group.count}`)
    const more = baseline.acceptedByConcept.length - listed.length
    if (more > 0) lines.push(`  accepted: +${more} more concept${more === 1 ? '' : 's'}`)
  }
  const stale = baseline.stale.length
  if (stale > 0) {
    lines.push(
      `baseline: ${stale} accepted finding${stale === 1 ? ' is' : 's are'} fixed — ` +
        `\`sgate baseline update\` prunes ${stale === 1 ? 'it' : 'them'}.`,
    )
  }
  return lines
}

function incompletenessLines(result: CheckResult): string[] {
  const lines: string[] = []
  for (const failure of result.engineFailures) {
    lines.push(
      `INCOMPLETE: engine \`${failure.engine}\` failed — ${failure.message}. ` +
        `Nothing it would have reported appears below; do not read a clean section as clean.`,
    )
  }
  lines.push(...unavailableLines(result.unavailableEngines))
  lines.push(...baselineLines(result.baseline))
  if (result.ruleset.unknownKeys.length > 0) {
    lines.push(`config: ${result.ruleset.unknownKeys.length} rule key(s) in the config name nothing — run \`sgate rules list\`.`)
  }
  if (result.ruleset.uncovered.length > 0) {
    const listed = result.ruleset.uncovered.slice(0, MAX_LISTED_UNCOVERED)
    const more = result.ruleset.uncovered.length - listed.length
    lines.push(
      `uncovered: ${result.ruleset.uncovered.length} enabled concept(s) have no capable engine here, ` +
        `so nothing checked them: ${listed.join(', ')}${more > 0 ? `, +${more} more` : ''}.`,
    )
  }
  return lines
}

type CoverageInput = {
  readonly groups: readonly Group[]
  readonly shown: ReadonlySet<PricedFinding>
  readonly total: number
  readonly shownCount: number
  readonly omitted: number
  readonly gaps: number
  readonly accepted: number
  readonly budget: number | undefined
  readonly options: DocumentOptions
}

function coverageLines(input: CoverageInput): string[] {
  const { total, budget, gaps, accepted } = input
  const sizing = input.options.sizing === true
  const corrections: string[] = []
  if (gaps > 0) corrections.push(`${gaps} engine${gaps === 1 ? '' : 's'} could not run (see INCOMPLETE above)`)
  if (accepted > 0) {
    corrections.push(`a baseline accepted ${accepted} finding${accepted === 1 ? '' : 's'} (see INCOMPLETE above)`)
  }
  const correction = corrections.join(' and ')
  if (total === 0) {
    return [
      corrections.length === 0
        ? 'coverage: no findings. Nothing was omitted.'
        : `coverage: ${correction}, so this is not a clean result. No findings from what did run, and nothing was omitted.`,
    ]
  }

  const shownCount = sizing ? total : input.shownCount
  const omitted = sizing ? total : input.omitted
  const scope = budget === undefined ? 'no --max-tokens set' : `--max-tokens ${budget}`
  const accounting = `${shownCount} of ${total} findings shown, ${omitted} omitted (${scope}).`
  const lines = [
    corrections.length === 0
      ? `coverage: ${accounting}`
      : `coverage: ${correction}, so this is not the whole picture. ${accounting}`,
  ]
  if (budget === undefined) return lines

  lines.push(
    `budget: 1 token is estimated as ${BYTES_PER_TOKEN} UTF-8 bytes — an approximation, not a tokenizer. It over-counts, so this under-fills.`,
  )

  if (sizing || omitted > 0) {
    lines.push(
      'priority: group headers are never dropped, so every concept below shows its true count. Findings are admitted one per group in rotation — first of every group, then second — keeping one worked example per concept for as long as the budget allows; one too large for the space left is skipped.',
      'omitted:',
    )
    for (const group of input.groups) {
      const missing = sizing
        ? group.findings.length
        : group.findings.length - group.findings.filter((finding) => input.shown.has(finding)).length
      if (missing > 0) lines.push(`  ${group.concept} — ${missing} of ${group.findings.length} not shown`)
    }
  }

  if (sizing || input.options.overBudget === true) {
    lines.push(
      'note: the fixed sections alone estimate above the requested budget. They are printed in full anyway — a report that fits its budget by hiding what it dropped is worse than one that overruns.',
    )
  }

  return lines
}

function sectionLines(section: Section, groups: readonly Group[]): string[] {
  const findings = groups.reduce((sum, group) => sum + group.findings.length, 0)
  const files = new Set(groups.flatMap((group) => [...group.files])).size
  const scale =
    `${findings} finding${findings === 1 ? '' : 's'} in ${files} file${files === 1 ? '' : 's'}, ` +
    `across ${groups.length} concept${groups.length === 1 ? '' : 's'}`

  if (section === 'judgement') {
    return [
      '## judgement — no fix is declared for these. Decide and edit them yourself.',
      `${scale}. \`sgate fix\` will not touch them at any tier, so nothing here conflicts with a fix run.`,
      `If one is a false positive, record that instead of changing the code: \`// ${DISABLE_DIRECTIVE} ` +
        '<concept> -- <reason>` on the line above it. The reason is required.',
    ]
  }

  const tiers = new Map<FixKind, number>()
  for (const group of groups) if (group.tier !== null) tiers.set(group.tier, (tiers.get(group.tier) ?? 0) + group.findings.length)
  const present = (['safe', 'suggested', 'unsafe'] as const).filter((tier) => tiers.has(tier))
  const highest = present.at(-1) ?? 'safe'
  const flag = highest === 'safe' ? 'sgate fix' : (highest === 'suggested' ? 'sgate fix --suggest' : 'sgate fix --unsafe')

  const lines = [
    '## automated — `sgate fix` rewrites these. Do not edit them by hand.',
    `${scale}. Run: \`${flag}\``,
    `Tiers present: ${present.map((tier) => `${tier} ${tiers.get(tier)}`).join(', ')}. ` +
      'A tier is the registry\'s declared trust level for a rule\'s fix; plain `sgate fix` applies `safe` only, ' +
      '`--suggest` adds `suggested`, `--unsafe` adds both.',
  ]

  if (!groups.some((group) => group.findings.some((finding) => finding.diagnostic.fix !== undefined))) {
    lines.push(
      `No edit is shown below: \`sgate check\` does not derive fixes, because for some engines that means ` +
        `re-running them once per rule. \`${flag} --dry-run\` prints the exact diff without writing anything.`,
    )
  }

  return lines
}

function groupLines(group: Group, shown: ReadonlySet<PricedFinding>, options: DocumentOptions): string[] {
  const severity =
    group.severities.size === 1
      ? group.primarySeverity
      : SEVERITY_ORDER.filter((value) => group.severities.has(value))
          .map((value) => `${value} ${group.severities.get(value)}`)
          .join('/')

  const facets = [
    `${group.findings.length} finding${group.findings.length === 1 ? '' : 's'} in ${group.files.size} file${group.files.size === 1 ? '' : 's'}`,
    severity,
  ]
  if (group.tier !== null) facets.push(`tier ${group.tier}`)
  if (group.fixTouches.length > 0) facets.push(`touches ${group.fixTouches.join(', ')}`)

  const lines = [`### ${group.concept} — ${facets.join(' · ')}`, `rule: ${group.ruleRefKeys.join(', ')}`]
  if (group.why !== null) lines.push(`why: ${group.why}`)
  if (group.hoistedMessage !== null) lines.push(`message: ${group.hoistedMessage}`)
  if (group.help !== null) lines.push(`help: ${group.help}`)
  if (group.docsUrl !== null) lines.push(`docs: ${group.docsUrl}`)

  const kept = group.findings.filter((finding) => shown.has(finding))
  const shownHere = options.sizing === true ? group.findings.length : kept.length
  if (kept.length < group.findings.length) lines.push(`showing ${shownHere} of ${group.findings.length}`)
  if (options.sizing !== true) for (const finding of kept) lines.push(finding.renderedBlock)

  return lines
}

function nextActionLines(
  groups: readonly Group[],
  omitted: number,
  budget: number | undefined,
  gaps: readonly UnavailableEngine[],
): string[] {
  const automated = groups.filter((group) => group.section === 'automated')
  const judgement = groups.filter((group) => group.section === 'judgement')
  const actions: string[] = []

  for (const engine of gaps) {
    const command = engine.install === undefined ? '' : ` (\`${engine.install}\`)`
    actions.push(
      `Make \`${engine.engine}\` runnable here${command} and re-run — ${engine.displaced.length} concept(s) went unchecked or to a lower-ranked rule.`,
    )
  }

  if (automated.length > 0) {
    const findings = automated.reduce((sum, group) => sum + group.findings.length, 0)
    const highest = (['safe', 'suggested', 'unsafe'] as const).findLast((tier) => automated.some((group) => group.tier === tier)) ?? 'safe'
    const flag = highest === 'safe' ? 'sgate fix' : (highest === 'suggested' ? 'sgate fix --suggest' : 'sgate fix --unsafe')
    actions.push(`Run \`${flag}\` — it covers ${findings} finding(s). Leave those files alone until it has run; a hand edit and a tool edit on the same range conflict.`)
    actions.push('Run this repository\'s formatter afterwards. `sgate fix` does not run one — no formatter engine exists yet — so an applied edit can leave formatting your formatter would undo.')
  }

  if (judgement.length > 0) {
    actions.push(
      `Work the judgement groups by hand, in the order they appear above (most severe first, then largest batch): ${judgement
        .map((group) => `${group.concept} (${group.findings.length})`)
        .join(', ')}.`,
    )
  }

  if (omitted > 0) {
    actions.push(`Re-run with a larger \`--max-tokens\` than ${budget}, or without it, to see the ${omitted} finding(s) omitted above.`)
  }

  if (actions.length === 0) {
    actions.push('Nothing to do. This run found no findings at the configured ruleset.')
  } else {
    actions.push('Re-run `sgate check --format agent` and expect zero findings.')
  }

  return ['nextActions', ...actions.map((action, index) => `${index + 1}. ${action}`)]
}
