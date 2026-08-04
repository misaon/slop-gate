import { createLineIndex, EngineError, toPosix, type ByteRange, type RawDiagnostic } from '@misaon/slop-gate-core'
import { DISABLED_INTEGRATION_RULES, MESSAGE_EXCLUSIONS, MESSAGE_REWRITES } from './rules.ts'

export type ActionlintError = {
  readonly message: string
  readonly filepath: string
  readonly line: number
  readonly column: number
  readonly kind: string
  readonly end_column?: number
  readonly snippet?: string
}

export type ParseActionlintOptions = {
  readonly absolutePrefixes: readonly string[]
  readonly enabled: (engineRuleId: string) => boolean
  readonly readSource: (relativePath: string) => string | undefined
}

const encoder = new TextEncoder()

export function readActionlintErrors(stdout: string): readonly ActionlintError[] {
  const trimmed = stdout.trim()
  if (trimmed === '') return []
  try {
    return JSON.parse(trimmed) as readonly ActionlintError[]
  } catch (error) {
    throw new EngineError('actionlint', `could not parse actionlint JSON output: ${String(error)}`, { cause: error })
  }
}

export function parseActionlintOutput(
  errors: readonly ActionlintError[],
  options: ParseActionlintOptions,
): RawDiagnostic[] {
  const diagnostics: RawDiagnostic[] = []
  for (const error of errors) {
    if (DISABLED_INTEGRATION_RULES.includes(error.kind)) {
      throw new EngineError(
        'actionlint',
        `actionlint reported a \`${error.kind}\` finding, which means \`-${error.kind}=\` stopped disabling that ` +
          'integration. Findings from a second tool would arrive with no registry entry, no concept and nothing ' +
          'able to explain them, and would appear or vanish depending on whether that tool happens to be installed.',
      )
    }
    if (!options.enabled(error.kind)) continue
    if (MESSAGE_EXCLUSIONS.some((exclusion) => exclusion.engineRuleId === error.kind && exclusion.pattern.test(error.message))) {
      continue
    }

    const file = toPosix(error.filepath)
    const source = options.readSource(file)
    diagnostics.push({
      engineRuleId: error.kind,
      message: rewrite(error.kind, sanitize(error.message, options.absolutePrefixes)),
      severity: 'error',
      file,
      range: rangeFromLineColumn(error, source),
    })
  }
  return diagnostics
}

export function rangeFromLineColumn(error: Pick<ActionlintError, 'line' | 'column'>, source: string | undefined): ByteRange {
  if (source === undefined || error.line <= 0) return { start: 0, end: 0 }

  const index = createLineIndex(source)
  const lineRange = index.rangeOfLine(error.line)
  const start = Math.min(lineRange.start + Math.max(error.column, 1) - 1, lineRange.end)
  const rest = index.sliceBytes({ start, end: lineRange.end })
  const stop = rest.search(/[ \t\r\n]/)
  const token = stop === -1 ? rest : rest.slice(0, stop)
  return { start, end: start + encoder.encode(token).length }
}

export function sanitize(message: string, absolutePrefixes: readonly string[]): string {
  let result = message
  for (const prefix of [...absolutePrefixes].filter((p) => p !== '').sort((a, b) => b.length - a.length)) {
    result = result.split(prefix).join('')
    result = result.split(toPosix(prefix)).join('')
  }
  return result.replaceAll('"/', '"').replaceAll('"\\', '"')
}

function rewrite(engineRuleId: string, message: string): string {
  for (const candidate of MESSAGE_REWRITES) {
    if (candidate.engineRuleId !== engineRuleId) continue
    const match = message.match(candidate.pattern)
    if (match !== null) return candidate.rewrite(match)
  }
  return message
}

