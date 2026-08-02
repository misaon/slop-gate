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

/**
 * Bytes per estimated token. Deliberately low: a BPE tokenizer averages nearer four bytes per token
 * on English prose and three to three and a half on source code, so dividing by three over-counts
 * almost everywhere and the budget under-fills rather than overruns. Counted in UTF-8 bytes rather
 * than JavaScript string length because a CJK character is one token and three bytes but a single
 * `String.length` unit — counting characters would under-count it threefold, which is the one
 * direction this must never err in.
 */
const BYTES_PER_TOKEN = 3

const SNIPPET_MAX_CHARS = 160
const CONFIG_LOCATION = '(configuration)'
const MAX_LISTED_UNCOVERED = 8

/**
 * Spliced rather than written whole, and the seam is the point. `suppressions/parse.ts` scans for
 * the directive token textually, so a source file containing it verbatim — inside a string, inside a
 * comment, anywhere — is read as carrying a real directive. Written out in one piece, this line makes
 * the reporter report itself: `config.unused-suppression` against `agent.ts`, on every run of this
 * repository, in the output whose job is to be trusted.
 */
const DISABLE_DIRECTIVE = `sgate-disable${'-next-line'}`

const estimateTokens = (text: string): number => Math.ceil(encodeUtf8(text).length / BYTES_PER_TOKEN)

export type AgentReporterOptions = {
  /**
   * The registry entries the run arbitrated against. Defaults to `RULE_ENTRIES`, which is what
   * `resolveRun` itself defaults to — a `CheckResult` does not carry the entries, so this is the
   * seam a test that passed `CheckOptions.entries` uses to keep the reporter's tier lookup agreeing
   * with the run's. No production caller sets `CheckOptions.entries`, so no production caller sets
   * this either.
   */
  entries?: readonly RuleEntry[]
}

type Section = 'automated' | 'judgement'

/**
 * One concept's row of the report, without a word of prose — the same grouping, split and ordering
 * the document below is built from, in a shape that survives `JSON.stringify`.
 *
 * Exported for a caller that has to present both at once. `sgate mcp`'s `check` tool returns the
 * rendered report as its text and this as its structured content, and the two must not be able to
 * disagree: a concept shown under `## automated` in the prose and reported as `judgement` in the
 * structure would be worse than either alone. Sharing `collectGroups` is what makes that
 * unrepresentable rather than merely unlikely.
 *
 * `findings` is the *true* count, never the shown one — the structural half of "a group header is
 * never dropped", so a caller that bounded the prose still gets the complete inventory here.
 */
export type AgentGroupSummary = {
  readonly concept: string
  readonly section: Section
  readonly tier: FixKind | null
  readonly severity: Severity
  readonly findings: number
  readonly files: number
  readonly ruleIds: readonly string[]
  readonly docsUrl: string | null
}

export function summariseAgentGroups(result: CheckResult, options: AgentReporterOptions = {}): AgentGroupSummary[] {
  return collectGroups(result, options.entries ?? RULE_ENTRIES).map((group) => ({
    concept: group.concept,
    section: group.section,
    tier: group.tier,
    severity: group.primarySeverity,
    findings: group.diagnostics.length,
    files: group.files.size,
    ruleIds: group.ruleIds,
    docsUrl: group.docsUrl,
  }))
}

type Finding = {
  readonly diagnostic: Diagnostic
  /** The finding's rendered block, complete and self-contained, so admitting it is a set membership
   *  decision rather than a second rendering pass that could disagree with the cost it was budgeted at. */
  readonly text: string
  readonly tokens: number
}

/**
 * Everything about a concept's group that is decided by the diagnostics and the registry alone.
 * Split out from `Group` so the summary above and the document below are the same arithmetic:
 * computing it needs no `ReporterContext`, no source file and no rendering, which is what lets a
 * caller that only wants the shape avoid paying for prose it will throw away.
 */
type GroupCore = {
  readonly concept: string
  readonly diagnostics: readonly Diagnostic[]
  readonly section: Section
  readonly tier: FixKind | null
  readonly fixTouches: readonly string[]
  readonly ruleIds: readonly string[]
  readonly severities: ReadonlyMap<Severity, number>
  readonly primarySeverity: Severity
  readonly files: ReadonlySet<string>
  readonly docsUrl: string | null
  /** The concept's curated description, or `null` when the registry generator wrote it — see
   *  `GENERATED_CONCEPT_IDS`. A generated description restates the rule's name and is not a reason. */
  readonly why: string | null
  /** Hoisted to the group when every finding in it says the same thing, which is the common case for
   *  a rule with a fixed message and is where most of the repetition in a large report lives. */
  readonly message: string | null
  readonly help: string | null
}

