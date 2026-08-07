import { expect, test } from 'vitest'
import { buildRuleCatalogue } from '../queries/catalogue.ts'
import { IMPACTS, impactOf } from './impact.ts'
import { RULE_RELIABILITY, reliabilityPercent } from './reliability.ts'

test('the group decides, unless the concept is a stated exception', () => {
  expect(impactOf('security.anything', 'security')).toBe(3)
  expect(impactOf('pedantic.anything', 'pedantic')).toBe(1)
  // Its group says 2; a redundant backslash still matches, so it is untidy.
  expect(impactOf('correctness.no-useless-escape', 'correctness')).toBe(1)
  // Its group says 1; a discarded expression is usually a forgotten `await`.
  expect(impactOf('dead-code.no-op-expression', 'dead-code')).toBe(2)
})

test('every rule in the catalogue lands on a defined level', () => {
  const catalogue = buildRuleCatalogue()
  expect(catalogue.length).toBeGreaterThan(900)
  for (const entry of catalogue) {
    expect(IMPACTS[entry.impact], entry.ruleRefKey).toBeDefined()
  }
})

test('reliability is absent rather than assumed', () => {
  const catalogue = buildRuleCatalogue()
  const measured = catalogue.filter((entry) => entry.reliability !== null)

  // The point of the axis: a rule nobody has read the findings of reports nothing, not 100%.
  expect(measured.length).toBeLessThan(catalogue.length / 10)
  expect(measured.length).toBe(Object.keys(RULE_RELIABILITY).length)
  for (const entry of catalogue) {
    if (entry.reliability === null) continue
    expect(entry.reliability.correct).toBeLessThanOrEqual(entry.reliability.sampled)
    expect(entry.reliability.source.length).toBeGreaterThan(40)
  }
})

test('reliabilityPercent rounds to whole percent', () => {
  expect(reliabilityPercent({ sampled: 174, correct: 11, source: '', measuredAgainst: '' })).toBe(6)
  expect(reliabilityPercent({ sampled: 5, correct: 0, source: '', measuredAgainst: '' })).toBe(0)
  expect(reliabilityPercent({ sampled: 10, correct: 1, source: '', measuredAgainst: '' })).toBe(10)
})

test('options say whether the rule can be tuned and whether we tune it', () => {
  const byKey = new Map(buildRuleCatalogue().map((entry) => [entry.ruleRefKey, entry]))

  expect(byKey.get('oxlint/eqeqeq')?.options).toBe('tuned')
  expect(byKey.get('oxlint/eqeqeq')?.optionReason).toContain('smart')
  // Accepts options per oxlint's own schema; slop-gate takes the default.
  expect(byKey.get('oxlint/curly')?.options).toBe('default')
  // Takes no options at all, so the default is the only shape there is.
  expect(byKey.get('oxlint/no-debugger')?.options).toBe('none')
})

test('a rule whose impact outranks the level it is reported at is a gap worth seeing', () => {
  const mismatched = buildRuleCatalogue().filter(
    (entry) => entry.status === 'recommended' && entry.impact === 3 && entry.level !== 'error',
  )

  // A published advisory and a credential in CI both exit 0 today. Recorded rather than fixed here:
  // aligning what gates a build to impact is a breaking change and wants its own release.
  //
  // The security rules the audits added do not join them, and the line is deliberate: one that reports an
  // API a caller may be using safely — `security.target-blank`, `security.dangerous-html`,
  // `security.script-url` — is impact 2, and one that reports a hole whatever the value —
  // `security.eval-usage`, `security.function-constructor` — is impact 3 at `error`.
  expect(mismatched.map((entry) => entry.concept).sort()).toEqual([
    'security.vulnerable-dependency',
    'security.workflow-hardcoded-credential',
  ])
})
