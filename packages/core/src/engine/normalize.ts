import type { GeneratedPolicy, RuleLevel } from '../config/types.ts'
import { fingerprint, normalizedWindow } from '../diagnostics/fingerprint.ts'
import { createLineIndex, type LineIndex } from '../diagnostics/position.ts'
import type { Diagnostic, Fix, Severity } from '../diagnostics/types.ts'
import { isGeneratedPath } from '../discovery/generated.ts'
import { detectLanguage } from '../discovery/language.ts'
import { isOwned, owningEngines, type OwnerMap } from '../registry/ownership.ts'
import { ruleRefKey, type EngineId, type RuleEntry } from '../registry/types.ts'
import { applySuppressions } from '../suppressions/apply.ts'
import { parseSuppressions, type SuppressionDirective } from '../suppressions/parse.ts'
import type { RawDiagnostic } from './types.ts'

export type NormalizeInput = {
  engine: EngineId
  raws: readonly RawDiagnostic[]
  entries: readonly RuleEntry[]
  owners: OwnerMap
  sourceOf: (file: string) => string
  levelOf: (concept: string) => RuleLevel | undefined
  /**
   * Files to scan for inline suppression directives even if no raw diagnostic in `raws` touches
   * them. Without this, a file the engine reports nothing for would never appear via `raws` at all
   * (see `byRuleId`/the main loop below, which only ever learns about a file from a raw finding) —
   * and that is exactly the file most likely to hold a *stale* suppression comment: the code was
   * fixed, the finding stopped, the `sgate-disable-*` comment was not removed. `run/check.ts` passes
   * the one file it is currently processing here unconditionally, whether or not that file produced
   * any raw diagnostics this run.
   */
  suppressionScanFiles?: readonly string[]
  /**
   * `'skip'` (the default) marks every finding in a machine-written file suppressed. Threaded in
   * rather than read from config here because this function takes no config — `run/check.ts` passes
   * the resolved value, and a caller that wants the raw truth passes `'check'`.
   */
  generated?: GeneratedPolicy
}

export const LEVEL_TO_SEVERITY: Readonly<Record<Exclude<RuleLevel, 'off'>, Severity>> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
}

