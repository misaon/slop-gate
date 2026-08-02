import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { explainConcept, resolveRun, ruleRefKey, RULE_ENTRIES, runCheck, runFix, type FixTier } from '@misaon/slop-gate-core'
import { createAgentReporter, renderRulesWhyPretty, summariseAgentGroups } from '@misaon/slop-gate-reporters'
import { z } from 'zod'
import { DEFAULT_CONFIG, loadCliConfig, type CliConfig } from '../../config.ts'
import { defaultEngines } from '../../engines.ts'
import { checkOutcome, coverageGaps } from './coverage.ts'
import { resolveToolRoot } from './root.ts'

/**
 * The report is bounded by default, unlike `sgate check --format agent`, which is not.
 *
 * The divergence is the destination. A CLI's stdout goes to a terminal that scrolls; a tool result
 * goes straight into a model's context window, and a first call against an unfamiliar repository
 * should not be able to spend all of it. The bound is safe to apply silently only because the report
 * is not silent about it: the `coverage:` block states the budget, lists the omitted count per
 * concept, and `concepts` below carries every true count regardless.
 */
const DEFAULT_MAX_TOKENS = 25_000

const rootDirArg = z
  .string()
  .optional()
  .describe(
    'Repository to analyse. Defaults to the directory this server was started in, and must be inside it — ' +
      'start a second server elsewhere to analyse a different repository.',
  )

export type ToolContext = {
  /** The directory the server process was started in. The boundary every `rootDir` is resolved against. */
  readonly serverRoot: string
  readonly version: string
  readonly signal?: AbortSignal
}

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

const failure = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true })

type OpenedRun =
  | { readonly kind: 'ok'; readonly rootDir: string; readonly loaded: Exclude<CliConfig, { kind: 'error' }> }
  | { readonly kind: 'failed'; readonly result: ToolResult }

/**
 * Everything the three tools need before they diverge: a root they are allowed to look at, and a
 * configuration that loaded.
 *
 * Both failures are tool execution errors rather than JSON-RPC errors. They are exactly the class
 * the spec reserves `isError` for — something the caller can read, understand and correct — where a
 * protocol error would reach the model as a transport fault it has no way to act on.
 */
async function open(args: { rootDir?: string | undefined }, context: ToolContext): Promise<OpenedRun> {
  const root = resolveToolRoot(context.serverRoot, args.rootDir)
  if (root.kind === 'refused') return { kind: 'failed', result: failure(root.message) }

  const loaded = await loadCliConfig(root.rootDir, DEFAULT_CONFIG)
  if (loaded.kind === 'error') return { kind: 'failed', result: failure(`slop-gate could not load its configuration.\n${loaded.message}`) }
  return { kind: 'ok', rootDir: root.rootDir, loaded }
}

const enginesFor = (rootDir: string, loaded: Exclude<CliConfig, { kind: 'error' }>) =>
  defaultEngines(rootDir, loaded.kind === 'loaded' ? loaded.configFile : undefined)

const configFileOf = (loaded: Exclude<CliConfig, { kind: 'error' }>) =>
  loaded.kind === 'loaded' ? { configFile: loaded.configFile } : {}

// --- check ---------------------------------------------------------------------------------------

export const CHECK_INPUT = z.object({
  rootDir: rootDirArg,
  maxTokens: z
    .int()
    .positive()
    .optional()
    .describe(`Bound the report to roughly this many tokens. Defaults to ${DEFAULT_MAX_TOKENS}. Omissions are always stated in the report.`),
})

