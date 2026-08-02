import { expect, test } from 'vitest'
import { isConceptId } from '../concepts/catalogue.ts'
import { PRESETS } from '../config/presets.ts'
import { MANUAL_RULE_EXCLUSIONS } from './exclusions.ts'
import { LANGUAGES } from '../languages.ts'
import { electOwners } from './elect.ts'
import { RULE_ENTRIES } from './entries.ts'
import { ENGINE_PREFERENCE, ruleRefKey, type RuleEntry } from './types.ts'

// `RULE_ENTRIES` is deliberately `as const satisfies readonly RuleEntry[]` so each entry keeps
// its narrow literal type (see registry/entries.ts). That means entries which omit an optional
// field, like `classify`, don't structurally have that key, and the union's `engine` type only
// includes the literals actually present. The checks below need the declared `RuleEntry` shape
// instead, so they read through this widened view rather than `RULE_ENTRIES` directly.
const WIDENED_ENTRIES: readonly RuleEntry[] = RULE_ENTRIES

test('every referenced concept exists in the catalogue', () => {
  const unknown = RULE_ENTRIES.flatMap((e) => e.concepts.filter((c) => !isConceptId(c)))
  expect(unknown).toEqual([])
})

test('every entry declares at least one concept and one language', () => {
  for (const entry of RULE_ENTRIES) {
    expect(entry.concepts.length, ruleRefKey(entry)).toBeGreaterThan(0)
    expect(entry.languages.length, ruleRefKey(entry)).toBeGreaterThan(0)
  }
})

test('every declared language is known', () => {
  const unknown = RULE_ENTRIES.flatMap((e) => e.languages.filter((l) => !LANGUAGES.includes(l)))
  expect(unknown).toEqual([])
})

test('every entry has an absolute documentation url', () => {
  for (const entry of RULE_ENTRIES) {
    expect(entry.docsUrl, ruleRefKey(entry)).toMatch(/^https:\/\//)
  }
})

test('every engine is listed in the preference order', () => {
  const missing = RULE_ENTRIES.map((e) => e.engine).filter((e) => !ENGINE_PREFERENCE.includes(e))
  expect(missing).toEqual([])
})

test('an entry that declares a fix also declares what the fix touches', () => {
  for (const entry of RULE_ENTRIES) {
    if (entry.fixKind === 'none') expect(entry.fixTouches, ruleRefKey(entry)).toEqual([])
    else expect(entry.fixTouches.length, ruleRefKey(entry)).toBeGreaterThan(0)
  }
})

test('no rule entry claims a formatting concept', () => {
  // The formatter is the permanent owner of `formatting.*` (spec 5.3).
  const offenders = WIDENED_ENTRIES.filter(
    (e) => e.engine !== 'oxfmt' && e.concepts.some((c) => c.startsWith('formatting.')),
  )
  expect(offenders.map(ruleRefKey)).toEqual([])
})

test('every rule covering more than one concept can attribute a finding to one of them', () => {
  for (const entry of WIDENED_ENTRIES) {
    if (entry.concepts.length > 1) {
      expect(entry.classify, ruleRefKey(entry)).toBeDefined()
      expect(entry.classify!.length, ruleRefKey(entry)).toBeGreaterThan(0)
    }
  }
})

test('every classify target is one of the concepts the rule claims', () => {
  for (const entry of WIDENED_ENTRIES) {
    for (const rule of entry.classify ?? []) {
      expect(entry.concepts as readonly string[], ruleRefKey(entry)).toContain(rule.concept)
    }
  }
})

test('every classify pattern is a valid regular expression', () => {
  for (const entry of WIDENED_ENTRIES) {
    for (const rule of entry.classify ?? []) {
      expect(() => new RegExp(rule.messagePattern), `${ruleRefKey(entry)}: ${rule.messagePattern}`).not.toThrow()
    }
  }
})

test('the shipped registry contains a real overlap and resolves it to oxlint', () => {
  // This tests the registry's *contents* — that a genuine tier overlap exists between two shipped
  // entries — not a real run's engine set, so both engines that own an entry in `RULE_ENTRIES` are
  // named as participating here even though a real `sgate check` only ever instantiates oxlint
  // (packages/cli/src/commands/check.ts). See elect.test.ts for the run-time filter itself.
  const result = electOwners({
    entries: RULE_ENTRIES,
    enabledConcepts: new Set(['dead-code.unused-variable']),
    capabilities: new Set(),
    languages: new Set(['ts']),
    participatingEngines: new Set(['oxlint', 'eslint']),
  })

  expect(result.suppressed).toHaveLength(1)
  expect(result.owners.get('dead-code.unused-variable')?.[0]?.owner.engine).toBe('oxlint')
  expect(result.suppressed[0]?.reason).toBe('lower-tier')
})

test('no two entries share an engine and rule id', () => {
  const keys = WIDENED_ENTRIES.map(ruleRefKey)
  expect(keys).toEqual([...new Set(keys)])
})

test('every manually excluded rule exists, and none of its concepts reaches `recommended`', () => {
  // What makes `MANUAL_RULE_EXCLUSIONS` data rather than prose. A hand-written engine's rules enter
  // `recommended` only by being listed in `config/presets.ts`, so nothing applies that table the way
  // the oxlint generator applies `RULE_EXCLUSIONS` — without this, a written reason and the preset
  // could disagree and neither would notice. That is already true of the two `slop.*` exclusions,
  // whose reasons live in a comment.
  const recommended = PRESETS.recommended
  for (const [key, exclusion] of Object.entries(MANUAL_RULE_EXCLUSIONS)) {
    const entry = WIDENED_ENTRIES.find((candidate) => ruleRefKey(candidate) === key)
    expect(entry, `${key} is excluded but has no registry entry`).toBeDefined()
    expect(exclusion.reason.length, `${key} needs a real reason`).toBeGreaterThan(80)
    for (const concept of entry!.concepts) {
      expect(recommended[concept], `${key} is excluded but ${concept} is in \`recommended\``).toBeUndefined()
    }
  }
})

test('actionlint claims neither parse errors nor duplicate keys, which stay with the schema engine', () => {
  // The reversal the corpus measurement forced, asserted so it cannot be undone by accident. Zero
  // findings of either kind across 403 real workflow files, and the M0 follow-ups record that
  // actionlint reports an unresolved YAML alias at `line: 0, column: 0` where the schema engine gives
  // the exact token — so this is the concept ownership that was *not* transferred.
  const owned = WIDENED_ENTRIES.filter((entry) => entry.engine === 'actionlint').flatMap((entry) => entry.concepts)
  expect(owned).not.toContain('correctness.parse-error')
  expect(owned).not.toContain('correctness.no-duplicate-object-key')

  const schema = WIDENED_ENTRIES.filter(
    (entry) => entry.engine === 'schema' && entry.languages.includes('github-workflow'),
  ).flatMap((entry) => entry.concepts)
  expect(schema).toContain('correctness.parse-error')
  expect(schema).toContain('correctness.no-duplicate-object-key')
})
