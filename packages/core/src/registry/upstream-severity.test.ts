import { expect, test } from 'vitest'
import { RULE_ENTRIES } from './entries.ts'
import { RULE_OVERRIDES } from './overrides.ts'
import { ruleRefKey, type RuleEntry } from './types.ts'
import { capToUpstream, UPSTREAM_SEVERITY } from './upstream-severity.ts'

const WIDENED_ENTRIES: readonly RuleEntry[] = RULE_ENTRIES

test('a milder upstream level lowers ours', () => {
  expect(capToUpstream('error', 'nextjs/no-img-element')).toBe('warn')
})

test('an upstream `off` caps at `warn` rather than removing the rule', () => {
  expect(capToUpstream('error', 'react/no-unsafe')).toBe('warn')
})

test('a stricter upstream level never raises ours', () => {
  expect(capToUpstream('warn', 'nextjs/no-img-element')).toBe('warn')
})

test('a rule with no upstream data is left exactly as the category mapping produced it', () => {
  expect(capToUpstream('error', 'no-debugger')).toBe('error')
  expect(capToUpstream('warn', 'no-debugger')).toBe('warn')
})

test('every rule the table names exists in the registry', () => {
  const known = new Set(WIDENED_ENTRIES.filter((entry) => entry.engine === 'oxlint').map((entry) => entry.engineRuleId))
  const unknown = Object.keys(UPSTREAM_SEVERITY).filter((id) => !known.has(id))
  expect(unknown).toEqual([])
})

test('every source names a package, a version and a config', () => {
  for (const [id, upstream] of Object.entries(UPSTREAM_SEVERITY)) {
    expect(upstream.source, id).toMatch(/@\d+\.\d+\.\d+ \S+$/)
  }
})

test('the shipped registry actually applies the cap, or an override states why it does not', () => {
  for (const [id, upstream] of Object.entries(UPSTREAM_SEVERITY)) {
    if (upstream.level === 'error') continue
    const entry = WIDENED_ENTRIES.find((candidate) => candidate.engine === 'oxlint' && candidate.engineRuleId === id)
    const overridden = RULE_OVERRIDES[id]?.severityDefault
    expect(
      entry!.severityDefault,
      `${ruleRefKey(entry!)} is ${upstream.level} in ${upstream.source}; keeping it stricter needs a RULE_OVERRIDES severityDefault with a measurement`,
    ).toBe(overridden ?? 'warn')
  }
})