export const CHECK_OUTPUT = z.object({
  outcome: z
    .enum(['clean', 'findings', 'incomplete', 'incomplete-with-findings'])
    .describe(
      'There is no value meaning "nothing found" on its own: a run that could not check everything is ' +
        '`incomplete` or `incomplete-with-findings` even with an empty findings list. Never read a zero count as a pass ' +
        'without reading this.',
    ),
  complete: z.boolean().describe('False when anything below reduced coverage. `gaps` says what.'),
  gaps: z
    .array(
      z.object({
        kind: z.enum(['engine-failed', 'engine-unavailable']),
        engine: z.string().optional(),
        detail: z.string(),
        remedy: z.string().optional(),
        concepts: z.array(z.string()),
      }),
    )
    .describe('What stopped this run seeing everything. Empty on a complete run, and required, so its absence is never inferred from silence.'),
  counts: z.object({ error: z.int(), warn: z.int(), info: z.int() }),
  concepts: z
    .array(
      z.object({
        concept: z.string(),
        section: z.enum(['automated', 'judgement']),
        tier: z.enum(['safe', 'suggested', 'unsafe']).nullable(),
        severity: z.enum(['error', 'warn', 'info']),
        findings: z.int(),
        files: z.int(),
        ruleIds: z.array(z.string()),
        docsUrl: z.string().nullable(),
      }),
    )
    .describe(
      'Every concept the run found, with its *true* finding count even when the token budget dropped all of its ' +
        'detail from the report text. `section: automated` means `sgate fix` rewrites it — do not edit those by hand.',
    ),
  filesScanned: z.int(),
  filesAnalysed: z.int(),
  uncoveredConcepts: z
    .array(z.string())
    .describe(
      'Enabled concepts no engine in this run can check. Not counted as a gap and not reflected in `outcome`: an ' +
        'optional engine that is registered but absent puts every concept it owns here even when the repository ' +
        'contains no file it would have looked at. `gaps` is the authority on whether coverage was actually lost.',
    ),
  unknownConfigKeys: z.int().describe('Config rule keys naming nothing. Not a coverage gap, but a rule you think is on may not be.'),
  reportTruncated: z.boolean().describe('True when the token budget omitted per-finding detail. `concepts` is unaffected.'),
})

export async function callCheck(args: z.infer<typeof CHECK_INPUT>, context: ToolContext): Promise<ToolResult> {
  const opened = await open(args, context)
  if (opened.kind === 'failed') return opened.result
  const { rootDir, loaded } = opened

  const maxTokens = args.maxTokens ?? DEFAULT_MAX_TOKENS
  const result = await runCheck({
    rootDir,
    config: loaded.config,
    ...configFileOf(loaded),
    engines: enginesFor(rootDir, loaded),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  })

  // The `agent` reporter, rendered verbatim — not a second format for the same data. Everything that
  // makes that report safe to act on (the INCOMPLETE block, `coverage:` leading with the correction,
  // the automated/judgement split, `nextActions`) is a property of this renderer, and re-deriving any
  // of it here would be re-deriving the part that matters.
  let report = ''
  createAgentReporter({
    write: (chunk) => (report += chunk),
    color: false,
    unicode: true,
    width: 100,
    version: context.version,
    maxTokens,
    readSource: (file) => {
      if (file === null) return null
      try {
        return readFileSync(join(rootDir, file), 'utf8')
      } catch {
        return null
      }
    },
  }).onEvent({ type: 'done', result })

  const gaps = coverageGaps(result)
  return {
    content: [{ type: 'text', text: report }],
    structuredContent: {
      outcome: checkOutcome(result, gaps),
      complete: gaps.length === 0,
      gaps,
      counts: result.counts,
      concepts: summariseAgentGroups(result),
      filesScanned: result.stats.filesScanned,
      filesAnalysed: result.stats.filesAnalysed,
      uncoveredConcepts: result.ruleset.uncovered,
      unknownConfigKeys: result.ruleset.unknownKeys.length,
      // Read off the report the caller is actually being handed, not predicted from the budget: the
      // reporter tries the complete document first and prints it whole when it fits, so a budget
      // being set is not the same fact as something having been dropped.
      reportTruncated: report.includes('\nomitted:\n'),
    },
  }
}

// --- explain_concept -----------------------------------------------------------------------------

export const EXPLAIN_INPUT = z.object({
  concept: z.string().describe('Concept id, e.g. `dead-code.unused-variable` — the `concept` field of a finding, not its `ruleId`.'),
  rootDir: rootDirArg,
})

