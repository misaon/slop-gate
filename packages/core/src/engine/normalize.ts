import type { GeneratedPolicy, RuleLevel } from '../config/types.ts'
import { fingerprint, normalizedWindow } from '../diagnostics/fingerprint.ts'
import { createLineIndex, type LineIndex } from '../diagnostics/position.ts'
import type { Diagnostic, Fix, Severity } from '../diagnostics/types.ts'
import { isGeneratedPath, isGeneratedSource } from '../discovery/detect-generated.ts'
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
  suppressionScanFiles?: readonly string[]
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

  const generated = new Map<string, boolean>()

  const ensureSource = (file: string): string => {
    let source = sources.get(file)
    if (source === undefined) {
      source = input.sourceOf(file)
      sources.set(file, source)
      lineIndexes.set(file, createLineIndex(source))
      generated.set(file, isGeneratedPath(file) || isGeneratedSource(source))
    }
    return source
  }

  for (const raw of input.raws) {
    const entry = byEngineRuleId.get(raw.engineRuleId)
    if (entry === undefined) continue

    const concept = classify(entry, raw.message)
    const language = detectLanguage(raw.file)
    if (!isOwned(input.owners, { concept, engine: input.engine, engineRuleId: raw.engineRuleId, language })) continue

    const level = input.levelOf(concept)
    if (level === 'off') continue
    const severity = level === undefined ? entry.severityDefault : LEVEL_TO_SEVERITY[level]

    ensureSource(raw.file)
    const lineIndex = lineIndexes.get(raw.file)!

    const start = lineIndex.positionAt(raw.range.start)
    const end = lineIndex.positionAt(raw.range.end)

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
      ...(skipGenerated && generated.get(raw.file) === true
        ? { suppressed: { by: 'generated' as const, reason: 'the file is generated, so the fix would not survive' } }
        : {}),
    })
  }

  for (const file of input.suppressionScanFiles ?? []) ensureSource(file)

  const byFile = new Map<string, Diagnostic[]>()
  for (const diagnostic of diagnostics) {
    const file = diagnostic.file
    if (file === null) continue
    const existing = byFile.get(file)
    if (existing) existing.push(diagnostic)
    else byFile.set(file, [diagnostic])
  }
  for (const file of sources.keys()) if (!byFile.has(file)) byFile.set(file, [])

  const replacements = new Map<Diagnostic, Diagnostic>()
  const synthetic: Diagnostic[] = []

  for (const [file, fileDiagnostics] of byFile) {
    const source = sources.get(file)!
    const directives = parseSuppressions(source)
    if (directives.length === 0) continue

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

function judgedBy(directive: SuppressionDirective, engine: EngineId, owners: OwnerMap): boolean {
  if (directive.targets.length === 0) return true
  const engines = directive.targets.map((target) =>
    target.includes('/') ? [parseRuleRefKey(target).engine] : owningEngines(owners, target),
  )
  return engines.some((owners_) => owners_.includes(engine)) || engines.every((owners_) => owners_.length === 0)
}

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
