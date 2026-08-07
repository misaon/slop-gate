export const HADOLINT_RULES = [
  { engineRuleId: 'DL3006', concept: 'config.dockerfile-base-image-untagged' },
  { engineRuleId: 'DL3007', concept: 'config.dockerfile-base-image-mutable-tag' },
  { engineRuleId: 'DL3025', concept: 'config.dockerfile-entrypoint-form' },
  { engineRuleId: 'DL3029', concept: 'config.dockerfile-platform' },
  { engineRuleId: 'DL3042', concept: 'config.dockerfile-package-cache' },
  { engineRuleId: 'DL4006', concept: 'config.dockerfile-pipefail' },
  { engineRuleId: 'DL3000', concept: 'config.dockerfile-absolute-workdir' },
  { engineRuleId: 'DL3001', concept: 'config.dockerfile-pointless-command' },
  { engineRuleId: 'DL3002', concept: 'config.dockerfile-last-user-root' },
  { engineRuleId: 'DL3004', concept: 'config.dockerfile-sudo' },
  { engineRuleId: 'DL3010', concept: 'config.dockerfile-add-archive' },
  { engineRuleId: 'DL3011', concept: 'config.dockerfile-invalid-port' },
  { engineRuleId: 'DL3012', concept: 'config.dockerfile-multiple-healthcheck' },
  { engineRuleId: 'DL3014', concept: 'config.dockerfile-apt-get-yes' },
  { engineRuleId: 'DL3016', concept: 'config.dockerfile-pin-npm' },
  { engineRuleId: 'DL3021', concept: 'config.dockerfile-copy-multiple-targets' },
  { engineRuleId: 'DL3022', concept: 'config.dockerfile-copy-from-unknown-stage' },
  { engineRuleId: 'DL3023', concept: 'config.dockerfile-copy-from-self' },
  { engineRuleId: 'DL3024', concept: 'config.dockerfile-duplicate-stage-name' },
  { engineRuleId: 'DL3027', concept: 'config.dockerfile-apt-not-apt-get' },
  { engineRuleId: 'DL3028', concept: 'config.dockerfile-pin-gem' },
  { engineRuleId: 'DL3030', concept: 'config.dockerfile-yum-yes' },
  { engineRuleId: 'DL3034', concept: 'config.dockerfile-zypper-yes' },
  { engineRuleId: 'DL3035', concept: 'config.dockerfile-zypper-dist-upgrade' },
  { engineRuleId: 'DL3038', concept: 'config.dockerfile-dnf-yes' },
  { engineRuleId: 'DL3043', concept: 'config.dockerfile-onbuild-onbuild' },
  { engineRuleId: 'DL3044', concept: 'config.dockerfile-env-self-reference' },
  { engineRuleId: 'DL3048', concept: 'config.dockerfile-invalid-label-key' },
  { engineRuleId: 'DL3057', concept: 'config.dockerfile-missing-healthcheck' },
  { engineRuleId: 'DL3061', concept: 'config.dockerfile-instruction-order' },
  { engineRuleId: 'DL3062', concept: 'config.dockerfile-pin-go' },
  { engineRuleId: 'DL3063', concept: 'config.dockerfile-reserved-stage-name' },
  { engineRuleId: 'DL3065', concept: 'config.dockerfile-redundant-platform' },
  { engineRuleId: 'DL3067', concept: 'config.dockerfile-copy-whole-filesystem' },
  { engineRuleId: 'DL4000', concept: 'config.dockerfile-maintainer-deprecated' },
  { engineRuleId: 'DL4003', concept: 'config.dockerfile-multiple-cmd' },
  { engineRuleId: 'DL4004', concept: 'config.dockerfile-multiple-entrypoint' },
  { engineRuleId: 'DL4005', concept: 'config.dockerfile-shell-via-symlink' },
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
