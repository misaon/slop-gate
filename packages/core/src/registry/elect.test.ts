import { expect, test } from 'vitest'
import { electOwners } from './elect.ts'
import { ENGINE_PREFERENCE, type EngineId, type RuleEntry, type RuleRef } from './types.ts'

const entry = (over: Partial<RuleEntry> & Pick<RuleEntry, 'engine' | 'engineRuleId' | 'concepts'>): RuleEntry => ({
  tier: 0,
  priority: 100,
  severityDefault: 'warn',
  fixKind: 'none',
  fixTouches: [],
  requires: [],
  languages: ['ts'],
  docsUrl: 'https://example.test',
  since: '0.1.0',
  ...over,
})

const ALL_LANGUAGES = new Set(['ts' as const])
const NO_CAPABILITIES = new Set<never>()
// Every engine known to the registry: the tests below exercise tier/pin/tiebreak/capability/
// language filtering in isolation, so they should not also be exercising engine-participation
// filtering (covered separately below) — passing the full set is the "no filter" baseline.
const ALL_ENGINES: ReadonlySet<EngineId> = new Set(ENGINE_PREFERENCE)

/**
 * The sole owner of a concept, asserting there is exactly one.
 *
 * Ownership is `(concept, language)`-keyed, so the general answer is a list. Every test above this
 * file's per-language section is a single-language election where that list has one entry, and
 * asserting the whole `ConceptOwnership[]` in each would bury what each test is actually about.
 * The embedded `expect` is the point: if a change ever splits ownership in one of these, the test
 * says so rather than silently reading the first element.
 */
const ownerOf = (result: ReturnType<typeof electOwners>, concept: string): RuleRef | undefined => {
  const ownership = result.owners.get(concept) ?? []
  expect(ownership.length, `${concept} should have a single owner here`).toBeLessThanOrEqual(1)
  return ownership[0]?.owner
}

test('elects the single candidate and selects it for its engine', () => {
  const result = electOwners({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    enabledConcepts: new Set(['correctness.no-debugger']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(ownerOf(result, 'correctness.no-debugger')).toEqual({ engine: 'oxlint', engineRuleId: 'no-debugger' })
  expect(result.selection.get('oxlint')).toEqual(new Set(['no-debugger']))
  expect(result.suppressed).toEqual([])
  expect(result.uncovered).toEqual([])
})

test('prefers the lower tier and records why the loser was suppressed', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'eslint', engineRuleId: 'no-unused-vars', concepts: ['dead-code.unused-variable'], tier: 2 }),
      entry({ engine: 'oxlint', engineRuleId: 'no-unused-vars', concepts: ['dead-code.unused-variable'], tier: 0 }),
    ],
    enabledConcepts: new Set(['dead-code.unused-variable']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(ownerOf(result, 'dead-code.unused-variable')?.engine).toBe('oxlint')
  expect(result.selection.has('eslint')).toBe(false)
  expect(result.suppressed).toEqual([
    {
      concept: 'dead-code.unused-variable',
      languages: ['ts'],
      suppressed: { engine: 'eslint', engineRuleId: 'no-unused-vars' },
      winner: { engine: 'oxlint', engineRuleId: 'no-unused-vars' },
      reason: 'lower-tier',
    },
  ])
})

test('breaks a tier tie by engine preference', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'astgrep', engineRuleId: 'a', concepts: ['style.no-var'] }),
      entry({ engine: 'oxlint', engineRuleId: 'b', concepts: ['style.no-var'] }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(ownerOf(result, 'style.no-var')?.engine).toBe('oxlint')
  expect(result.suppressed[0]?.reason).toBe('engine-preference')
})

test('breaks a same-engine tie by rule id so elections are total', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'zeta', concepts: ['style.no-var'] }),
      entry({ engine: 'oxlint', engineRuleId: 'alpha', concepts: ['style.no-var'] }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(ownerOf(result, 'style.no-var')?.engineRuleId).toBe('alpha')
  expect(result.suppressed[0]?.reason).toBe('rule-id-tiebreak')
})

