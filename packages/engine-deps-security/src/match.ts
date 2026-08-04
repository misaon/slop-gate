import { coerce, gte, lt, lte, valid } from 'semver'
import type { AdvisoryRecord } from './advisory.ts'

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

function normalizeVersion(version: string): string | undefined {
  if (valid(version) !== null) return version
  return coerce(version)?.version
}
