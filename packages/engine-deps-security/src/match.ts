import { coerce, gte, lt, lte, valid } from 'semver'
import type { AdvisoryRecord } from './advisory.ts'

/**
 * Whether one installed version falls inside one advisory.
 *
 * The two halves are a union, not alternatives: an OSV affected entry may carry an explicit version
 * enumeration, a set of ranges, or both, and 8,107 npm malicious entries carry both. Checking only
 * whichever is non-empty would drop findings from the entries that use both.
 *
 * `semver` does the ordering rather than a hand-rolled comparison, and the reason is prereleases:
 * `1.0.0-beta.1` sorts *below* `1.0.0`, so a naive numeric compare puts a prerelease outside a range
 * that upstream intends to cover. The same library backs the measurement this engine's accuracy claim
 * rests on, so agreement with `npm audit` is agreement about the comparison too, not only about the data.
 */
export function advisoryAffects(version: string, advisory: AdvisoryRecord): boolean {
  if (advisory.versions.includes(version)) return true
  if (advisory.ranges.length === 0) return false

  const normalized = normalizeVersion(version)
  if (normalized === undefined) return false

  return advisory.ranges.some((range) => {
    if (range.introduced !== '0' && !gte(normalized, range.introduced)) return false
    if (range.bound === null) return true
    return range.kind === 'lte' ? lte(normalized, range.bound) : lt(normalized, range.bound)
  })
}

/**
 * Lockfiles hold registry versions, which are valid semver by npm's own rules — but a lockfile can
 * also name a package resolved from git or a tarball, whose recorded version is whatever the manifest
 * said. `coerce` rescues the near-misses (`v1.2.3`, `1.2`); anything it cannot read yields `undefined`
 * so the caller reports nothing rather than guessing at an ordering.
 */
function normalizeVersion(version: string): string | undefined {
  if (valid(version) !== null) return version
  return coerce(version)?.version
}