test('is order-independent: shuffling the entries changes nothing', () => {
  const entries = [
    entry({ engine: 'eslint', engineRuleId: 'x', concepts: ['style.no-var'], tier: 2 }),
    entry({ engine: 'oxlint', engineRuleId: 'y', concepts: ['style.no-var'] }),
    entry({ engine: 'astgrep', engineRuleId: 'z', concepts: ['style.no-var'] }),
  ]
  const forward = electOwners({
    entries,
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })
  const reversed = electOwners({
    entries: [...entries].reverse(),
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(reversed.owners).toEqual(forward.owners)
  expect(reversed.suppressed).toEqual(forward.suppressed)
})

test('excludes candidates whose required capabilities are unavailable', () => {
  const result = electOwners({
    entries: [
      entry({
        engine: 'tsgolint',
        engineRuleId: 'typed',
        concepts: ['slop.as-any-cast'],
        tier: 1,
        requires: ['types'],
      }),
      entry({ engine: 'astgrep', engineRuleId: 'untyped', concepts: ['slop.as-any-cast'] }),
    ],
    enabledConcepts: new Set(['slop.as-any-cast']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(ownerOf(result, 'slop.as-any-cast')?.engine).toBe('astgrep')
  expect(result.suppressed).toEqual([])
})

test('admits a capability-requiring candidate once the capability is present', () => {
  const result = electOwners({
    entries: [
      entry({
        engine: 'tsgolint',
        engineRuleId: 'typed',
        concepts: ['slop.as-any-cast'],
        tier: 1,
        requires: ['types'],
      }),
      entry({ engine: 'astgrep', engineRuleId: 'untyped', concepts: ['slop.as-any-cast'], tier: 2 }),
    ],
    enabledConcepts: new Set(['slop.as-any-cast']),
    capabilities: new Set(['types'] as const),
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(ownerOf(result, 'slop.as-any-cast')?.engine).toBe('tsgolint')
})

test('excludes a candidate whose engine did not participate in this run', () => {
  // Reproduces the M0 follow-up this closes: the registry can carry a `RuleEntry` for an engine
  // the caller never instantiated (the shipped registry's `eslint` entry exists purely so
  // `entries.test.ts` can prove a real overlap exists — see "the shipped registry contains a real
  // overlap"). A `RuleEntry` existing is not the same as its engine actually running, and arbitration
  // must not elect — or suppress in favour of — a rule whose engine will never be invoked.
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['dead-code.unused-variable'] }),
      entry({ engine: 'eslint', engineRuleId: 'slow', concepts: ['dead-code.unused-variable'], tier: 2 }),
    ],
    enabledConcepts: new Set(['dead-code.unused-variable']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: new Set(['oxlint']),
  })

  expect(ownerOf(result, 'dead-code.unused-variable')?.engine).toBe('oxlint')
  // Not just "oxlint wins" — the eslint entry must never appear as a suppressed loser either,
  // or a run with only oxlint would still report a suppression that never happened.
  expect(result.suppressed).toEqual([])
})

test('reports a concept as uncovered when its only candidate belongs to a non-participating engine', () => {
  const result = electOwners({
    entries: [entry({ engine: 'eslint', engineRuleId: 'only', concepts: ['style.no-var'], tier: 2 })],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: new Set(['oxlint']),
  })

  expect(result.owners.size).toBe(0)
  expect(result.uncovered).toEqual(['style.no-var'])
})

test('excludes candidates whose languages are absent from the repository, but does not report it as uncovered', () => {
  // A language mismatch is not a coverage gap: the candidate is otherwise fully capable (its engine
  // participated, no capability was missing, it isn't deprecated) and would run if this repository
  // contained CSS files. Reporting this as "no capable engine" would be noise about the repository's
  // shape (it has no CSS), not a real shortfall — see `ElectionResult.uncovered`'s doc comment.
  const result = electOwners({
    entries: [entry({ engine: 'biome-css', engineRuleId: 'css-rule', concepts: ['style.no-var'], languages: ['css'] })],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['ts' as const]),
    participatingEngines: ALL_ENGINES,
  })

  expect(result.owners.size).toBe(0)
  expect(result.uncovered).toEqual([])
})

test('separates a language mismatch from a genuine coverage gap within the same run', () => {
  const result = electOwners({
    entries: [
      // Right engine, no missing capability, not deprecated — this fails only because the repo
      // has no CSS files. Not a gap.
      entry({ engine: 'oxlint', engineRuleId: 'css-rule', concepts: ['style.no-var'], languages: ['css'] }),
      // Right language for this repo, but its only candidate's engine never participated in this
      // run at all — a real gap, independent of language.
      entry({ engine: 'eslint', engineRuleId: 'eslint-only', concepts: ['dead-code.unused-variable'], tier: 2 }),
    ],
    enabledConcepts: new Set(['style.no-var', 'dead-code.unused-variable']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['ts' as const]),
    participatingEngines: new Set(['oxlint']),
  })

  expect(result.uncovered).toEqual(['dead-code.unused-variable'])
})

test('reports a genuine coverage gap even when the missing piece is a capability, not language', () => {
  // The one candidate has the right engine and the right language, but requires a capability
  // (`types`) nothing in this run provides — a real gap no amount of matching language fixes.
  const result = electOwners({
    entries: [
      entry({ engine: 'tsgolint', engineRuleId: 'typed', concepts: ['slop.as-any-cast'], tier: 1, requires: ['types'] }),
    ],
    enabledConcepts: new Set(['slop.as-any-cast']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(result.uncovered).toEqual(['slop.as-any-cast'])
})

test('honours a pinned owner even when a faster candidate exists', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['dead-code.unused-variable'] }),
      entry({ engine: 'knip', engineRuleId: 'slow', concepts: ['dead-code.unused-variable'], tier: 2 }),
    ],
    enabledConcepts: new Set(['dead-code.unused-variable']),
    pinnedOwners: { 'dead-code.unused-variable': 'knip' },
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(ownerOf(result, 'dead-code.unused-variable')?.engine).toBe('knip')
  expect(result.suppressed[0]).toEqual({
    concept: 'dead-code.unused-variable',
    languages: ['ts'],
    suppressed: { engine: 'oxlint', engineRuleId: 'fast' },
    winner: { engine: 'knip', engineRuleId: 'slow' },
    reason: 'pinned-owner',
  })
})

test('never reports a concept slop-gate services itself as uncovered', () => {
  // `config.rule-overlap`, `config.dead-override` and `config.unused-suppression` are emitted by
  // the orchestrator (packages/core/src/run/check.ts), not by any engine rule — no `RuleEntry` will
  // ever claim them, so without this exclusion every user sees "N enabled concepts have no capable
  // engine" about the tool's own diagnostics on every single run.
  const result = electOwners({
    entries: [],
    enabledConcepts: new Set(['config.rule-overlap', 'config.dead-override', 'config.unused-suppression']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(result.uncovered).toEqual([])
})

test('reports a concept as uncovered when the pinned engine offers no rule', () => {
  const result = electOwners({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['style.no-var'] })],
    enabledConcepts: new Set(['style.no-var']),
    pinnedOwners: { 'style.no-var': 'eslint' },
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(result.uncovered).toEqual(['style.no-var'])
  expect(result.owners.size).toBe(0)
})

test('skips deprecated entries', () => {
  const result = electOwners({
    entries: [
      entry({
        engine: 'oxlint',
        engineRuleId: 'old',
        concepts: ['style.no-var'],
        deprecated: { since: '0.2.0' },
      }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(result.uncovered).toEqual(['style.no-var'])
})

test('enables a rule once even when it wins several concepts', () => {
  const multi = entry({
    engine: 'oxlint',
    engineRuleId: 'no-unused-vars',
    concepts: ['dead-code.unused-variable', 'dead-code.unused-import'],
  })
  const result = electOwners({
    entries: [multi],
    enabledConcepts: new Set(['dead-code.unused-variable', 'dead-code.unused-import']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(result.selection.get('oxlint')).toEqual(new Set(['no-unused-vars']))
  expect(result.owners.size).toBe(2)
})

test('ignores concepts that are not enabled', () => {
  const result = electOwners({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    enabledConcepts: new Set(),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(result.owners.size).toBe(0)
  expect(result.selection.size).toBe(0)
  expect(result.uncovered).toEqual([])
})

test('suppression order is independent of entry order in the pinned path', () => {
  const entries = [
    entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['style.no-var'] }),
    entry({ engine: 'astgrep', engineRuleId: 'mid', concepts: ['style.no-var'] }),
    entry({ engine: 'tsc', engineRuleId: 'other', concepts: ['style.no-var'] }),
    entry({ engine: 'knip', engineRuleId: 'slow', concepts: ['style.no-var'], tier: 2 }),
  ]
  const suppressedFor = (list: RuleEntry[]): string[] =>
    electOwners({
      entries: list,
      enabledConcepts: new Set(['style.no-var']),
      pinnedOwners: { 'style.no-var': 'knip' },
      capabilities: NO_CAPABILITIES,
      languages: ALL_LANGUAGES,
      participatingEngines: ALL_ENGINES,
    }).suppressed.map((s) => `${s.suppressed.engine}/${s.suppressed.engineRuleId}`)

  expect(suppressedFor([...entries].reverse())).toEqual(suppressedFor(entries))
})

test('labels a pinned suppression only when the pin is what rejected the rule', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['style.no-var'] }),
      entry({ engine: 'knip', engineRuleId: 'zeta', concepts: ['style.no-var'], tier: 2 }),
      entry({ engine: 'knip', engineRuleId: 'alpha', concepts: ['style.no-var'], tier: 2 }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    pinnedOwners: { 'style.no-var': 'knip' },
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })
  const reasonByRule = new Map(result.suppressed.map((s) => [s.suppressed.engineRuleId, s.reason]))

  expect(ownerOf(result, 'style.no-var')?.engineRuleId).toBe('alpha')
  expect(reasonByRule.get('fast')).toBe('pinned-owner')
  expect(reasonByRule.get('zeta')).toBe('rule-id-tiebreak')
})

test('a pin that agrees with arbitration still reports the real reason', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['style.no-var'] }),
      entry({ engine: 'eslint', engineRuleId: 'slow', concepts: ['style.no-var'], tier: 2 }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    pinnedOwners: { 'style.no-var': 'oxlint' },
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(result.suppressed[0]?.reason).toBe('lower-tier')
})

test('never records the winner as its own loser', () => {
  const duplicated = entry({ engine: 'oxlint', engineRuleId: 'dupe', concepts: ['style.no-var'] })
  const result = electOwners({
    entries: [duplicated, { ...duplicated, languages: ['ts', 'vue'] }],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(result.suppressed).toEqual([])
})

// --- `ineligible`: the rejection reasons `isCapable`/`isApplicable` used to discard silently -----

test('records a deprecated candidate as ineligible instead of discarding it silently', () => {
  const result = electOwners({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'old', concepts: ['style.no-var'], deprecated: { since: '0.2.0' } })],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(result.ineligible).toEqual([
    { concept: 'style.no-var', candidate: { engine: 'oxlint', engineRuleId: 'old' }, reason: 'deprecated' },
  ])
})

test('records a candidate whose engine did not participate as ineligible, distinct from a suppressed loser', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['dead-code.unused-variable'] }),
      entry({ engine: 'eslint', engineRuleId: 'slow', concepts: ['dead-code.unused-variable'], tier: 2 }),
    ],
    enabledConcepts: new Set(['dead-code.unused-variable']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: new Set(['oxlint']),
  })

  expect(result.suppressed).toEqual([])
  expect(result.ineligible).toEqual([
    {
      concept: 'dead-code.unused-variable',
      candidate: { engine: 'eslint', engineRuleId: 'slow' },
      reason: 'engine-not-participating',
    },
  ])
})