export function normalizeDiagnostics(input: NormalizeInput): Diagnostic[] {
  const byRuleId = new Map(
    input.entries.filter((entry) => entry.engine === input.engine).map((entry) => [entry.engineRuleId, entry]),
  )

  const skipGenerated = (input.generated ?? 'skip') === 'skip'
  const lineIndexes = new Map<string, LineIndex>()
  const sources = new Map<string, string>()
  const occurrences = new Map<string, number>()
  const diagnostics: Diagnostic[] = []

  const ensureSource = (file: string): string => {
    let source = sources.get(file)
    if (source === undefined) {
      source = input.sourceOf(file)
      sources.set(file, source)
      lineIndexes.set(file, createLineIndex(source))
    }
    return source
  }

  for (const raw of input.raws) {
    const entry = byRuleId.get(raw.engineRuleId)
    if (entry === undefined) continue

    const concept = classify(entry, raw.message)
    // `language` is what makes this exact rather than approximate: a rule that won this concept
    // for `ts` and lost it for `vue` owns it *somewhere*, and without the language this check
    // would keep its `vue` findings — the double reporting arbitration exists to prevent.
    // Derived from the path rather than plumbed through, because that is precisely how the
    // inventory assigned it in the first place, and a project engine may report against a file
    // that was never in its own batch.
    const language = detectLanguage(raw.file)
    if (!isOwned(input.owners, { concept, engine: input.engine, engineRuleId: raw.engineRuleId, language })) continue

    const level = input.levelOf(concept)
    if (level === 'off') continue
    const severity = level === undefined ? entry.severityDefault : LEVEL_TO_SEVERITY[level]

    // Called for its side effect: it is what populates `sources` (read by the suppression pass below,
    // which must see every file this engine touched) and `lineIndexes`.
    ensureSource(raw.file)
    const lineIndex = lineIndexes.get(raw.file)!

    const start = lineIndex.positionAt(raw.range.start)
    const end = lineIndex.positionAt(raw.range.end)

    // Keyed on the window as well as the concept and the file, which is what spec §10.1 says this
    // index is for ("disambiguates identical windows within one file") and what makes a fingerprint
    // independent of the order an engine emitted its findings in — see `FingerprintInput`.
    const window = normalizedWindow(lineIndex, raw.range)
    const occurrenceKey = `${concept}\0${raw.file}\0${window}`
    const occurrenceIndex = occurrences.get(occurrenceKey) ?? 0
    occurrences.set(occurrenceKey, occurrenceIndex + 1)

    diagnostics.push({
      concept,
      ruleId: ruleRefKey({ engine: input.engine, engineRuleId: raw.engineRuleId }),
      engine: input.engine,
      severity,
      message: raw.message,
      file: raw.file,
      range: raw.range,
      position: {
        startLine: start.line,
        startColumn: start.column,
        endLine: end.line,
        endColumn: end.column,
      },
      ...(raw.help === undefined ? {} : { help: raw.help }),
      ...fixOf(entry, raw),
      docsUrl: raw.docsUrl ?? entry.docsUrl,
      fingerprint: fingerprint({ concept, file: raw.file, window, occurrenceIndex }),
      // Suppressed rather than skipped, so the finding still reaches the per-file cache entry and a
      // later `--show-suppressed` can surface it. Marked here rather than filtered in `run/check.ts`
      // because this is where the file is already known, exactly as `detectLanguage` above is.
      // `applySuppressions` below may overwrite this with `by: 'inline'` if a human also silenced the
      // line, which is the better of the two explanations and so the right one to keep.
      ...(skipGenerated && isGeneratedPath(raw.file)
        ? { suppressed: { by: 'generated' as const, reason: 'the file is generated, so the fix would not survive' } }
        : {}),
    })
  }

  // Inline suppressions (design spec §6.3). This has to run here, not in a later pass over the
  // aggregated result: unused-suppression detection needs to know which diagnostics actually fired
  // in this file, and this is the one place that already has both the diagnostics *and* each file's
  // source and line index. `run/check.ts` caches whatever this function returns per file, so folding
  // suppression handling in here is also what makes `config.unused-suppression` survive a cache hit
  // (see that module's own comment) — a later, separate pass would not be part of the cached array.
  for (const file of input.suppressionScanFiles ?? []) ensureSource(file)

  const byFile = new Map<string, Diagnostic[]>()
  for (const diagnostic of diagnostics) {
    // Every diagnostic built by the loop above came from a `RawDiagnostic`, whose `file` is a
    // required `string` (`engine/types.ts`) copied straight through — `Diagnostic.file`'s wider
    // `string | null` only accounts for the orchestrator-level diagnostics `run/check.ts` builds
    // itself (`configDiagnostics`, attributed to `file: null` when there is no config file), never
    // anything this function produces. The guard exists to narrow the type, not to handle a real case.
    const file = diagnostic.file
    if (file === null) continue
    const existing = byFile.get(file)
    if (existing) existing.push(diagnostic)
    else byFile.set(file, [diagnostic])
  }
  // A file named only via `suppressionScanFiles` (the engine reported nothing for it) still needs a
  // group — with zero diagnostics — so the loop below still parses its source for directives. That
  // empty-findings file is exactly where a *stale* suppression comment survives: the code that used
  // to trigger it was fixed, the finding stopped, the `sgate-disable-*` comment was not removed.
  for (const file of sources.keys()) if (!byFile.has(file)) byFile.set(file, [])

  const replacements = new Map<Diagnostic, Diagnostic>()
  const synthetic: Diagnostic[] = []

  for (const [file, fileDiagnostics] of byFile) {
    const source = sources.get(file)!
    const directives = parseSuppressions(source)
    if (directives.length === 0) continue // overwhelmingly common case; skip the rest for free.

    const applied = applySuppressions(directives, fileDiagnostics)
    fileDiagnostics.forEach((original, index) => replacements.set(original, applied.diagnostics[index]!))

    const lineIndex = lineIndexes.get(file)!
    for (const directive of applied.unused) {
      if (!judgedBy(directive, input.engine, input.owners)) continue
      const built = suppressionDiagnostic({
        concept: 'config.unused-suppression',
        directive,
        file,
        lineIndex,
        levelOf: input.levelOf,
        occurrences,
        ...unusedSuppressionMessage(directive),
      })
      if (built) synthetic.push(built)
    }
    for (const directive of applied.missingReason) {
      const built = suppressionDiagnostic({
        concept: 'config.suppression-missing-reason',
        directive,
        file,
        lineIndex,
        levelOf: input.levelOf,
        occurrences,
        ...missingReasonMessage(),
      })
      if (built) synthetic.push(built)
    }
  }

  const withMarkers = diagnostics.map((diagnostic) => replacements.get(diagnostic) ?? diagnostic)
  return [...withMarkers, ...synthetic]
}