export const EXPLAIN_OUTPUT = z.object({
  concept: z.string(),
  known: z.boolean().describe('False for a concept id this catalogue has never heard of. Everything below is then empty.'),
  enabled: z.boolean(),
  level: z.string().nullable(),
  servicedBySlopGate: z.boolean().describe('True for a concept the orchestrator emits itself. No engine rule will ever own it.'),
  owners: z.array(z.object({ ruleId: z.string(), languages: z.array(z.string()) })),
  uncovered: z.boolean().describe('Enabled, but nothing in this run can check it.'),
  displacedBy: z
    .array(z.object({ ruleId: z.string(), insteadOwnedBy: z.string().nullable() }))
    .describe('Ownership an absent engine would have taken. Non-empty means a better owner is one install away.'),
  suppressedCandidates: z
    .array(z.object({ ruleId: z.string(), lostTo: z.string(), reason: z.string() }))
    .describe('Rules that also declare this concept and lost arbitration. Not a problem — this is what stops double reporting.'),
})

/**
 * Every finding carries both a `concept` and a `ruleId`, and only one of them is the argument here.
 * Handing the wrong one over is the single most likely misuse of this tool, so it is answered rather
 * than refused: the registry already knows which concepts a rule declares, and saying so costs one
 * lookup and turns a dead end into a retry the model can make on its own.
 */
function conceptsForRuleId(candidate: string): string[] {
  return RULE_ENTRIES.filter((entry) => ruleRefKey(entry) === candidate).flatMap((entry) => [...entry.concepts])
}

export async function callExplain(args: z.infer<typeof EXPLAIN_INPUT>, context: ToolContext): Promise<ToolResult> {
  const opened = await open(args, context)
  if (opened.kind === 'failed') return opened.result
  const { rootDir, loaded } = opened

  const asRule = conceptsForRuleId(args.concept)
  if (asRule.length > 0) {
    return failure(
      `\`${args.concept}\` is a rule id, not a concept id. That rule declares: ${asRule.join(', ')}. ` +
        'Call this tool again with one of those.',
    )
  }

  // `resolveRun`, not `runCheck`: this answers a question about arbitration, and spawning oxlint to
  // answer it would make the cheapest tool here the slowest. No engine is ever invoked.
  const resolved = await resolveRun({
    rootDir,
    config: loaded.config,
    ...configFileOf(loaded),
    engines: enginesFor(rootDir, loaded),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  })
  const why = explainConcept(args.concept, resolved)

  let text = ''
  renderRulesWhyPretty(why, {
    write: (chunk) => (text += chunk),
    color: false,
    unicode: true,
    width: 100,
    version: context.version,
  })

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      concept: why.concept,
      known: why.isKnownConcept,
      enabled: why.enablement.enabled,
      level: why.enablement.enabled ? why.enablement.level : null,
      servicedBySlopGate: why.servicedBySlopGate,
      owners: why.ownership.map((entry) => ({ ruleId: ruleRefKey(entry.owner), languages: [...entry.languages] })),
      uncovered: why.uncovered,
      displacedBy: why.displaced.map((entry) => ({
        ruleId: ruleRefKey(entry.wouldOwn),
        insteadOwnedBy: entry.insteadOwnedBy === undefined ? null : ruleRefKey(entry.insteadOwnedBy),
      })),
      suppressedCandidates: why.suppressed.map((entry) => ({
        ruleId: ruleRefKey(entry.suppressed),
        lostTo: ruleRefKey(entry.winner),
        reason: entry.reason,
      })),
    },
    // An unknown concept id is a typo, and the same class of mistake as passing a rule id above. Left
    // as a success it reads as "the concept exists and is quiet", which is the one answer that is
    // both wrong and reassuring.
    ...(why.isKnownConcept ? {} : { isError: true }),
  }
}

// --- propose_fixes -------------------------------------------------------------------------------

