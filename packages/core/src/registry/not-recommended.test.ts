import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { OPTIONED_RECOMMENDED_RULES } from '../config/rule-options.ts'
import { NOT_RECOMMENDED_GENERATED, NOT_RECOMMENDED_UNCATALOGUED, type NotRecommended } from './not-recommended.ts'

const entries: (readonly [string, Pick<NotRecommended, 'reason' | 'evidence'>])[] = [
  ...Object.entries(NOT_RECOMMENDED_UNCATALOGUED),
  ...Object.entries(NOT_RECOMMENDED_GENERATED),
  ...Object.entries(OPTIONED_RECOMMENDED_RULES).flatMap(([key, rule]) =>
    rule === undefined ? [] : [[key, rule] as const],
  ),
]

test('a reason states the conclusion and stops; the working goes in measurements.md', () => {
  // Not a style preference. These strings ship in the bundle and are read in a table cell and in a
  // terminal, and they were 36 kB of prose before the split — AGENTS.md already says which half goes
  // where. Without a bound they grow back one careful paragraph at a time.
  const long = entries.filter(([, entry]) => entry.reason.length > 900).map(([key]) => key)
  expect(long).toEqual([])
})

test('every evidence anchor resolves to a heading in measurements.md', () => {
  const docs = readFileSync(new URL('../../../../docs/measurements.md', import.meta.url), 'utf8')
  const anchors = new Set([...docs.matchAll(/<a id="([^"]+)"/g)].map((match) => match[1]))

  const broken = entries
    .filter(([, entry]) => entry.evidence !== undefined && !anchors.has(entry.evidence))
    .map(([key, entry]) => `${key} -> ${String(entry.evidence)}`)
  expect(broken).toEqual([])
})

test('a reason whose whole argument is a count still carries the count', () => {
  const rows = Object.entries({ ...NOT_RECOMMENDED_GENERATED, ...NOT_RECOMMENDED_UNCATALOGUED })
  const unquantified = rows
    .filter(([, entry]) => /\b(findings?|false positives?)\b/.test(entry.reason) && !/\d/.test(entry.reason))
    .map(([key]) => key)

  expect(unquantified).toEqual([])
})