/**
 * Whether *this* engine's view of a file is entitled to call a directive unused.
 *
 * This function runs once per (engine, file), and it only ever sees one engine's diagnostics — so
 * "no diagnostic here matched the directive" means "not from me", not "not from anyone". With one
 * file-granularity engine those were the same statement. With two they are not, and the difference
 * is user-visible on the exact comment the documentation tells people to write: a
 * `disable-next-line` naming `slop.double-cast` correctly suppresses ast-grep's finding *and* is
 * reported as an unused suppression by oxlint's pass over the same file, which never had a
 * `slop.double-cast` diagnostic to suppress. Reproduced before this guard existed.
 *
 * Ownership is the available answer: `owners` is the election result, so an engine that does not own
 * any of a directive's targets could never have produced a diagnostic for it and has no opinion
 * worth reporting. Two deliberate exceptions —
 *
 * - **Targets nobody owns.** A directive naming a concept no participating engine covers can never
 *   match anything and is exactly the dead suppression this concept exists for, so every engine
 *   reports it and `run/check.ts` collapses the duplicates.
 * - **A bare directive** (a `disable-next-line` with a reason and no targets) suppresses every
 *   concept, so no engine can be excluded on ownership grounds. It is still judged by all of them,
 *   and two engines that disagree still produce one spurious finding — the residual gap, recorded in
 *   the M0 follow-ups, and not reachable from any escape this repository documents, all of which
 *   name their target.
 */
function judgedBy(directive: SuppressionDirective, engine: EngineId, owners: OwnerMap): boolean {
  if (directive.targets.length === 0) return true
  // A target is either a concept id (`slop.double-cast`, resolved through the election) or a rule id
  // (`oxlint/no-shadow`, whose first segment names the engine directly) — `directiveMatches` accepts
  // both, so both have to resolve to an engine here or the rule-id spelling keeps the bug.
  // One list of owning engines per target, because a concept split across languages has more than
  // one owner and any of them is reason enough for this engine to have an opinion.
  const engines = directive.targets.map((target) =>
    target.includes('/') ? [target.slice(0, target.indexOf('/'))] : owningEngines(owners, target),
  )
  return engines.some((owners_) => owners_.includes(engine)) || engines.every((owners_) => owners_.length === 0)
}

