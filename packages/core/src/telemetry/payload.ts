import { compareStrings } from '../ordering.ts'
import type { CheckResult } from '../run/check.ts'

export const TELEMETRY_SCHEMA_VERSION = 1

/**
 * What a run reports, and nothing else.
 *
 * **Every field here is a count, an enum or a version string.** No path, no message, no source, no
 * package name, no repository, no configuration. That is not a promise in a document — `payload.test.ts`
 * builds this from a run whose findings carry planted secrets and fails if any of them appears in the
 * serialised output, and a new field that is not a number or a known-shaped string fails with it.
 *
 * `project` is a random UUID the CLI writes to `.slop-gate/`. It is not derived from anything: hashing
 * the git remote was considered and rejected, because a repository URL has so little entropy that the
 * hash is reversible by enumeration, which would make the whole table deanonymisable if it ever leaked.
 */
export type TelemetryPayload = {
  readonly schema: number
  /** Random per-run; only so a retry is not counted twice. */
  readonly run: string
  /** Random per checkout. Not derived from the repository. Absent when the CLI could not persist one. */
  readonly project: string | null
  readonly slopGate: string
  readonly node: string
  readonly platform: string
  readonly ci: boolean
  readonly durationMs: number
  readonly filesScanned: number
  readonly filesAnalysed: number
  readonly engines: readonly { readonly id: string; readonly version: string | null; readonly ran: boolean }[]
  readonly rules: readonly RuleReport[]
  /** Concepts the user turned off in their own config — the clearest "not wanted" a run can see. */
  readonly disabledConcepts: readonly string[]
  readonly preset: string | null
  readonly baseline: boolean
}

export type RuleReport = {
  readonly rule: string
  readonly findings: number
  /** Dropped by an inline `sgate-disable` or an `off` in config: the strongest false-positive signal. */
  readonly suppressed: number
  /** Accepted into a baseline: "not now" rather than "not this one". */
  readonly baselined: number
  /** In a generated file. Not a false positive — a correct skip, worth separating from one. */
  readonly generated: number
}

export type TelemetryContext = {
  readonly run: string
  readonly project: string | null
  readonly slopGate: string
  readonly nodeVersion: string
  readonly platform: string
  readonly ci: boolean
  readonly preset: string | null
  readonly disabledConcepts: readonly string[]
}

const MAJOR = /^v?(\d+)\./

/** Only the major. A full version is close to a fingerprint on a machine nobody else shares. */
function majorOf(version: string): string {
  return MAJOR.exec(version)?.[1] ?? 'unknown'
}

export function buildTelemetryPayload(result: CheckResult, context: TelemetryContext): TelemetryPayload {
  const rules = new Map<string, { findings: number; suppressed: number; baselined: number; generated: number }>()
  const bucket = (rule: string) => {
    const existing = rules.get(rule)
    if (existing !== undefined) return existing
    const created = { findings: 0, suppressed: 0, baselined: 0, generated: 0 }
    rules.set(rule, created)
    return created
  }

  for (const diagnostic of result.diagnostics) bucket(diagnostic.ruleRefKey).findings += 1
  for (const [rule, count] of Object.entries(result.dropped.inline)) bucket(rule).suppressed += count
  for (const [rule, count] of Object.entries(result.dropped.baseline)) bucket(rule).baselined += count
  for (const [rule, count] of Object.entries(result.dropped.generated)) bucket(rule).generated += count

  return {
    schema: TELEMETRY_SCHEMA_VERSION,
    run: context.run,
    project: context.project,
    slopGate: context.slopGate,
    node: majorOf(context.nodeVersion),
    platform: context.platform,
    ci: context.ci,
    durationMs: Math.round(result.stats.durationMs),
    filesScanned: result.stats.filesScanned,
    filesAnalysed: result.stats.filesAnalysed,
    engines: result.stats.cacheByEngine
      .map((entry) => ({ id: entry.engine, version: null, ran: true }))
      .sort((a, b) => compareStrings(a.id, b.id)),
    rules: [...rules]
      .map(([rule, counts]) => ({ rule, ...counts }))
      .sort((a, b) => compareStrings(a.rule, b.rule)),
    disabledConcepts: [...context.disabledConcepts].sort(compareStrings),
    preset: context.preset,
    baseline: result.baseline !== null,
  }
}