export const PROPOSE_INPUT = z.object({
  rootDir: rootDirArg,
  tier: z
    .enum(['safe', 'suggested', 'unsafe'])
    .optional()
    .describe(
      'Highest trust level of fix to propose. Defaults to `safe`, which is what plain `sgate fix` applies. ' +
        '`suggested` and `unsafe` widen the proposal; they do not make it apply.',
    ),
})

export const PROPOSE_OUTPUT = z.object({
  applied: z
    .literal(false)
    .describe('Always false. This tool never writes. Run `sgate fix` yourself, from a shell, to apply anything below.'),
  tier: z.enum(['safe', 'suggested', 'unsafe']),
  command: z.string().describe('The shell command that would apply exactly these edits.'),
  files: z.array(z.object({ file: z.string(), edits: z.int(), rules: z.array(z.string()), diff: z.string() })),
  initialFindings: z.int(),
  fixable: z.object({ safe: z.int(), suggested: z.int(), unsafe: z.int() }),
  skipped: z.object({ aboveTier: z.int(), outsideInventory: z.int(), overlap: z.int(), outOfRange: z.int() }),
  onePassOnly: z
    .boolean()
    .describe('True whenever a proposal was produced: a dry run sees one pass, and a real `sgate fix` iterates further.'),
  oscillations: z.array(z.string()),
  refusal: z.object({ reason: z.string(), message: z.string() }).nullable(),
})

const TIER_FLAG: Readonly<Record<FixTier, string>> = { safe: 'sgate fix', suggested: 'sgate fix --suggest', unsafe: 'sgate fix --unsafe' }

export async function callPropose(args: z.infer<typeof PROPOSE_INPUT>, context: ToolContext): Promise<ToolResult> {
  const opened = await open(args, context)
  if (opened.kind === 'failed') return opened.result
  const { rootDir, loaded } = opened

  const tier: FixTier = args.tier ?? 'safe'
  // `dryRun: true` is not a default here, it is the only value. See the module doc on `mcp/index.ts`
  // for why there is no argument that turns it off.
  const result = await runFix({
    rootDir,
    config: loaded.config,
    ...configFileOf(loaded),
    engines: enginesFor(rootDir, loaded),
    tier,
    dryRun: true,
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  })

  const command = TIER_FLAG[result.tier]
  const lines: string[] = []
  if (result.refusal !== undefined) {
    lines.push(`slop-gate could not work out a proposal: ${result.refusal.message}`)
  } else if (result.files.length === 0) {
    lines.push(`No fix is available at the \`${result.tier}\` tier.`)
  } else {
    lines.push(`${result.files.length} file(s) would change. Nothing has been written — run \`${command}\` to apply this.`)
    lines.push('')
    for (const file of result.files) lines.push(file.diff)
  }
  lines.push('')
  lines.push(
    `${result.initial.findings} finding(s) on the first pass; fixable: ${result.initial.withFix.safe} safe, ` +
      `${result.initial.withFix.suggested} suggested, ${result.initial.withFix.unsafe} unsafe.`,
  )
  if (result.refusal === undefined) {
    lines.push('This is one pass. A real `sgate fix` re-runs the engines on the changed files and may apply more.')
  }
  for (const oscillation of result.oscillations) lines.push(`config.fix-oscillation: ${oscillation.message}`)

  return {
    content: [{ type: 'text', text: `${lines.join('\n')}\n` }],
    structuredContent: {
      applied: false,
      tier: result.tier,
      command,
      files: result.files.map((file) => ({ file: file.file, edits: file.edits, rules: [...file.rules], diff: file.diff })),
      initialFindings: result.initial.findings,
      fixable: result.initial.withFix,
      skipped: result.skipped,
      onePassOnly: result.refusal === undefined,
      oscillations: result.oscillations.map((diagnostic) => diagnostic.message),
      refusal: result.refusal === undefined ? null : { reason: result.refusal.reason, message: result.refusal.message },
    },
    ...(result.refusal === undefined ? {} : { isError: true }),
  }
}