/**
 * Attaches an engine's fix to a diagnostic, with the registry — not the engine — deciding its tier.
 *
 * `RuleEntry.fixKind` is the single declared trust level for a rule's fix (D7), the thing
 * `sgate rules` shows a user and the thing `sgate fix --safe` gates on. So a rule the registry calls
 * unfixable has its edits **dropped**, not promoted to some default tier: the alternative is an
 * adapter being able to apply a rewrite that no reviewable, committed file ever authorised. In
 * practice this fires when an engine's own fix metadata is ahead of a regenerated registry, and the
 * fail-safe direction is to offer the fix on the next regeneration rather than before it.
 *
 * An empty `edits` array is dropped too — a fix that changes nothing is not a fix, and letting one
 * through would have the fix loop count a file as changed and re-run every engine over it forever.
 */
function fixOf(entry: RuleEntry, raw: RawDiagnostic): { fix: Fix } | Record<string, never> {
  if (raw.fix === undefined || entry.fixKind === 'none' || raw.fix.edits.length === 0) return {}
  return {
    fix: {
      kind: entry.fixKind,
      description: raw.fix.description ?? `Apply the ${entry.engineRuleId} fix.`,
      edits: raw.fix.edits.map((edit) => ({ range: { ...edit.range }, replacement: edit.replacement })),
    },
  }
}

function classify(entry: RuleEntry, message: string): string {
  if (entry.concepts.length === 1) return entry.concepts[0]!
  for (const rule of entry.classify ?? []) {
    if (new RegExp(rule.messagePattern).test(message)) return rule.concept
  }
  return entry.concepts[0]!
}

/**
 * Builds a `config.unused-suppression` or `config.suppression-missing-reason` diagnostic from a
 * directive, exactly the way `run/check.ts`'s `configDiagnostics` builds `config.rule-overlap` and
 * `config.dead-override` from an election result: same `slop-gate/<concept>` rule id convention,
 * same "no level resolved at all means don't emit" rule (there is no `RuleEntry.severityDefault` to
 * fall back to for a concept no engine rule backs — see `ConceptDefinition.servicedBySlopGate`).
 */
function suppressionDiagnostic(params: {
  concept: string
  directive: SuppressionDirective
  file: string
  lineIndex: LineIndex
  levelOf: (concept: string) => RuleLevel | undefined
  occurrences: Map<string, number>
  message: string
  help: string
}): Diagnostic | null {
  const level = params.levelOf(params.concept)
  if (level === undefined || level === 'off') return null

  const range = params.lineIndex.rangeOfLine(params.directive.line)
  const start = params.lineIndex.positionAt(range.start)
  const end = params.lineIndex.positionAt(range.end)

  const window = normalizedWindow(params.lineIndex, range)
  const occurrenceKey = `${params.concept}\0${params.file}\0${window}`
  const occurrenceIndex = params.occurrences.get(occurrenceKey) ?? 0
  params.occurrences.set(occurrenceKey, occurrenceIndex + 1)

  return {
    concept: params.concept,
    ruleId: `slop-gate/${params.concept}`,
    engine: 'slop-gate',
    severity: LEVEL_TO_SEVERITY[level],
    message: params.message,
    file: params.file,
    range,
    position: { startLine: start.line, startColumn: start.column, endLine: end.line, endColumn: end.column },
    help: params.help,
    docsUrl: `https://slop-gate.dev/concepts/${params.concept}`,
    fingerprint: fingerprint({ concept: params.concept, file: params.file, window, occurrenceIndex }),
  }
}

function unusedSuppressionMessage(directive: SuppressionDirective): { message: string; help: string } {
  const scope = directive.appliesToLine === null ? 'in this file' : 'on this line'
  const targets = directive.targets.length === 0 ? '' : ` for ${directive.targets.map((target) => `\`${target}\``).join(', ')}`
  return {
    message: `This suppression${targets} does not match any diagnostic ${scope}.`,
    help: 'Remove the suppression, or fix its target so it matches again.',
  }
}

function missingReasonMessage(): { message: string; help: string } {
  return {
    message: 'This suppression has no reason. Add one so a future reader knows why the finding is safe to ignore.',
    help: 'Append `-- reason` after the directive (and its targets, if any) — e.g. `-- see #482`.',
  }
}