test('records a missing-capability candidate as ineligible, naming the absent capability', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'tsgolint', engineRuleId: 'typed', concepts: ['slop.as-any-cast'], tier: 1, requires: ['types'] }),
      entry({ engine: 'astgrep', engineRuleId: 'untyped', concepts: ['slop.as-any-cast'] }),
    ],
    enabledConcepts: new Set(['slop.as-any-cast']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(result.ineligible).toEqual([
    {
      concept: 'slop.as-any-cast',
      candidate: { engine: 'tsgolint', engineRuleId: 'typed' },
      reason: 'missing-capability',
      capability: 'types',
    },
  ])
})

test('records a language-mismatch candidate as ineligible, the same case elsewhere proven not to be uncovered', () => {
  const result = electOwners({
    entries: [entry({ engine: 'biome-css', engineRuleId: 'css-rule', concepts: ['style.no-var'], languages: ['css'] })],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['ts' as const]),
    participatingEngines: ALL_ENGINES,
  })

  expect(result.ineligible).toEqual([
    { concept: 'style.no-var', candidate: { engine: 'biome-css', engineRuleId: 'css-rule' }, reason: 'language-mismatch' },
  ])
})

test('records every otherwise-eligible candidate as ineligible when a pin names an engine with no rule here', () => {
  // Companion to 'reports a concept as uncovered when the pinned engine offers no rule': that test
  // only proves the concept goes uncovered. Before this field existed, `oxlint/fast` — fully
  // capable, fully applicable, exactly the kind of candidate that otherwise wins outright — vanished
  // with no record whatsoever the moment the pin named an engine with nothing to offer.
  const result = electOwners({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['style.no-var'] })],
    enabledConcepts: new Set(['style.no-var']),
    pinnedOwners: { 'style.no-var': 'eslint' },
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(result.uncovered).toEqual(['style.no-var'])
  expect(result.ineligible).toEqual([
    { concept: 'style.no-var', candidate: { engine: 'oxlint', engineRuleId: 'fast' }, reason: 'pinned-to-other-engine' },
  ])
})

