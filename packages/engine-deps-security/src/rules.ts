import { compareStrings } from '@misaon/slop-gate-core'

/**
 * Nothing upstream names these, so they are defined here and deliberately kept distinct from the concept ids they
 * map to: a concept is what the user configures, an `engineRuleId` is what this adapter switched on, and collapsing
 * the two would leave `sgate rules why` with nothing to explain.
 */
export const DEPS_SECURITY_RULES = {
  vulnerability: 'security.vulnerable-dependency',
  malware: 'security.malicious-dependency',
  'missing-lockfile-entry': 'deps.missing-lockfile-entry',
  /**
   * The two ways this engine can look at less than it appears to — a snapshot old enough to be missing findings,
   * and a lockfile format it cannot read — are one concept rather than two: both say "this check did not cover
   * everything, here is why", so splitting them would offer a choice nobody wants.
   */
  'coverage-gap': 'deps.advisory-coverage-gap',
} as const

export type DepsSecurityRuleId = keyof typeof DEPS_SECURITY_RULES

export const DEPS_SECURITY_RULE_IDS: readonly DepsSecurityRuleId[] = (
  Object.keys(DEPS_SECURITY_RULES) as DepsSecurityRuleId[]
).sort(compareStrings)

export function conceptForEngineRuleId(rule: DepsSecurityRuleId): string {
  return DEPS_SECURITY_RULES[rule]
}

/**
 * A GHSA id resolves on GitHub's advisory pages, which carry the write-up, the affected ranges and the fix.
 * Everything else — the malicious feed included — is only ever addressable on OSV.
 */
export function advisoryUrl(id: string): string {
  return id.startsWith('GHSA-') ? `https://github.com/advisories/${id}` : `https://osv.dev/vulnerability/${id}`
}
