import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { RULE_ENTRIES, conceptById, isConceptId, PRESETS } from '@misaon/slop-gate-core'
import { ASTGREP_RULES, LANGUAGE_COVERAGE, astGrepRuleById } from './rules.ts'

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const ASTGREP_ENTRIES = RULE_ENTRIES.filter((entry) => entry.engine === 'astgrep')

test('the registry and this package describe the same set of rules', () => {
  expect(new Set(ASTGREP_ENTRIES.map((entry) => entry.engineRuleId))).toEqual(
    new Set(ASTGREP_RULES.map((rule) => rule.engineRuleId)),
  )
})

test('each entry declares exactly the languages its rule documents actually cover', () => {
  for (const rule of ASTGREP_RULES) {
    const entry = ASTGREP_ENTRIES.find((candidate) => candidate.engineRuleId === rule.engineRuleId)
    const covered = rule.languages.flatMap((language) => [...LANGUAGE_COVERAGE[language]])
    expect(new Set(entry?.languages), rule.engineRuleId).toEqual(new Set(covered))
  }
})

test('every entry claims exactly one concept, in the slop group, that the catalogue knows', () => {
  const concepts = ASTGREP_ENTRIES.flatMap((entry) => entry.concepts)
  expect(concepts).toHaveLength(ASTGREP_ENTRIES.length)
  expect(new Set(concepts).size).toBe(concepts.length)
  for (const concept of concepts) {
    expect(isConceptId(concept)).toBe(true)
    expect(conceptById(concept).group).toBe('slop')
  }
})

test('no ast-grep entry contests a concept another engine already owns', () => {
  const others = new Set(RULE_ENTRIES.filter((entry) => entry.engine !== 'astgrep').flatMap((entry) => entry.concepts))
  for (const entry of ASTGREP_ENTRIES) {
    for (const concept of entry.concepts) expect(others, `${entry.engineRuleId} → ${concept}`).not.toContain(concept)
  }
})

test('every rule ships a documentation page at the url its entry advertises', () => {
  for (const entry of ASTGREP_ENTRIES) {
    const relative = entry.docsUrl.slice(entry.docsUrl.indexOf('/docs/rules/') + 1)
    expect(existsSync(join(REPO_ROOT, relative)), entry.docsUrl).toBe(true)
  }
})

test('every rule carries a message and a documented escape', () => {
  for (const rule of ASTGREP_RULES) {
    expect(rule.message.length, rule.engineRuleId).toBeGreaterThan(20)
    expect(rule.note, rule.engineRuleId).toMatch(/sgate-disable|abstract|Implement|Narrow|Handle|Remove|Delete/)
  }
})

const SLOP_CONCEPTS = [
  'slop.as-any-cast',
  'slop.double-cast',
  'slop.emoji-in-code',
  'slop.narrative-comment',
  'slop.stub-implementation',
  'slop.swallowed-error',
]

test('every slop concept the engine implements is in the slop preset', () => {
  expect(Object.keys(PRESETS.slop).filter((concept) => concept.startsWith('slop.')).sort()).toEqual(SLOP_CONCEPTS)
})

test('recommended carries exactly the slop preset', () => {
  const inRecommended = Object.keys(PRESETS.recommended).filter((concept) => concept.startsWith('slop.'))

  expect(inRecommended.toSorted()).toEqual(SLOP_CONCEPTS)
  expect(inRecommended.toSorted()).toEqual(Object.keys(PRESETS.slop).toSorted())
})

test('astGrepRuleById returns nothing for an unknown id', () => {
  expect(astGrepRuleById('slop-not-a-rule')).toBeUndefined()
})