test('does not record a pinned-elsewhere candidate as ineligible when the pin still elects a real winner', () => {
  // The 'pinned-to-other-engine' branch only fires when the pin leaves *no* winner at all. When a
  // winner is elected, every non-winning `ranked` candidate already gets a `SuppressionRecord`
  // (reason 'pinned-owner' when the pin is what rejected it) — it must not *also* appear here.
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'fast', concepts: ['dead-code.unused-variable'] }),
      entry({ engine: 'knip', engineRuleId: 'slow', concepts: ['dead-code.unused-variable'], tier: 2 }),
    ],
    enabledConcepts: new Set(['dead-code.unused-variable']),
    pinnedOwners: { 'dead-code.unused-variable': 'knip' },
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(ownerOf(result, 'dead-code.unused-variable')?.engine).toBe('knip')
  expect(result.ineligible).toEqual([])
})

test('never marks a fully eligible candidate as ineligible', () => {
  const result = electOwners({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'no-debugger', concepts: ['correctness.no-debugger'] })],
    enabledConcepts: new Set(['correctness.no-debugger']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(result.ineligible).toEqual([])
})

test('orders rule ids by code unit rather than locale collation', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'apple', concepts: ['style.no-var'] }),
      entry({ engine: 'oxlint', engineRuleId: 'Zebra', concepts: ['style.no-var'] }),
    ],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  // 'Z' (U+005A) precedes 'a' (U+0061) by code unit; locale collation would invert this.
  expect(ownerOf(result, 'style.no-var')?.engineRuleId).toBe('Zebra')
})

