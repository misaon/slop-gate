import { compareStrings } from '@misaon/slop-gate-core'

export const DEPS_SECURITY_RULES = {
  vulnerability: 'security.vulnerable-dependency',
  malware: 'security.malicious-dependency',
  'missing-lockfile-entry': 'deps.missing-lockfile-entry',
  'coverage-gap': 'deps.advisory-coverage-gap',
} as const

export type DepsSecurityRuleId = keyof typeof DEPS_SECURITY_RULES

export const DEPS_SECURITY_RULE_IDS: readonly DepsSecurityRuleId[] = (
  Object.keys(DEPS_SECURITY_RULES) as DepsSecurityRuleId[]
).sort(compareStrings)

export function conceptForEngineRuleId(rule: DepsSecurityRuleId): string {
  return DEPS_SECURITY_RULES[rule]
}

export function advisoryUrl(id: string): string {
  return id.startsWith('GHSA-') ? `https://github.com/advisories/${id}` : `https://osv.dev/vulnerability/${id}`
}
