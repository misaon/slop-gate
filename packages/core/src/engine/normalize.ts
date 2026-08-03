import type { GeneratedPolicy, RuleLevel } from '../config/types.ts'
import { fingerprint, normalizedWindow } from '../diagnostics/fingerprint.ts'
import { createLineIndex, type LineIndex } from '../diagnostics/position.ts'
import type { Diagnostic, Fix, Severity } from '../diagnostics/types.ts'
import { isGeneratedPath } from '../discovery/detect-generated.ts'
import { detectLanguage } from '../discovery/language.ts'
import { isOwned, owningEngines, type OwnerMap } from '../registry/ownership.ts'
import { parseRuleRefKey, ruleRefKey, type EngineId, type RuleEntry } from '../registry/types.ts'
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
  /** Files to scan for inline suppression directives even if no raw diagnostic touches them. Without
   *  this, a file the engine reports nothing for never appears at all — and that is exactly the file
   *  most likely to hold a *stale* suppression comment: the code was fixed, the finding stopped, the
   *  `sgate-disable-*` comment was not removed. `run/check.ts` passes the one file it is currently
   *  processing, whether or not that file produced any raw diagnostics. */
  suppressionScanFiles?: readonly string[]
  /** `'skip'` (the default) marks every finding in a machine-written file suppressed. Threaded in
   *  rather than read from config because this function takes no config — `run/check.ts` passes the
   *  resolved value, and a caller that wants the raw truth passes `'check'`. */
  generated?: GeneratedPolicy
}

export const LEVEL_TO_SEVERITY: Readonly<Record<Exclude<RuleLevel, 'off'>, Severity>> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
}

export function normalizeDiagnostics(input: NormalizeInput): Diagnostic[] {
  const byEngineRuleId = new Map(
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
    const entry = byEngineRuleId.get(raw.engineRuleId)
    if (entry === undefined) continue

    const concept = classify(entry, raw.message)
    // `language` is what makes this exact rather than approximate: a rule that won this concept for
    // `ts` and lost it for `vue` owns it *somewhere*, and without the language this check would keep
    // its `vue` findings — the double reporting arbitration exists to prevent. Derived from the path
    // rather than plumbed through, because a project engine may report against a file that was never
    // in its own batch.
    const language = detectLanguage(raw.file)
    if (!isOwned(input.owners, { concept, engine: input.engine, engineRuleId: raw.engineRuleId, language })) continue

    const level = input.levelOf(concept)
    if (level === 'off') continue
    const severity = level === undefined ? entry.severityDefault : LEVEL_TO_SEVERITY[level]

    // Called for its side effect: populates `sources`, which the suppression pass below reads and which
    // must name every file this engine touched.
    ensureSource(raw.file)
    const lineIndex = lineIndexes.get(raw.file)!

    const start = lineIndex.positionAt(raw.range.start)
    const end = lineIndex.positionAt(raw.range.end)

    // Keyed on the window as well as the concept and the file (spec §10.1: "disambiguates identical
    // windows within one file"), which makes a fingerprint independent of the order findings arrived in.
    const window = normalizedWindow(lineIndex, raw.range)
    const occurrenceKey = `${concept}\0${raw.file}\0${window}`
    const occurrenceIndex = occurrences.get(occurrenceKey) ?? 0
    occurrences.set(occurrenceKey, occurrenceIndex + 1)

    diagnostics.push({
      concept,
      ruleRefKey: ruleRefKey({ engine: input.engine, engineRuleId: raw.engineRuleId }),
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
      // Suppressed rather than skipped, so the finding still reaches the per-file cache entry. Marked
      // here rather than filtered in `run/check.ts` because this is where the file is already known.
      // `applySuppressions` below may overwrite it with `by: 'inline'`, the better explanation of two.
      ...(skipGenerated && isGeneratedPath(raw.file)
        ? { suppressed: { by: 'generated' as const, reason: 'the file is generated, so the fix would not survive' } }
        : {}),
    })
  }

  // Inline suppressions (design spec §6.3). This has to run here, not in a later pass over the
  // aggregated result: unused-suppression detection needs the diagnostics that actually fired in this
  // file plus its source and line index, and `run/check.ts` caches whatever this function returns per
  // file — so folding it in here is also what makes `config.unused-suppression` survive a cache hit.
  for (const file of input.suppressionScanFiles ?? []) ensureSource(file)

  const byFile = new Map<string, Diagnostic[]>()
  for (const diagnostic of diagnostics) {
    // Every diagnostic built above copies `RawDiagnostic.file`, a required `string`; `Diagnostic.file`
    // is wider only for the orchestrator-level diagnostics `run/check.ts` builds itself, attributed to
    // `file: null`. The guard exists to narrow the type, not to handle a real case.
    const file = diagnostic.file
    if (file === null) continue
    const existing = byFile.get(file)
    if (existing) existing.push(diagnostic)
    else byFile.set(file, [diagnostic])
  }
  // A file named only via `suppressionScanFiles` still needs a group — with zero diagnostics — so the
  // loop below parses its source for directives anyway (see `suppressionScanFiles`).
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
 * This runs once per (engine, file) and only ever sees one engine's diagnostics, so "no diagnostic
 * here matched the directive" means "not from me", not "not from anyone". With two file-granularity
 * engines that difference is user-visible on the exact comment the documentation tells people to
 * write: a `disable-next-line` naming `slop.double-cast` correctly suppresses ast-grep's finding *and*
 * is reported unused by oxlint's pass over the same file. Reproduced before this guard existed.
 *
 * Ownership is the available answer — an engine that owns none of a directive's targets could never
 * have produced a diagnostic for it. Two deliberate exceptions: a directive whose targets *nobody*
 * owns is exactly the dead suppression this concept exists for, so every engine reports it and
 * `run/check.ts` collapses the duplicates; and a bare directive suppresses every concept, so no engine
 * can be excluded on ownership grounds — two engines disagreeing there still produce one spurious
 * finding, the residual gap recorded in the M0 follow-ups.
 */
function judgedBy(directive: SuppressionDirective, engine: EngineId, owners: OwnerMap): boolean {
  if (directive.targets.length === 0) return true
  // A target is either a concept id or a rule id (`oxlint/no-shadow`, whose first segment names the
  // engine directly) — `directiveMatches` accepts both, so both have to resolve to an engine here or
  // the rule-id spelling keeps the bug. One list per target: a concept split across languages has more
  // than one owner, and any of them is reason enough for this engine to have an opinion.
  const engines = directive.targets.map((target) =>
    target.includes('/') ? [parseRuleRefKey(target).engine] : owningEngines(owners, target),
  )
  return engines.some((owners_) => owners_.includes(engine)) || engines.every((owners_) => owners_.length === 0)
}

/**
 * Attaches an engine's fix to a diagnostic, with the registry — not the engine — deciding its tier.
 * `RuleEntry.fixKind` is the single declared trust level for a rule's fix (D7), so a rule the registry
 * calls unfixable has its edits **dropped**, not promoted to some default tier: the alternative is an
 * adapter applying a rewrite that no reviewable, committed file ever authorised. An empty `edits` array
 * is dropped too — a fix that changes nothing is not a fix, and letting one through would have the fix
 * loop count a file as changed and re-run every engine over it forever.
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
 * directive, on the `slop-gate/<concept>` rule id convention `configDiagnostics` also uses. No level
 * resolved at all means don't emit: there is no `RuleEntry.severityDefault` to fall back to for a
 * concept no engine rule backs (see `ConceptDefinition.servicedBySlopGate`).
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
    ruleRefKey: `slop-gate/${params.concept}`,
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