// ---------------------------------------------------------------------------
// Ownership is keyed by (concept, language), not by concept alone.
//
// The property this project sells is that exactly one rule may report a given concept **at a given
// place**. Keying uniqueness on the repository approximated that and got it wrong in one direction:
// two engines covering disjoint languages were treated as a collision when they can never meet on a
// file. These tests pin the corrected invariant.
// ---------------------------------------------------------------------------

test('two engines covering disjoint languages both own the concept, and neither is suppressed', () => {
  // The reproduction that motivated the change. Before it, oxlint won `correctness.parse-error`
  // outright in any repository containing both TypeScript and YAML, the YAML rule was recorded as
  // `lower-tier` suppressed, and `sgate check` emitted a `config.rule-overlap` for an overlap that
  // cannot happen — the two rules never see the same file.
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'parse-error', concepts: ['correctness.parse-error'], tier: 0 }),
      entry({
        engine: 'schema',
        engineRuleId: 'parse-error',
        concepts: ['correctness.parse-error'],
        tier: 2,
        languages: ['yaml'],
      }),
    ],
    enabledConcepts: new Set(['correctness.parse-error']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['ts', 'yaml']),
    participatingEngines: ALL_ENGINES,
  })

  expect(result.owners.get('correctness.parse-error')).toEqual([
    { owner: { engine: 'oxlint', engineRuleId: 'parse-error' }, languages: ['ts'] },
    { owner: { engine: 'schema', engineRuleId: 'parse-error' }, languages: ['yaml'] },
  ])
  expect(result.suppressed).toEqual([])
  expect(result.selection.get('oxlint')).toEqual(new Set(['parse-error']))
  expect(result.selection.get('schema')).toEqual(new Set(['parse-error']))
})

