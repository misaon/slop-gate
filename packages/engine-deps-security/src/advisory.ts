import { compareStrings, isOneOf } from '@misaon/slop-gate-core'

export type AdvisoryRange = {
  readonly introduced: string
  readonly bound: string | null
  readonly kind: 'lt' | 'lte'
}

export type AdvisoryRecord = {
  readonly id: string
  readonly versions: readonly string[]
  readonly ranges: readonly AdvisoryRange[]
  readonly severity: AdvisorySeverity | null
  readonly summary: string
}

export const ADVISORY_SEVERITIES = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const
export type AdvisorySeverity = (typeof ADVISORY_SEVERITIES)[number]

export type AdvisoryKind = 'vulnerable' | 'malicious'

export type DistilledAffected = {
  readonly kind: AdvisoryKind
  readonly packageName: string
  readonly record: AdvisoryRecord
}

type OsvEvent = { introduced?: string; fixed?: string; last_affected?: string }
type OsvRange = { type?: string; events?: readonly OsvEvent[] }
type OsvAffected = {
  package?: { name?: string; ecosystem?: string }
  versions?: readonly string[]
  ranges?: readonly OsvRange[]
}
type OsvAdvisory = {
  id?: string
  summary?: string
  withdrawn?: string
  affected?: readonly OsvAffected[]
  database_specific?: { severity?: string }
}

export function distillAdvisory(document: unknown): readonly DistilledAffected[] {
  const advisory = document as OsvAdvisory
  const id = advisory.id
  if (typeof id !== 'string' || id === '') return []
  if (advisory.withdrawn !== undefined) return []

  const kind: AdvisoryKind = id.startsWith('MAL-') ? 'malicious' : 'vulnerable'
  const severityText = advisory.database_specific?.severity
  const severity = typeof severityText === 'string' && isOneOf(severityText, ADVISORY_SEVERITIES) ? severityText : null
  const summary = typeof advisory.summary === 'string' ? advisory.summary : ''

  const out: DistilledAffected[] = []
  for (const affected of advisory.affected ?? []) {
    if (affected.package?.ecosystem !== 'npm') continue
    const packageName = affected.package.name
    if (typeof packageName !== 'string' || packageName === '') continue

    const versions = (affected.versions ?? []).filter((value) => typeof value === 'string' && value !== '')
    const ranges = flattenRanges(affected.ranges ?? [])
    if (versions.length === 0 && ranges.length === 0) continue

    out.push({ kind, packageName, record: { id, versions, ranges, severity, summary } })
  }
  return out
}

function flattenRanges(ranges: readonly OsvRange[]): readonly AdvisoryRange[] {
  const out: AdvisoryRange[] = []
  for (const range of ranges) {
    if (range.type !== 'SEMVER') continue
    let introduced: string | null = null
    for (const event of range.events ?? []) {
      if (typeof event.introduced === 'string') {
        introduced = event.introduced
      } else if (typeof event.fixed === 'string') {
        out.push({ introduced: introduced ?? '0', bound: event.fixed, kind: 'lt' })
        introduced = null
      } else if (typeof event.last_affected === 'string') {
        out.push({ introduced: introduced ?? '0', bound: event.last_affected, kind: 'lte' })
        introduced = null
      }
    }
    if (introduced !== null) out.push({ introduced, bound: null, kind: 'lt' })
  }
  return out
}

export type AdvisoryTable = Record<string, readonly AdvisoryRecord[]>

export type AdvisoryTables = { readonly vulnerable: AdvisoryTable; readonly malicious: AdvisoryTable }

export function buildAdvisoryTables(entries: Iterable<DistilledAffected>): AdvisoryTables {
  const grouped: Record<AdvisoryKind, Map<string, AdvisoryRecord[]>> = { vulnerable: new Map(), malicious: new Map() }
  for (const entry of entries) {
    const bucket = grouped[entry.kind]
    const existing = bucket.get(entry.packageName)
    if (existing === undefined) bucket.set(entry.packageName, [entry.record])
    else existing.push(entry.record)
  }
  return { vulnerable: sortTable(grouped.vulnerable), malicious: sortTable(grouped.malicious) }
}

function sortTable(grouped: ReadonlyMap<string, readonly AdvisoryRecord[]>): AdvisoryTable {
  const table: AdvisoryTable = {}
  for (const name of [...grouped.keys()].sort(compareStrings)) {
    table[name] = [...(grouped.get(name) ?? [])].sort((left, right) => compareStrings(left.id, right.id))
  }
  return table
}