type Group = GroupCore & { readonly findings: readonly Finding[] }

/**
 * The `agent` reporter — spec §12's "differentiator".
 *
 * Three properties decide whether this output is worth anything, and every structural choice below
 * follows from one of them:
 *
 * 1. **It is read by a machine with a budget, so silent truncation is the cardinal sin.** A group
 *    header is never dropped, so every concept in the run appears with its *true* finding count even
 *    when the budget removed all of its individual findings; the `coverage` block states the totals
 *    and lists exactly what was omitted; and the admission rule is printed in the report itself
 *    rather than left as tool trivia. An agent that reads this and believes it saw everything has
 *    been told otherwise in three places.
 * 2. **Determinism is total.** Rendered from `CheckResult.diagnostics`, which `streamCheck` has
 *    already sorted, with `compareStrings` for every tiebreak and no map iteration order reaching
 *    the output. Nothing time- or cache-dependent is printed: `durationMs` and `filesFromCache`
 *    would change the bytes between two runs over identical source, which is exactly the property
 *    that makes this diffable and cacheable.
 * 3. **It has to be worth acting on.** Findings are grouped by *fix strategy* — the split between
 *    what `sgate fix` rewrites and what needs judgement, then by concept within each — so the
 *    reason, the remedy and the docs link are stated once per batch instead of once per finding, and
 *    an agent can work a whole concept in one pass.
 */
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
  if (budget === undefined) return document(result, groups, everything, budget)

  // Tried whole first. A complete report carries none of the bookkeeping a truncated one needs — no
  // omission list, no statement of the admission rule — so it can be *smaller* than the reservation
  // that would be set aside to truncate it. Without this, a budget in that band produced a larger
  // document than a generous budget did, and said findings were dropped when the complete report
  // would have fitted.
  const complete = document(result, groups, everything, budget)
  if (estimateTokens(complete) <= budget) return complete

  // The reservation is a *sizing* render: no finding admitted, every optional block present, and
  // every count printed at its widest. That makes it a true upper bound on the fixed sections rather
  // than an estimate of them — every real render is a subset of it — which is what keeps the
  // finished document inside the budget without a render-and-shrink loop.
  const reserved = estimateTokens(document(result, groups, new Set(), budget, { sizing: true, overBudget: true }))
  const shown = new Set<Finding>()
  let spent = 0
  for (const finding of rotation(groups)) {
    if (reserved + spent + finding.tokens > budget) continue
    shown.add(finding)
    spent += finding.tokens
  }

  return document(result, groups, shown, budget, { overBudget: reserved > budget })
}

/**
 * The order findings are admitted in when the budget cannot hold all of them: the first finding of
 * every group, then the second of every group, and so on.
 *
 * Round-robin rather than document order because the two answer different questions. Document order
 * spends a small budget entirely on the largest group — forty near-identical instances of one
 * concept — and tells the agent nothing about the other five. Rotation keeps one worked example per
 * concept for as long as the budget allows, which is what makes a truncated report still a usable
 * map of the repository rather than a detailed view of one corner of it.
 */
function rotation(groups: readonly Group[]): Finding[] {
  const ordered: Finding[] = []
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
      const text = renderFinding(diagnostic, { hoistedMessage: group.message, readSource })
      return { diagnostic, text, tokens: estimateTokens(text) }
    }),
  }))
}