test('a genuine collision on a shared language is still suppressed, and names that language', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'no-dupe-keys', concepts: ['correctness.no-duplicate-object-key'], tier: 0 }),
      entry({ engine: 'eslint', engineRuleId: 'no-dupe-keys', concepts: ['correctness.no-duplicate-object-key'], tier: 2 }),
    ],
    enabledConcepts: new Set(['correctness.no-duplicate-object-key']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
  })

  expect(result.suppressed).toEqual([
    {
      concept: 'correctness.no-duplicate-object-key',
      languages: ['ts'],
      suppressed: { engine: 'eslint', engineRuleId: 'no-dupe-keys' },
      winner: { engine: 'oxlint', engineRuleId: 'no-dupe-keys' },
      reason: 'lower-tier',
    },
  ])
})

test('suppresses only on the languages the candidates actually share', () => {
  // The partial-overlap case, which neither keying scheme handles by accident: oxlint owns `ts`
  // uncontested, both contest `yaml`, and the suppression record names `yaml` alone.
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'wide', concepts: ['correctness.parse-error'], tier: 0, languages: ['ts', 'yaml'] }),
      entry({ engine: 'schema', engineRuleId: 'narrow', concepts: ['correctness.parse-error'], tier: 2, languages: ['yaml'] }),
    ],
    enabledConcepts: new Set(['correctness.parse-error']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['ts', 'yaml']),
    participatingEngines: ALL_ENGINES,
  })

  expect(result.owners.get('correctness.parse-error')).toEqual([
    { owner: { engine: 'oxlint', engineRuleId: 'wide' }, languages: ['ts', 'yaml'] },
  ])
  expect(result.suppressed).toEqual([
    {
      concept: 'correctness.parse-error',
      languages: ['yaml'],
      suppressed: { engine: 'schema', engineRuleId: 'narrow' },
      winner: { engine: 'oxlint', engineRuleId: 'wide' },
      reason: 'lower-tier',
    },
  ])
})

