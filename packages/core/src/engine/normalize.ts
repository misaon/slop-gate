import type { RuleLevel } from '../config/types.ts'
import { fingerprint } from '../diagnostics/fingerprint.ts'
import { createLineIndex, type LineIndex } from '../diagnostics/position.ts'
import type { Diagnostic, Severity } from '../diagnostics/types.ts'
import { isOwned } from '../registry/ownership.ts'
import { ruleRefKey, type EngineId, type RuleEntry, type RuleRef } from '../registry/types.ts'
import type { RawDiagnostic } from './types.ts'

export type NormalizeInput = {
  engine: EngineId
  raws: readonly RawDiagnostic[]
  entries: readonly RuleEntry[]
  owners: ReadonlyMap<string, RuleRef>
  sourceOf: (file: string) => string
  levelOf: (concept: string) => RuleLevel | undefined
}

const LEVEL_TO_SEVERITY: Readonly<Record<Exclude<RuleLevel, 'off'>, Severity>> = {
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

  for (const raw of input.raws) {
    const entry = byRuleId.get(raw.engineRuleId)
    if (entry === undefined) continue

    const concept = classify(entry, raw.message)
    if (!isOwned(input.owners, { concept, engine: input.engine, engineRuleId: raw.engineRuleId })) continue

    const level = input.levelOf(concept)
    if (level === 'off') continue
    const severity = level === undefined ? entry.severityDefault : LEVEL_TO_SEVERITY[level]

    let source = sources.get(raw.file)
    if (source === undefined) {
      source = input.sourceOf(raw.file)
      sources.set(raw.file, source)
      lineIndexes.set(raw.file, createLineIndex(source))
    }
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

  return diagnostics
}

function classify(entry: RuleEntry, message: string): string {
  if (entry.concepts.length === 1) return entry.concepts[0]!
  for (const rule of entry.classify ?? []) {
    if (new RegExp(rule.messagePattern).test(message)) return rule.concept
  }
  return entry.concepts[0]!
}