function collectGroups(result: CheckResult, entries: readonly RuleEntry[]): GroupCore[] {
  const byRuleId = new Map(entries.map((entry) => [ruleRefKey(entry), entry]))

  const collected = new Map<string, Diagnostic[]>()
  for (const diagnostic of result.diagnostics) {
    const existing = collected.get(diagnostic.concept)
    if (existing) existing.push(diagnostic)
    else collected.set(diagnostic.concept, [diagnostic])
  }

  const groups: GroupCore[] = []
  for (const [concept, diagnostics] of collected) {
    const ruleIds = [...new Set(diagnostics.map((diagnostic) => diagnostic.ruleId))].sort(compareStrings)
    const rules = ruleIds.map((ruleId) => byRuleId.get(ruleId))
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
      ruleIds,
      severities,
      primarySeverity: SEVERITY_ORDER.find((severity) => severities.has(severity)) ?? 'info',
      files: new Set(diagnostics.map((diagnostic) => diagnostic.file ?? CONFIG_LOCATION)),
      docsUrl: diagnostics.find((diagnostic) => diagnostic.docsUrl !== undefined)?.docsUrl ?? null,
      why: curatedDescription(concept),
      message: hoistedMessage,
      help: uniformHelp ? (diagnostics[0]!.help ?? null) : null,
    })
  }

  return groups.sort(compareGroups)
}

/**
 * The tier to promise for a concept, or `null` for "this needs judgement".
 *
 * A missing entry is not "unknown, skip it": every `slop-gate/config.*` concept the orchestrator
 * emits itself has no `RuleEntry` at all, and those are among the largest groups on a real run. It
 * means the same thing to an agent as a declared `'none'` — nothing will rewrite this for you — so
 * both land on the judgement side.
 *
 * Arbitration elects one owning rule per concept, so `rules` has one element in every real run. The
 * fold is written for more anyway, and it fails *closed*: one unfixable rule makes the whole group
 * judgement. Over-promising is the expensive direction — an agent told `sgate fix` has a finding
 * covered will leave it alone, and nothing will ever come back for it.
 */
function groupTier(rules: readonly (RuleEntry | undefined)[]): FixKind | null {
  let highest: FixKind | null = null
  for (const rule of rules) {
    if (rule === undefined || rule.fixKind === 'none') return null
    if (highest === null || FIX_TIER_RANK[rule.fixKind] > FIX_TIER_RANK[highest]) highest = rule.fixKind
  }
  return highest
}

/**
 * Automated before judgement, because the first thing an agent has to know is which findings it must
 * not touch — a report that lists sixty hand-fixable findings before saying "and three of these are
 * the tool's" invites exactly the conflicting edit the split exists to prevent. Then most severe
 * first, then biggest batch first (the most leverage per decision), then the concept id so the order
 * is total.
 */
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

type FindingContext = {
  readonly hoistedMessage: string | null
  readonly readSource: (file: string) => string | null
}

function renderFinding(diagnostic: Diagnostic, context: FindingContext): string {
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

/**
 * The offending line, windowed around the finding when it is too long to print whole.
 *
 * A head truncation would be useless on the file this guard exists for — a generated or minified
 * line whose finding sits at column nine hundred — so the window is centred on the finding's own
 * column and both cut ends are marked. The marker is never omitted: a snippet that silently lost the
 * code it was pointing at is the same failure as a report that silently lost a finding.
 */
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

/**
 * The suggested change as a unified diff, for a finding that arrived carrying one.
 *
 * `applyEdits` and `unifiedDiff` are `sgate fix`'s own, not a second implementation: a diff shown
 * here that did not match what `sgate fix` would write would be worse than showing none. That is
 * also why a rejected edit set produces an explicit note rather than a silently missing diff —
 * `applyEdits` throws on an out-of-range or overlapping edit precisely so a caller cannot paper over
 * it, and a reporter swallowing that would hide a real defect in the engine that produced it.
 *
 * Emitted unindented so the block still pastes into `git apply`, which is the only reason to render
 * a diff rather than describe the edit.
 */
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
        ruleId: diagnostic.ruleId,
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
  /**
   * Print every count at its widest and include every optional block, so this render bounds any real
   * one. It changes only what is *printed* — the admitted set still decides which findings appear —
   * because a sizing pass that also changed control flow would stop bounding the thing it measures.
   */
  readonly sizing?: boolean
  /** The fixed sections alone estimate above the budget, which the report has to admit to. */
  readonly overBudget?: boolean
}