test('records one suppression per losing rule, not one per language it lost on', () => {
  // Volume matters: a loser beaten across four languages is one fact about one rule, and reporting
  // it four times would make `rules conflicts` and `config.rule-overlap` noisier the moment this
  // change landed. The languages ride along on the single record instead.
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'w', concepts: ['dead-code.unused-variable'], tier: 0, languages: ['ts', 'tsx', 'js', 'jsx'] }),
      entry({ engine: 'eslint', engineRuleId: 'l', concepts: ['dead-code.unused-variable'], tier: 2, languages: ['ts', 'tsx', 'js', 'jsx'] }),
    ],
    enabledConcepts: new Set(['dead-code.unused-variable']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['ts', 'tsx', 'js', 'jsx']),
    participatingEngines: ALL_ENGINES,
  })

  expect(result.suppressed).toHaveLength(1)
  expect(result.suppressed[0]?.languages).toEqual(['js', 'jsx', 'ts', 'tsx'])
})

test('ownership lists only the languages the repository actually contains', () => {
  const result = electOwners({
    entries: [entry({ engine: 'oxlint', engineRuleId: 'r', concepts: ['style.no-var'], languages: ['ts', 'tsx', 'vue'] })],
    enabledConcepts: new Set(['style.no-var']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['ts', 'vue']),
    participatingEngines: ALL_ENGINES,
  })

  expect(result.owners.get('style.no-var')).toEqual([
    { owner: { engine: 'oxlint', engineRuleId: 'r' }, languages: ['ts', 'vue'] },
  ])
})

test('a pin applies per language and leaves the pinned engine owning only what it covers', () => {
  const result = electOwners({
    entries: [
      entry({ engine: 'oxlint', engineRuleId: 'wide', concepts: ['correctness.parse-error'], tier: 0, languages: ['ts', 'yaml'] }),
      entry({ engine: 'schema', engineRuleId: 'narrow', concepts: ['correctness.parse-error'], tier: 2, languages: ['yaml'] }),
    ],
    enabledConcepts: new Set(['correctness.parse-error']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['ts', 'yaml']),
    participatingEngines: ALL_ENGINES,
    pinnedOwners: { 'correctness.parse-error': 'schema' },
  })

  // The pin wins `yaml`, where schema has a rule. `ts` has no schema candidate at all, so the pin
  // leaves it unowned rather than handing it to an engine that cannot check it.
  expect(result.owners.get('correctness.parse-error')).toEqual([
    { owner: { engine: 'schema', engineRuleId: 'narrow' }, languages: ['yaml'] },
  ])
})

// ---------------------------------------------------------------------------
// Availability gates ownership.
//
// An engine that is not installed cannot own a concept: the next-ranked eligible entry takes it.
// Without this, an optional engine that wins a concept and is then absent takes the concept down
// with it — the always-available engine that could have reported it has been arbitrated out, and
// the finding is lost to a gap we elected rather than one we had.
// ---------------------------------------------------------------------------

const parseError = (over: Partial<RuleEntry> = {}): RuleEntry =>
  entry({ engine: 'oxlint', engineRuleId: 'parse-error', concepts: ['correctness.parse-error'], ...over })

test('hands the concept to the next-ranked engine when the winner is not installed', () => {
  const result = electOwners({
    entries: [
      parseError({ engine: 'actionlint', engineRuleId: 'syntax-check', tier: 0, languages: ['github-workflow'] }),
      parseError({ engine: 'schema', engineRuleId: 'parse-error', tier: 2, languages: ['github-workflow'] }),
    ],
    enabledConcepts: new Set(['correctness.parse-error']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['github-workflow']),
    participatingEngines: ALL_ENGINES,
    unavailableEngines: new Set(['actionlint']),
  })

  expect(ownerOf(result, 'correctness.parse-error')).toEqual({ engine: 'schema', engineRuleId: 'parse-error' })
  // Not a suppression: the actionlint rule never contested anything, so calling it a loser would
  // put a rule overlap in the output for two engines that never met.
  expect(result.suppressed).toEqual([])
  expect(result.ineligible).toEqual([
    {
      concept: 'correctness.parse-error',
      candidate: { engine: 'actionlint', engineRuleId: 'syntax-check' },
      reason: 'engine-unavailable',
    },
  ])
})

