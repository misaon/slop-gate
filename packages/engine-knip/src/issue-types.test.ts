import { expect, test } from 'vitest'
import { compareStrings } from '@misaon/slop-gate-core'
import {
  KNIP_EXCLUDED_ISSUE_TYPES,
  KNIP_ISSUE_TYPES,
  KNIP_SURFACED_ISSUE_TYPES,
  isSurfacedIssueType,
} from './issue-types.ts'

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