function document(
  result: CheckResult,
  groups: readonly Group[],
  shown: ReadonlySet<Finding>,
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
  // `durationMs`, `filesFromCache` and `enginesRun` are deliberately absent: they differ between two
  // runs over identical source, and this report's whole value as an agent input rests on being
  // byte-identical when the repository is.
  lines.push(`scope: ${result.stats.filesScanned} files scanned, ${result.stats.filesAnalysed} analysed`)

  lines.push(...incompletenessLines(result))
  // Said once, because the absence of a `why:` line on most groups would otherwise read as a bug in
  // this reporter rather than what it is: the registry generator names 801 concepts after the engine
  // rules it found and writes their descriptions mechanically, so those concepts have no rationale
  // to quote. Printing "Generated from oxlint's `x` rule. X." under a heading that promises to say
  // why a finding matters would be worse than printing nothing.
  const uncurated = groups.filter((group) => group.why === null).length
  if (uncurated > 0) {
    lines.push(
      `note: \`why:\` appears only where the concept has a curated rationale; ${uncurated} of ${groups.length} below are ` +
        'named after an engine rule and have none, so `docs:` is the authority for those.',
    )
  }
  lines.push('')
  lines.push(...coverageLines({ groups, shown, total, shownCount, omitted, gaps: gaps.length, budget, options }))

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

/**
 * Whether an absent engine actually cost this run anything.
 *
 * `displaced` is populated only where the engine would have *won* a concept it contests, so an empty
 * one means its absence changed no ownership at all — nothing went unchecked, nothing was downgraded.
 * Calling that INCOMPLETE would be crying wolf, and a report that says INCOMPLETE when nothing is
 * missing teaches its reader to skip the word on the run where something is.
 *
 * Exported because `sgate mcp` has to answer the same question in a second place — whether a tool
 * result may call itself complete — and a second copy of this one-liner is a second place for the
 * distinction to drift. One definition; the MCP layer's own tests then pin that its answer and this
 * reporter's agree on the same run.
 */
export const isCoverageGap = (engine: UnavailableEngine): boolean => engine.displaced.length > 0

/**
 * An engine that is registered but not installed here, under the same `INCOMPLETE:` prefix an engine
 * *failure* gets: the consequence for the reader is identical — part of the run did not happen — and
 * one grep-able token for "this report is partial" is worth more than a second vocabulary for the
 * second cause.
 *
 * The two sub-lines are the distinction an agent has to act on. A concept nothing else covers is
 * simply unverified; one a lower-ranked rule picked up *was* checked, just by the rule arbitration
 * would not have chosen. Collapsing them into "some things were missed" would leave an agent
 * unable to tell which findings it is entitled to trust.
 */
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

function incompletenessLines(result: CheckResult): string[] {
  const lines: string[] = []
  for (const failure of result.engineFailures) {
    lines.push(
      `INCOMPLETE: engine \`${failure.engine}\` failed — ${failure.message}. ` +
        `Nothing it would have reported appears below; do not read a clean section as clean.`,
    )
  }
  lines.push(...unavailableLines(result.unavailableEngines))
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
  readonly shown: ReadonlySet<Finding>
  readonly total: number
  readonly shownCount: number
  readonly omitted: number
  readonly gaps: number
  readonly budget: number | undefined
  readonly options: DocumentOptions
}

/**
 * The one block that must never be wrong, because everything downstream of this report is read on
 * the assumption that it is complete. It states the totals unconditionally — including on the run
 * where nothing was dropped, so "no omission notice" is never something the reader has to infer from
 * silence — and it names the admission rule, so an agent can tell what it is *not* looking at.
 */
function coverageLines(input: CoverageInput): string[] {
  const { total, budget, gaps } = input
  const sizing = input.options.sizing === true
  // Stated before the budget accounting, never after. A reader that takes only the first sentence of
  // the coverage line has to come away with the correction, not with the reassurance — and on a run
  // with no findings the reassurance is the entire rest of the sentence.
  const engines = `${gaps} engine${gaps === 1 ? '' : 's'} could not run (see INCOMPLETE above)`
  if (total === 0) {
    return [
      gaps === 0
        ? 'coverage: no findings. Nothing was omitted.'
        : `coverage: ${engines}, so this is not a clean result. No findings from what did run, and nothing was omitted.`,
    ]
  }

  // One line shape for every case, rather than a friendlier "all shown" phrasing when nothing was
  // dropped: the sizing render has to bound the real one, and a branch whose *shorter* count can
  // produce the *longer* sentence makes that impossible to guarantee by inspection.
  const shownCount = sizing ? total : input.shownCount
  const omitted = sizing ? total : input.omitted
  const scope = budget === undefined ? 'no --max-tokens set' : `--max-tokens ${budget}`
  const accounting = `${shownCount} of ${total} findings shown, ${omitted} omitted (${scope}).`
  const lines = [gaps === 0 ? `coverage: ${accounting}` : `coverage: ${engines}, so this is not the whole picture. ${accounting}`]
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
      // The third option an agent otherwise has to guess at. Deciding a finding is wrong is a real
      // outcome of exercising judgement, and the directive is the only way to record that decision
      // where the next run will see it — spelling it out here costs one line and stops an agent
      // either inventing a syntax or editing correct code to silence a false positive.
      `If one is a false positive, record that instead of changing the code: \`// ${DISABLE_DIRECTIVE} ` +
        '<concept> -- <reason>` on the line above it. The reason is required.',
    ]
  }

  const tiers = new Map<FixKind, number>()
  for (const group of groups) if (group.tier !== null) tiers.set(group.tier, (tiers.get(group.tier) ?? 0) + group.findings.length)
  const present = (['safe', 'suggested', 'unsafe'] as const).filter((tier) => tiers.has(tier))
  const highest = present.at(-1) ?? 'safe'
  const flag = highest === 'safe' ? 'sgate fix' : highest === 'suggested' ? 'sgate fix --suggest' : 'sgate fix --unsafe'

  const lines = [
    '## automated — `sgate fix` rewrites these. Do not edit them by hand.',
    `${scale}. Run: \`${flag}\``,
    `Tiers present: ${present.map((tier) => `${tier} ${tiers.get(tier)}`).join(', ')}. ` +
      'A tier is the registry\'s declared trust level for a rule\'s fix; plain `sgate fix` applies `safe` only, ' +
      '`--suggest` adds `suggested`, `--unsafe` adds both.',
  ]

  // Said when it is true, because the alternative reading is much worse. `sgate check` never asks an
  // engine to produce fix data — for oxlint that means re-running the binary once per rule per file
  // (spec §11.1), which is not work a plain check should do — so a finding here normally arrives with
  // no edit attached. An agent that saw a `tier unsafe` group and no diff would reasonably conclude
  // the tool could not work one out, and start editing.
  if (!groups.some((group) => group.findings.some((finding) => finding.diagnostic.fix !== undefined))) {
    lines.push(
      `No edit is shown below: \`sgate check\` does not derive fixes, because for some engines that means ` +
        `re-running them once per rule. \`${flag} --dry-run\` prints the exact diff without writing anything.`,
    )
  }

  return lines
}

