import { coerce, gte, lt, lte, valid } from 'semver'
import type { AdvisoryRecord } from './advisory.ts'

export function advisoryAffects(version: string, advisory: AdvisoryRecord): boolean {
  if (advisory.versions.includes(version)) return true
  if (advisory.ranges.length === 0) return false

  const normalized = normalizeVersion(version)
  if (normalized === undefined) return false

  return advisory.ranges.some((range) => {
    // OSV bounds are publisher-supplied and not all of them are semver: `next`'s GHSA-3h52-269p-cp9r
    // says `introduced: "13.0"`. Comparing against one raw throws and takes the whole engine down.
    const introduced = range.introduced === '0' ? '0' : normalizeVersion(range.introduced)
    if (introduced === undefined) return false
    if (introduced !== '0' && !gte(normalized, introduced)) return false
    if (range.bound === null) return true

    const bound = normalizeVersion(range.bound)
    if (bound === undefined) return false
    return range.kind === 'lte' ? lte(normalized, bound) : lt(normalized, bound)
  })
}

function normalizeVersion(version: string): string | undefined {
  if (valid(version) !== null) return version
  return coerce(version)?.version
}
