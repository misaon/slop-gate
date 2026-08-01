import { expect, test } from 'vitest'
import { RULE_ENTRIES, compareStrings, isConceptId, type RuleEntry } from '@misaon/slop-gate-core'
import {
  KNIP_EXCLUDED_ISSUE_TYPES,
  KNIP_ISSUE_TYPES,
  KNIP_SURFACED_ISSUE_TYPES,
  isSurfacedIssueType,
} from './issue-types.ts'

const knipEntries: readonly RuleEntry[] = (RULE_ENTRIES as readonly RuleEntry[]).filter((e) => e.engine === 'knip')

test('every issue type knip can report is accounted for exactly once', () => {
  const seen = new Set<string>()
  for (const type of KNIP_ISSUE_TYPES) {
    expect(seen.has(type), `${type} listed twice`).toBe(false)
    seen.add(type)
  }
  expect(seen.size).toBe(KNIP_ISSUE_TYPES.length)
  expect(KNIP_SURFACED_ISSUE_TYPES.length + Object.keys(KNIP_EXCLUDED_ISSUE_TYPES).length).toBe(
    KNIP_ISSUE_TYPES.length,
  )
})

test('an issue type is either surfaced or excluded, never both and never neither', () => {
  for (const type of KNIP_ISSUE_TYPES) {
    const surfaced = KNIP_SURFACED_ISSUE_TYPES.includes(type)
    const excluded = Object.hasOwn(KNIP_EXCLUDED_ISSUE_TYPES, type)
    expect(surfaced !== excluded, `${type} is ${surfaced && excluded ? 'both' : 'neither'}`).toBe(true)
  }
})

test('every exclusion carries a written reason substantial enough to stop someone re-adding it', () => {
  for (const [type, exclusion] of Object.entries(KNIP_EXCLUDED_ISSUE_TYPES)) {
    expect(exclusion.reason.length, `${type}'s reason is too short to be a real justification`).toBeGreaterThan(120)
  }
})

test('the surfaced list is sorted with compareStrings so the materialised config is byte-stable', () => {
  expect([...KNIP_SURFACED_ISSUE_TYPES]).toEqual([...KNIP_SURFACED_ISSUE_TYPES].sort(compareStrings))
})

test('isSurfacedIssueType accepts a surfaced type and rejects an excluded or unknown one', () => {
  expect(isSurfacedIssueType('files')).toBe(true)
  expect(isSurfacedIssueType('cycles')).toBe(false)
  expect(isSurfacedIssueType('not-a-knip-issue-type')).toBe(false)
})

test('the shipped registry carries exactly one entry per surfaced issue type, and none for an excluded one', () => {
  // The other half of "record every exclusion as first-class data": the table above says which
  // categories are surfaced, and this is what makes that statement load-bearing rather than
  // decorative. A category added to the table but never given a `RuleEntry` would be unelectable and
  // silently absent; a `RuleEntry` for a category the table excludes would be elected, configured into
  // knip's `include`, and then dropped on the floor by the parser.
  expect(knipEntries.map((entry) => entry.engineRuleId).sort(compareStrings)).toEqual([...KNIP_SURFACED_ISSUE_TYPES])
})

test('every knip entry maps to exactly one concept, and no two entries share it', () => {
  // knip's issue types are mutually exclusive by construction — an unused file is not also an unused
  // export — so nothing here needs `classify`, and a shared concept would mean two categories fighting
  // over one owner during arbitration.
  const concepts = knipEntries.flatMap((entry) => entry.concepts)
  expect(concepts).toHaveLength(knipEntries.length)
  expect(new Set(concepts).size).toBe(concepts.length)
  expect(concepts.filter((concept) => !isConceptId(concept))).toEqual([])
})

test('every knip concept belongs to the dead-code or deps group (spec §5.1)', () => {
  const strays = knipEntries.flatMap((entry) =>
    entry.concepts.filter((concept) => !concept.startsWith('dead-code.') && !concept.startsWith('deps.')),
  )
  expect(strays).toEqual([])
})
