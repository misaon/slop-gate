import { EngineError, compareStrings, createLineIndex, type RawDiagnostic, type RawSeverity } from '@misaon/slop-gate-core'
import { ruleByCategory } from './rules.ts'

type BiomePosition = { line: number; column: number }
type BiomeAdvice = { start?: BiomePosition; end?: BiomePosition; text?: string }
type BiomeDiagnostic = {
  severity: string
  message: string
  category: string
  location?: { path?: string; start?: BiomePosition; end?: BiomePosition }
  advices?: BiomeAdvice[]
}
type BiomeSummary = { unchanged?: number; skipped?: number; diagnosticsNotPrinted?: number }
type BiomeReport = { summary?: BiomeSummary; diagnostics?: BiomeDiagnostic[] }

export const CSS_PARSE_ERROR_RULE_ID = 'css-parse-error'

const PARSE_CATEGORY = 'parse'

const SUPPRESSION_CATEGORY_PREFIX = 'suppressions/'

const SEVERITIES: Readonly<Record<string, RawSeverity>> = {
  fatal: 'error',
  error: 'error',
  warning: 'warning',
  information: 'info',
  info: 'info',
  hint: 'advice',
}

export type ParseOptions = {
  read: (file: string) => string | undefined
  enabled: ReadonlySet<string>
  expectedFileCount: number
}

export function parseBiomeOutput(report: string, options: ParseOptions): RawDiagnostic[] {
  const trimmed = report.trim()
  if (trimmed === '') return []

  let parsed: BiomeReport
  try {
    parsed = JSON.parse(trimmed) as BiomeReport
  } catch (cause) {
    throw new EngineError('biome-css', `could not parse biome json output: ${trimmed.slice(0, 200)}`, { cause })
  }
  if (!Array.isArray(parsed.diagnostics)) {
    throw new EngineError('biome-css', 'biome json output has no diagnostics array')
  }

  const unchanged = parsed.summary?.unchanged ?? 0
  if (unchanged !== options.expectedFileCount) {
    throw new EngineError(
      'biome-css',
      `expected biome to check ${options.expectedFileCount} file(s), biome checked ${unchanged}. ` +
        'A file was skipped without being reported — check `files.maxSize` and the batch paths.',
    )
  }
  const notPrinted = parsed.summary?.diagnosticsNotPrinted ?? 0
  if (notPrinted !== 0) {
    throw new EngineError('biome-css', `biome withheld ${notPrinted} diagnostic(s); --max-diagnostics=none is not taking effect`)
  }

  const unparseable = new Map<string, BiomeDiagnostic>()
  for (const diagnostic of parsed.diagnostics) {
    if (diagnostic.category !== PARSE_CATEGORY) continue
    const file = toRepoRelative(diagnostic.location?.path)
    if (file !== undefined && !unparseable.has(file)) unparseable.set(file, diagnostic)
  }

  const indexes = new Map<string, ReturnType<typeof createLineIndex> | undefined>()
  const indexOf = (file: string) => {
    if (!indexes.has(file)) {
      const source = options.read(file)
      indexes.set(file, source === undefined ? undefined : createLineIndex(source))
    }
    return indexes.get(file)
  }

  const rangeFromCodepointLocation = (file: string, location: BiomeDiagnostic['location']) => {
    const index = indexOf(file)
    if (index === undefined || location?.start === undefined) return { start: 0, end: 0 }
    const start = index.offsetAtCodepointColumn(location.start)
    const end = location.end === undefined ? start : index.offsetAtCodepointColumn(location.end)
    return { start, end: Math.max(start, end) }
  }

  const results: RawDiagnostic[] = []
  for (const diagnostic of parsed.diagnostics) {
    if (diagnostic.category === PARSE_CATEGORY) continue
    if (diagnostic.category.startsWith(SUPPRESSION_CATEGORY_PREFIX)) continue
    if (diagnostic.category === 'lint' && diagnostic.message === '') continue

    const file = toRepoRelative(diagnostic.location?.path)
    if (file === undefined || unparseable.has(file)) continue

    const rule = ruleByCategory(diagnostic.category)
    if (rule === undefined || !options.enabled.has(rule.engineRuleId)) {
      throw new EngineError(
        'biome-css',
        `biome reported a finding under '${diagnostic.category}', which this run never enabled. ` +
          'The materialised config is not selecting exactly the elected ruleset.',
      )
    }

    const help = diagnostic.advices?.find((advice) => typeof advice.text === 'string' && advice.text !== '')?.text
    results.push({
      engineRuleId: rule.engineRuleId,
      message: diagnostic.message,
      severity: SEVERITIES[diagnostic.severity] ?? 'warning',
      file,
      range: rangeFromCodepointLocation(file, diagnostic.location),
      ...(help === undefined ? {} : { help }),
    })
  }

  for (const [file, first] of [...unparseable].sort(([a], [b]) => compareStrings(a, b))) {
    results.push({
      engineRuleId: CSS_PARSE_ERROR_RULE_ID,
      message:
        `This stylesheet was not analysed: biome could not parse it. First error: ${first.message} ` +
        'A `.css` file written for a preprocessor (PostCSS variables, `@extend`, browser-specific ' +
        'directives) is the usual cause, and is not a defect in the file.',
      severity: 'warning',
      file,
      range: rangeFromCodepointLocation(file, first.location),
    })
  }
  return results
}

function toRepoRelative(path: string | undefined): string | undefined {
  return path === undefined ? undefined : path.replaceAll('\\', '/')
}
