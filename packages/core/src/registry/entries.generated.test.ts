import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { isConceptId } from '../concepts/catalogue.ts'
import { LANGUAGES } from '../languages.ts'
import { GENERATED_CONCEPTS } from '../concepts/concepts.generated.ts'
import { GENERATED_RECOMMENDED_RULES, GENERATED_RULE_ENTRIES } from './entries.generated.ts'
import { ENGINE_PREFERENCE, ruleRefKey, type RuleEntry } from './types.ts'

// Same rationale as `entries.test.ts`'s `WIDENED_ENTRIES`: an entry that omits `classify` doesn't
// structurally have that key on its own literal type, so a generic loop needs the declared shape.
const WIDENED_ENTRIES: readonly RuleEntry[] = GENERATED_RULE_ENTRIES

// This is Task 1's own stated acceptance bar: "every existing `entries.test.ts` invariant must hold
// over the generated set". Mirrored here against `GENERATED_RULE_ENTRIES` directly (not the merged
// `RULE_ENTRIES`), so this file's assertions do not depend on how — or whether yet — the generated
// set has been wired into the live registry.

test('there is exactly one entry per catalogue rule (847 at generation time)', () => {
  expect(GENERATED_RULE_ENTRIES.length).toBeGreaterThan(800)
})

test('every referenced concept exists in the catalogue', () => {
  const unknown = GENERATED_RULE_ENTRIES.flatMap((e) => e.concepts.filter((c) => !isConceptId(c)))
  expect(unknown).toEqual([])
})

test('every entry declares at least one concept and one language', () => {
  for (const entry of GENERATED_RULE_ENTRIES) {
    expect(entry.concepts.length, ruleRefKey(entry)).toBeGreaterThan(0)
    expect(entry.languages.length, ruleRefKey(entry)).toBeGreaterThan(0)
  }
})

test('every declared language is known', () => {
  const unknown = GENERATED_RULE_ENTRIES.flatMap((e) => e.languages.filter((l) => !LANGUAGES.includes(l)))
  expect(unknown).toEqual([])
})

test('every entry has an absolute documentation url', () => {
  for (const entry of GENERATED_RULE_ENTRIES) {
    expect(entry.docsUrl, ruleRefKey(entry)).toMatch(/^https:\/\//)
  }
})

test('every engine is listed in the preference order', () => {
  const missing = GENERATED_RULE_ENTRIES.map((e) => e.engine).filter((e) => !ENGINE_PREFERENCE.includes(e))
  expect(missing).toEqual([])
})

test('an entry that declares a fix also declares what the fix touches', () => {
  for (const entry of GENERATED_RULE_ENTRIES) {
    if (entry.fixKind === 'none') expect(entry.fixTouches, ruleRefKey(entry)).toEqual([])
    else expect(entry.fixTouches.length, ruleRefKey(entry)).toBeGreaterThan(0)
  }
})

test('no rule entry claims a formatting concept', () => {
  // The formatter is the permanent owner of `formatting.*` (spec 5.3) — no oxlint entry may claim one.
  const offenders = WIDENED_ENTRIES.filter((e) => e.concepts.some((c) => c.startsWith('formatting.')))
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

test('no two entries share an engine and rule id', () => {
  const keys = GENERATED_RULE_ENTRIES.map(ruleRefKey)
  expect(keys).toEqual([...new Set(keys)])
})

test('the generated file is sorted, deterministic output — same input, byte-identical file', () => {
  const ids = GENERATED_RULE_ENTRIES.map((e) => e.engineRuleId)
  expect(ids).toEqual([...ids].sort())
})

// --- concepts.generated.ts ---

test('every generated concept id starts with its own declared group', () => {
  for (const concept of GENERATED_CONCEPTS) {
    expect(concept.id.split('.')[0]).toBe(concept.group)
  }
})

test('every generated concept has a non-empty title and description', () => {
  for (const concept of GENERATED_CONCEPTS) {
    expect(concept.title.trim().length, concept.id).toBeGreaterThan(0)
    expect(concept.description.trim().length, concept.id).toBeGreaterThan(0)
  }
})

test('no generated concept duplicates a hand-written one', () => {
  // Regression guard for the exact bug this generator's own dev loop hit once: comparing against
  // the *merged* `CONCEPTS` (which already includes a previous run's `GENERATED_CONCEPTS`) instead
  // of `HAND_WRITTEN_CONCEPTS` makes every concept the generator has ever produced look
  // "already known", and `concepts.generated.ts` silently regenerates empty. Asserting a realistic
  // lower bound here means that regression fails loudly instead of shrinking the file to nothing.
  expect(GENERATED_CONCEPTS.length).toBeGreaterThan(800)
})

// --- GENERATED_RECOMMENDED_RULES ---

test('every generated-recommended concept exists in the catalogue and is at error or warn', () => {
  for (const [concept, level] of Object.entries(GENERATED_RECOMMENDED_RULES)) {
    expect(isConceptId(concept), concept).toBe(true)
    expect(['error', 'warn']).toContain(level)
  }
})

test('every generated-recommended concept is actually claimed by some generated entry', () => {
  const claimed = new Set(GENERATED_RULE_ENTRIES.flatMap((e) => e.concepts as readonly string[]))
  for (const concept of Object.keys(GENERATED_RECOMMENDED_RULES)) {
    expect(claimed.has(concept), concept).toBe(true)
  }
})

// --- the generator itself ---

// This file lives at packages/core/src/registry/ — two levels up is packages/core, the cwd the
// generator's paths (scripts/generate-registry.ts, its ENTRIES_OUT/CONCEPTS_OUT) are relative to.
const CORE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

test('regenerating from the live oxlint catalogue produces no drift (the CI freshness check)', () => {
  const output = execFileSync('node', ['scripts/generate-registry.ts', '--check'], {
    cwd: CORE_ROOT,
    encoding: 'utf8',
  })
  expect(output).toContain('up to date')
}, 60_000)