function groupLines(group: Group, shown: ReadonlySet<Finding>, options: DocumentOptions): string[] {
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

  const lines = [`### ${group.concept} — ${facets.join(' · ')}`, `rule: ${group.ruleIds.join(', ')}`]
  if (group.why !== null) lines.push(`why: ${group.why}`)
  if (group.message !== null) lines.push(`message: ${group.message}`)
  if (group.help !== null) lines.push(`help: ${group.help}`)
  if (group.docsUrl !== null) lines.push(`docs: ${group.docsUrl}`)

  const kept = group.findings.filter((finding) => shown.has(finding))
  const shownHere = options.sizing === true ? group.findings.length : kept.length
  if (kept.length < group.findings.length) lines.push(`showing ${shownHere} of ${group.findings.length}`)
  if (options.sizing !== true) for (const finding of kept) lines.push(finding.text)

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

  // First, ahead of the findings work. Everything below is advice about what this report *contains*;
  // this is the one action that changes what the next report is able to contain at all, and an agent
  // that starts editing before it knows the report is partial is working from the wrong map.
  for (const engine of gaps) {
    const command = engine.install === undefined ? '' : ` (\`${engine.install}\`)`
    actions.push(
      `Make \`${engine.engine}\` runnable here${command} and re-run — ${engine.displaced.length} concept(s) went unchecked or to a lower-ranked rule.`,
    )
  }

  if (automated.length > 0) {
    const findings = automated.reduce((sum, group) => sum + group.findings.length, 0)
    const highest = (['safe', 'suggested', 'unsafe'] as const).filter((tier) => automated.some((group) => group.tier === tier)).at(-1) ?? 'safe'
    const flag = highest === 'safe' ? 'sgate fix' : highest === 'suggested' ? 'sgate fix --suggest' : 'sgate fix --unsafe'
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