test('records what an absent engine would have owned, so the run can say so', () => {
  const result = electOwners({
    entries: [
      parseError({ engine: 'actionlint', engineRuleId: 'syntax-check', tier: 0, languages: ['github-workflow'] }),
      parseError({ engine: 'schema', engineRuleId: 'parse-error', tier: 2, languages: ['github-workflow'] }),
    ],
    enabledConcepts: new Set(['correctness.parse-error']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['github-workflow']),
    participatingEngines: ALL_ENGINES,
    unavailableEngines: new Set(['actionlint']),
  })

  expect(result.displaced).toEqual([
    {
      concept: 'correctness.parse-error',
      languages: ['github-workflow'],
      wouldOwn: { engine: 'actionlint', engineRuleId: 'syntax-check' },
      insteadOwnedBy: { engine: 'schema', engineRuleId: 'parse-error' },
    },
  ])
})

test('reports no owner at all, and says why, when the only candidate is not installed', () => {
  const result = electOwners({
    entries: [parseError({ engine: 'actionlint', engineRuleId: 'syntax-check', languages: ['github-workflow'] })],
    enabledConcepts: new Set(['correctness.parse-error']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['github-workflow']),
    participatingEngines: ALL_ENGINES,
    unavailableEngines: new Set(['actionlint']),
  })

  expect(result.owners.get('correctness.parse-error')).toBeUndefined()
  expect(result.uncovered).toEqual(['correctness.parse-error'])
  expect(result.displaced).toEqual([
    {
      concept: 'correctness.parse-error',
      languages: ['github-workflow'],
      wouldOwn: { engine: 'actionlint', engineRuleId: 'syntax-check' },
      insteadOwnedBy: undefined,
    },
  ])
})

test('does not displace anything when the absent engine would have lost anyway', () => {
  // A slower absent engine changes nothing, and saying "actionlint would own this" when it would
  // not is worse than saying nothing — it sends a reader to install a tool that would not help.
  const result = electOwners({
    entries: [
      parseError({ engine: 'oxlint', engineRuleId: 'parse-error', tier: 0 }),
      parseError({ engine: 'eslint', engineRuleId: 'parse-error', tier: 2 }),
    ],
    enabledConcepts: new Set(['correctness.parse-error']),
    capabilities: NO_CAPABILITIES,
    languages: ALL_LANGUAGES,
    participatingEngines: ALL_ENGINES,
    unavailableEngines: new Set(['eslint']),
  })

  expect(ownerOf(result, 'correctness.parse-error')).toEqual({ engine: 'oxlint', engineRuleId: 'parse-error' })
  expect(result.displaced).toEqual([])
})

test('tells "not installed" apart from "not registered"', () => {
  const notRegistered = electOwners({
    entries: [parseError({ engine: 'actionlint', engineRuleId: 'syntax-check', languages: ['github-workflow'] })],
    enabledConcepts: new Set(['correctness.parse-error']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['github-workflow']),
    participatingEngines: new Set(['oxlint']),
  })
  const notInstalled = electOwners({
    entries: [parseError({ engine: 'actionlint', engineRuleId: 'syntax-check', languages: ['github-workflow'] })],
    enabledConcepts: new Set(['correctness.parse-error']),
    capabilities: NO_CAPABILITIES,
    languages: new Set(['github-workflow']),
    participatingEngines: ALL_ENGINES,
    unavailableEngines: new Set(['actionlint']),
  })

  // Two different facts a user comparing two machines has to be able to tell apart.
  expect(notRegistered.ineligible[0]?.reason).toBe('engine-not-participating')
  expect(notInstalled.ineligible[0]?.reason).toBe('engine-unavailable')
  expect(notRegistered.displaced).toEqual([])
})
