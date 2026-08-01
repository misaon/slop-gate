import type { RuleLevel } from '../config/types.ts'
import { fingerprint } from '../diagnostics/fingerprint.ts'
import { createLineIndex, type LineIndex } from '../diagnostics/position.ts'
import type { Diagnostic, Severity } from '../diagnostics/types.ts'
import { isOwned } from '../registry/ownership.ts'
import { ruleRefKey, type EngineId, type RuleEntry, type RuleRef } from '../registry/types.ts'
import { applySuppressions } from '../suppressions/apply.ts'
import { parseSuppressions, type SuppressionDirective } from '../suppressions/parse.ts'
import type { RawDiagnostic } from './types.ts'

export type NormalizeInput = {
  engine: EngineId
  raws: readonly RawDiagnostic[]
  entries: readonly RuleEntry[]
  owners: ReadonlyMap<string, RuleRef>
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
    if (!isOwned(input.owners, { concept, engine: input.engine, engineRuleId: raw.engineRuleId })) continue

    const level = input.levelOf(concept)
    if (level === 'off') continue
    const severity = level === undefined ? entry.severityDefault : LEVEL_TO_SEVERITY[level]

    const source = ensureSource(raw.file)
    const lineIndex = lineIndexes.get(raw.file)!

    const start = lineIndex.positionAt(raw.range.start)
    const end = lineIndex.positionAt(raw.range.end)

    const occurrenceKey = `${concept}\0${raw.file}`
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
      docsUrl: raw.docsUrl ?? entry.docsUrl,
      fingerprint: fingerprint({ concept, file: raw.file, source, range: raw.range, occurrenceIndex }),
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
      const built = suppressionDiagnostic({
        concept: 'config.unused-suppression',
        directive,
        file,
        source,
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
        source,
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
  source: string
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

  const occurrenceKey = `${params.concept}\0${params.file}`
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
    fingerprint: fingerprint({ concept: params.concept, file: params.file, source: params.source, range, occurrenceIndex }),
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
