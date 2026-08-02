/**
 * hadolint's own rule codes — the `code` field of its JSON output — and what each one is called in
 * slop-gate's concept vocabulary.
 *
 * **Six of roughly seventy, and the split is a measurement.** 275 Dockerfiles from 32
 * actively-maintained repositories at pinned default-branch HEADs produced **893 findings; 217 of the
 * 275 files (79%) produce at least one**. Of the 816 that come from hadolint's own DL rules, **204 are
 * true positives and 612 are false — 25% precision**. The rules below are the concentrated part: they
 * account for 150 of those 204. Per-rule figures are on each entry in `registry/entries.manual.ts`,
 * and the thirteen zero-true-positive rules are excluded as data in `registry/exclusions.ts`.
 *
 * **Selection is enforced here, not by configuring hadolint.** hadolint can be handed `--ignore` per
 * code, but the list of codes it knows grows between releases, and a rule this registry has never
 * heard of must not reach a user through an upgrade. The adapter therefore drops anything not elected
 * — the same posture the actionlint adapter takes, for the same reason.
 */
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

/**
 * hadolint statically links the ShellCheck library and reports `SC####` codes for shell inside `RUN`.
 * None of them ships, and the reason is not the one that disabled actionlint's shellcheck integration.
 *
 * That integration was disabled because it was **nondeterministic** — actionlint shelled out to
 * whatever `shellcheck` happened to be on `PATH`, so a rule fired on a laptop and not in CI.
 * hadolint's is compiled in, so it cannot vary. The findings were therefore judged on their merits,
 * and fail on two independent grounds:
 *
 * 1. **The error tier is empty.** Subjected to the same severity gate that the deferred standalone
 *    shellcheck engine would use, the 77 corpus findings are 37 `warning`, 38 `info`, 2 `style` and
 *    **zero `error`**. The largest warning-tier code is `SC2046` (20), the same word-splitting family
 *    that measured **0 of 92** true positives on 546 real shell scripts.
 * 2. **The positions cannot address them.** hadolint attributes a shell finding to the `RUN`
 *    instruction head, not the offending line: a `[[ ]]` on line 5 of a multi-line `RUN` starting at
 *    line 2 is reported at line 2. `column` is 1 in all 893 corpus findings and there is no end
 *    position anywhere in the JSON. On the 40-to-60-line `RUN` blocks where shell defects actually
 *    live, the diagnostic lands tens of lines away.
 *
 * The same position limitation is harmless for the DL rules above, which is why this is a judgement
 * about one finding class rather than about hadolint: `DL3007` on a `FROM` and `DL4006` on a `RUN` are
 * instruction-level findings by nature, so an instruction-head position is the correct one.
 *
 * Dropped silently rather than loudly — unlike actionlint's equivalent, where a `shellcheck` finding
 * meant a flag had stopped working and the run was no longer reproducible. Here they are simply part
 * of hadolint's normal output that this adapter does not claim, and shell inside `RUN` is a recorded
 * coverage gap belonging to no engine.
 */
export const EMBEDDED_SHELLCHECK_PREFIX = 'SC'

export type SourceExclusion = {
  readonly engineRuleId: HadolintRuleId
  /** Given the source line the finding points at, `true` drops it. */
  readonly matches: (instructionLine: string) => boolean
  readonly reason: string
}

/**
 * Findings dropped by looking at the instruction they point at, inside rules that otherwise ship.
 *
 * This is the source-predicate analogue of the actionlint adapter's `MESSAGE_EXCLUSIONS`, and it has
 * to be one: hadolint emits a **single message** for the case that should ship and the case that
 * should not, so there is no pattern in the text to match on. What distinguishes them is the
 * instruction, and hadolint's line-level position is exactly good enough to read it — the one place
 * where its instruction-head positions are an advantage rather than a limitation.
 */
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

export function conceptOf(engineRuleId: string): string | undefined {
  return HADOLINT_RULES.find((rule) => rule.engineRuleId === engineRuleId)?.concept
}
