export const HADOLINT_RULES = [
  { engineRuleId: 'DL3006', concept: 'config.dockerfile-base-image-untagged' },
  { engineRuleId: 'DL3007', concept: 'config.dockerfile-base-image-mutable-tag' },
  { engineRuleId: 'DL3025', concept: 'config.dockerfile-entrypoint-form' },
  { engineRuleId: 'DL3029', concept: 'config.dockerfile-platform' },
  { engineRuleId: 'DL3042', concept: 'config.dockerfile-package-cache' },
  { engineRuleId: 'DL4006', concept: 'config.dockerfile-pipefail' },
] as const

export type HadolintRuleId = (typeof HADOLINT_RULES)[number]['engineRuleId']

export const HADOLINT_RULE_IDS: readonly string[] = [...new Set(HADOLINT_RULES.map((rule) => rule.engineRuleId))]

export const EMBEDDED_SHELLCHECK_PREFIX = 'SC'

export type SourceExclusion = {
  readonly engineRuleId: HadolintRuleId
  readonly matches: (instructionLine: string) => boolean
  readonly reason: string
}

export const SOURCE_EXCLUSIONS: readonly SourceExclusion[] = [
  {
    engineRuleId: 'DL3025',
    matches: (line) => /^\s*HEALTHCHECK\b/i.test(line),
    reason:
      'hadolint emits "Use arguments JSON notation for CMD and ENTRYPOINT arguments" for a `HEALTHCHECK ' +
      '… CMD` as well as for a real `CMD`/`ENTRYPOINT`, and the advice is only right for the latter. ' +
      'The reason to prefer JSON ("exec") form for an entrypoint is signal delivery: shell form wraps ' +
      'the process in `/bin/sh -c`, which does not forward `SIGTERM`, so the container is killed rather ' +
      'than shut down. A `HEALTHCHECK` command is a short-lived probe whose exit status is all Docker ' +
      'reads; nothing signals it, and shell form is what Docker\'s own documentation uses. Measured: 11 ' +
      'of the 23 corpus findings were `HEALTHCHECK`, and the other 12 were genuine `CMD`/`ENTRYPOINT` ' +
      'shell forms — so this exclusion is what takes the rule from 12/23 to 12/12 rather than dropping ' +
      'it entirely.',
  },
]

export function conceptForEngineRuleId(engineRuleId: string): string | undefined {
  return HADOLINT_RULES.find((rule) => rule.engineRuleId === engineRuleId)?.concept
}
