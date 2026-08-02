import { compareStrings } from '@misaon/slop-gate-core'

/**
 * One affected-version window, flattened out of OSV's event stream. `bound` is `null` for a range
 * upstream never closed — "every version from `introduced` onwards", which is what a package that
 * exists only to be malicious looks like.
 */
export type AdvisoryRange = {
  readonly introduced: string
  readonly bound: string | null
  /** `lt` came from a `fixed` event, `lte` from `last_affected`. OSV means different things by them. */
  readonly kind: 'lt' | 'lte'
}

export type AdvisoryRecord = {
  readonly id: string
  /** Exact versions OSV enumerated. **Not** a convenience duplicate of `ranges` — see `distillAdvisory`. */
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

const SEVERITIES: ReadonlySet<string> = new Set(ADVISORY_SEVERITIES)

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

/**
 * Turns one OSV document into the per-package records the matcher consumes.
 *
 * **`affected[].versions` is read, and getting that wrong is the expensive mistake this whole engine
 * could have made.** A first cut of this code read only `affected[].ranges` and treated an entry
 * with none as unbounded. That is exactly backwards for the malicious feed: OSV records a compromised
 * release of a *legitimate* package as an explicit version enumeration, so `chalk`'s MAL-2025-46969
 * carries `versions: ["5.6.1"]` and no range at all. Measured against six real lockfiles, the range-only
 * reading produced **242 findings naming `chalk`, `debug`, `ansi-styles`, `color-name` and
 * `supports-color` as malware**; reading `versions` brings that to zero while still firing on the
 * genuinely compromised releases. It matters in the other direction too — 148 npm GHSA entries are
 * versions-only, and a range-only reader loses every one of them silently.
 *
 * A withdrawn advisory is dropped: upstream retracted it, and 646 of them are in the npm feed.
 *
 * An affected entry with neither versions nor ranges is also dropped rather than stored. It can match
 * nothing, and a record that reaches the matcher with both fields empty is one refactor away from
 * being read as "matches everything" — which is the 242-finding bug again, wearing a different hat.
 */
export function distillAdvisory(document: unknown): readonly DistilledAffected[] {
  const advisory = document as OsvAdvisory
  const id = advisory.id
  if (typeof id !== 'string' || id === '') return []
  if (advisory.withdrawn !== undefined) return []

  const kind: AdvisoryKind = id.startsWith('MAL-') ? 'malicious' : 'vulnerable'
  const severityText = advisory.database_specific?.severity
  const severity = typeof severityText === 'string' && SEVERITIES.has(severityText) ? (severityText as AdvisorySeverity) : null
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

/**
 * OSV expresses affected versions as an ordered event stream rather than intervals: an `introduced`
 * opens a window and the next `fixed` or `last_affected` closes it. An unclosed window at the end of
 * the stream stays open, which is a real and common state rather than malformed input.
 *
 * Only `SEMVER` ranges are read. `ECOSYSTEM` ranges enumerate versions in the registry's own order,
 * which cannot be evaluated without the registry — and `GIT` ranges are commit ids. Both would need
 * data this engine deliberately does not have at check time, so they are skipped rather than
 * approximated with a semver comparison that would be wrong in both directions.
 */
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

/**
 * Both tables in one pass, because the caller is streaming 224,000 documents and holding them to
 * filter twice is the difference between a working install and an out-of-memory one.
 *
 * Package names and ids are put in `compareStrings` order so rebuilding a snapshot from unchanged
 * upstream data produces byte-identical files — which is the only thing that makes the digest in the
 * manifest worth recording.
 */
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
