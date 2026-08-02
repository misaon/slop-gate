import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { RULE_ENTRIES, conceptById, isConceptId, PRESETS } from '@misaon/slop-gate-core'
import { ASTGREP_RULES, LANGUAGE_COVERAGE, astGrepRuleById } from './rules.ts'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const ASTGREP_ENTRIES = RULE_ENTRIES.filter((entry) => entry.engine === 'astgrep')

test('the registry and this package describe the same set of rules', () => {
  // The drift this catches is silent in both directions: a registry entry with no rule elects a
  // concept nothing can detect, and a rule with no entry is materialised into the config and then
  // has every one of its findings dropped by `normalizeDiagnostics`, which cannot map the id.
  expect(new Set(ASTGREP_ENTRIES.map((entry) => entry.engineRuleId))).toEqual(
    new Set(ASTGREP_RULES.map((rule) => rule.engineRuleId)),
  )
})

test('each entry declares exactly the languages its rule documents actually cover', () => {
  // ast-grep's own mapping, not ours: `TypeScript` covers `.ts` and not `.tsx`, `JavaScript` covers
  // `.jsx`. An entry claiming a language with no document behind it makes the planner assign files
  // the ruleset silently ignores.
  for (const rule of ASTGREP_RULES) {
    const entry = ASTGREP_ENTRIES.find((candidate) => candidate.engineRuleId === rule.engineRuleId)
    const covered = rule.languages.flatMap((language) => [...LANGUAGE_COVERAGE[language]])
    expect(new Set(entry?.languages), rule.engineRuleId).toEqual(new Set(covered))
  }
})

test('every entry claims exactly one concept, in the slop group, that the catalogue knows', () => {
  // One rule id per concept is what keeps arbitration meaningful here: two ast-grep rules claiming
  // one concept would leave one of them elected and the other's findings dropped at normalisation.
  const concepts = ASTGREP_ENTRIES.flatMap((entry) => entry.concepts)
  expect(concepts).toHaveLength(ASTGREP_ENTRIES.length)
  expect(new Set(concepts).size).toBe(concepts.length)
  for (const concept of concepts) {
    expect(isConceptId(concept)).toBe(true)
    expect(conceptById(concept).group).toBe('slop')
  }
})

test('no ast-grep entry contests a concept another engine already owns', () => {
  // `slop.as-any-cast` is the live case: oxlint's `typescript/no-explicit-any` is tier 0 too, so
  // engine preference would hand it oxlint and this entry would contribute nothing but a
  // `config.rule-overlap`. Guarding the whole set rather than that one concept, because the next
  // pattern-shaped rule someone adds is the one that will not be noticed.
  const others = new Set(RULE_ENTRIES.filter((entry) => entry.engine !== 'astgrep').flatMap((entry) => entry.concepts))
  for (const entry of ASTGREP_ENTRIES) {
    for (const concept of entry.concepts) expect(others, `${entry.engineRuleId} → ${concept}`).not.toContain(concept)
  }
})

test('every rule ships a documentation page at the url its entry advertises', () => {
  // Spec §14 requires one per slop rule. A `docsUrl` is only worth having if it resolves, so the
  // committed file it points at is checked rather than assumed.
  for (const entry of ASTGREP_ENTRIES) {
    const relative = entry.docsUrl.slice(entry.docsUrl.indexOf('/docs/rules/') + 1)
    expect(existsSync(join(REPO_ROOT, relative)), entry.docsUrl).toBe(true)
  }
})

test('every rule carries a message and a documented escape', () => {
  // The escape is the other half of §14's contract, and `note` is how it reaches the finding rather
  // than only the documentation page.
  for (const rule of ASTGREP_RULES) {
    expect(rule.message.length, rule.engineRuleId).toBeGreaterThan(20)
    expect(rule.note, rule.engineRuleId).toMatch(/sgate-disable|abstract|Implement|Narrow|Handle|Remove|Delete/)
  }
})

test('only the concepts whose measurement supports it are in the slop preset', () => {
  // Both exclusions are numbers, not caution: `slop.swallowed-error` measured 433 findings over the
  // third-party corpus with ~19 of a 22-item sample deliberate, and `slop.emoji-in-code` measured
  // 20/20 false positives on this repository. Pinned here so re-adding either needs a new
  // measurement rather than an opinion.
  expect(Object.keys(PRESETS.slop).filter((concept) => concept.startsWith('slop.')).sort()).toEqual([
    'slop.as-any-cast',
    'slop.double-cast',
    'slop.narrative-comment',
    'slop.stub-implementation',
  ])
})

test('recommended carries exactly the slop preset, and the two held-out concepts stay held out', () => {
  // The inverse of what this test used to assert, and the reversal is the point: a tool called
  // slop-gate whose default preset finds no slop has failed at its own name. What is worth guarding
  // now is that the two concepts measured *out* cannot drift back in — `slop.swallowed-error` (433
  // findings, ~19 of a 22-item sample deliberate) and `slop.emoji-in-code` (20/20 false on this
  // repository). Both remain reachable by concept; neither may arrive by preset.
  const inRecommended = Object.keys(PRESETS.recommended).filter((concept) => concept.startsWith('slop.'))

  expect(inRecommended.toSorted()).toEqual([
    'slop.as-any-cast',
    'slop.double-cast',
    'slop.narrative-comment',
    'slop.stub-implementation',
  ])
  expect(inRecommended).not.toContain('slop.swallowed-error')
  expect(inRecommended).not.toContain('slop.emoji-in-code')
  // `recommended` includes `slop` wholesale rather than restating it, so the two must not diverge.
  expect(inRecommended.toSorted()).toEqual(Object.keys(PRESETS.slop).toSorted())
})

test('astGrepRuleById returns nothing for an unknown id', () => {
  expect(astGrepRuleById('slop-not-a-rule')).toBeUndefined()
})
