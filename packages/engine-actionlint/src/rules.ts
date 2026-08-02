/**
 * actionlint's own rule names — the `kind` field of its JSON output — and what each one is called in
 * slop-gate's concept vocabulary.
 *
 * **Selection is enforced here, not by configuring actionlint.** actionlint has no per-rule
 * enable/disable: `-ignore` takes message regexes and the config file takes runner labels and path
 * globs, so there is no way to ask the binary for a subset of its rules. Every rule therefore always
 * runs, and this adapter drops what was not elected — which also means `EngineConfigHandle.ruleCount`
 * cannot be cross-checked against anything the binary reports, the same gap `tsc` has for the same
 * reason (no introspectable catalogue).
 */
export const ACTIONLINT_RULES = [
  { engineRuleId: 'action', concept: 'config.workflow-action' },
  { engineRuleId: 'credentials', concept: 'security.workflow-hardcoded-credential' },
  { engineRuleId: 'deprecated-commands', concept: 'config.workflow-deprecated-command' },
  { engineRuleId: 'env-var', concept: 'config.workflow-env-var' },
  { engineRuleId: 'events', concept: 'config.workflow-event' },
  { engineRuleId: 'expression', concept: 'config.workflow-expression' },
  { engineRuleId: 'glob', concept: 'config.workflow-glob' },
  { engineRuleId: 'id', concept: 'config.workflow-id' },
  { engineRuleId: 'if-cond', concept: 'config.workflow-condition' },
  { engineRuleId: 'job-needs', concept: 'config.workflow-job-needs' },
  { engineRuleId: 'matrix', concept: 'config.workflow-matrix' },
  { engineRuleId: 'permissions', concept: 'config.workflow-permissions' },
  { engineRuleId: 'runner-label', concept: 'config.workflow-runner-label' },
  { engineRuleId: 'shell-name', concept: 'config.workflow-shell' },
  { engineRuleId: 'syntax-check', concept: 'config.workflow-syntax' },
  { engineRuleId: 'workflow-call', concept: 'config.workflow-call' },
] as const

export type ActionlintRuleId = (typeof ACTIONLINT_RULES)[number]['engineRuleId']

export const ACTIONLINT_RULE_IDS: readonly string[] = ACTIONLINT_RULES.map((rule) => rule.engineRuleId)

/**
 * The two rule names that must never appear in output, because their integrations are switched off.
 *
 * actionlint shells out to `shellcheck` and `pyflakes`, and neither is opt-in: both flags default to
 * the bare command name, so the checks run wherever those binaries happen to exist and are silently
 * skipped where they do not. A finding under either kind means `-shellcheck= -pyflakes=` stopped
 * taking effect, and the run would then be importing a second tool's findings with no registry entry,
 * no concept mapping and nothing to explain them — see the M0 follow-ups on why shellcheck is a
 * candidate engine in its own right rather than an actionlint implementation detail. Loud rather than
 * dropped: a silent drop would hide the same non-reproducibility from us that it hides from the user.
 */
export const DISABLED_INTEGRATION_RULES: readonly string[] = ['shellcheck', 'pyflakes']

export type MessageExclusion = {
  readonly engineRuleId: ActionlintRuleId
  readonly pattern: RegExp
  readonly reason: string
}

/**
 * Findings dropped by message, inside rules that are otherwise shipped. First-class data with a
 * written reason for the same purpose `registry/exclusions.ts` serves at rule granularity: so that
 * nobody deletes one later believing its absence from the output was accidental.
 *
 * Every entry is a measured false-positive class from the 403-workflow corpus (17 repositories,
 * default-branch HEADs), and every one has a fixture in `fixtures/` proving it is still filtered.
 */
export const MESSAGE_EXCLUSIONS: readonly MessageExclusion[] = [
  {
    engineRuleId: 'expression',
    pattern: /^input "[^"]*" is typed as string by reusable workflow "[^"]*"\. (?:bool|null|number) value cannot be assigned$/,
    reason:
      'actionlint infers the type of a `with:` value from the scalar\'s *text*, ignoring YAML quoting: ' +
      '`rule_expression.go:555-562` switches on the resolved string and maps "true"/"false" to bool, ' +
      '"null" to null and anything `ParseFloat` accepts to number. So `flag: "false"` — an explicitly ' +
      'quoted YAML string, passed to an input the called workflow declares `type: string` — is reported ' +
      'as a bool that cannot be assigned. Measured: 88 of 447 corpus findings (19.7%), every one of them ' +
      'a quoted literal (84 double-quoted, 4 single-quoted, 0 unquoted), all in one repository that ' +
      'writes its reusable-workflow booleans as strings throughout. Reproduced minimally: actionlint ' +
      '1.7.12 reports `"false"`, `\'true\'` and bare `false` identically, and accepts `"no"` and ' +
      '`"hello"`. The null and number arms are excluded on the same mechanism rather than on their own ' +
      'measurement — they come from the same `switch` and fail the same way — and the exclusion is ' +
      'scoped to inputs declared `string`, so a genuinely wrong type against any other declared type ' +
      'still reports. What this costs: an author who really did write an unquoted `flag: false` is no ' +
      'longer told. That trade is 88 measured false positives against zero measured true ones.',
  },
  {
    engineRuleId: 'expression',
    pattern:
      /^1st argument of function call is not assignable\. "bool" cannot be assigned to "string"\. called function type is "fromJSON\(string\) -> any"$/,
    reason:
      "`fromJSON(matrix.some-boolean)` is flagged because actionlint types `fromJSON` as taking a " +
      'string. GitHub\'s expression language coerces the bool to its text before parsing, so the ' +
      'expression evaluates exactly as written. Measured: 3 of 447, all in cpython, which suppresses ' +
      'this same message in its own committed `.github/actionlint.yaml` — an independent judgement by ' +
      'the affected project that it is noise. Scoped to the `fromJSON(string)` signature and the ' +
      'bool→string pair specifically, not to the whole "argument is not assignable" family, which is ' +
      'the broad form cpython uses and which would also silence genuinely wrong arguments elsewhere.',
  },
  {
    engineRuleId: 'syntax-check',
    pattern: /^could not parse as YAML: /,
    reason:
      'A workflow that does not parse as YAML is a YAML defect, and `correctness.parse-error` belongs to ' +
      'the `schema` engine for `github-workflow` as well as for `yaml`. Ownership was originally going to ' +
      'transfer to actionlint here; the corpus measurement removed the case for it — **zero** parse errors ' +
      'across 403 real workflow files — while the M0 follow-ups had already recorded what it would cost: ' +
      'on an unresolved YAML alias actionlint reports `line: 0, column: 0`, the absence of a position, ' +
      'where the schema engine gives the offending token\'s exact byte range. Dropped rather than mapped, ' +
      'because the alternative is two engines reporting the same broken file under two concepts.',
  },
  {
    engineRuleId: 'syntax-check',
    pattern: /^key "[^"]*" is duplicated in /,
    reason:
      'Same division as the parse-error exclusion directly above: a duplicated mapping key is a YAML ' +
      'defect, and `correctness.no-duplicate-object-key` belongs to the `schema` engine, which measured ' +
      '6/6 true positives on it over 826 YAML files. actionlint found **zero** duplicate keys across the ' +
      '403-workflow corpus, so there was no contested ground to win.',
  },
]

export type MessageRewrite = {
  readonly engineRuleId: ActionlintRuleId
  readonly pattern: RegExp
  readonly rewrite: (match: RegExpMatchArray) => string
  readonly reason: string
}

/**
 * Messages surfaced differently from how actionlint words them. Kept to the cases where repeating
 * upstream verbatim would be actively misleading — not a style pass over someone else's diagnostics.
 */
export const MESSAGE_REWRITES: readonly MessageRewrite[] = [
  {
    engineRuleId: 'if-cond',
    pattern: /^constant expression (".*") in condition\. remove the if: section$/,
    rewrite: (match) =>
      `constant expression ${match[1]} in condition: it never varies, so the outcome is fixed. ` +
      'Removing the `if:` is only equivalent when the constant is truthy.',
    reason:
      'actionlint emits one message for every constant (`rule_if_cond.go:71`), and its remediation — ' +
      '"remove the if: section" — is wrong for the constant that actually turns up in real workflows. ' +
      '`if: false` is the standard way to disable a job or step deliberately; following the advice would ' +
      '*enable* it. Found on vercel/next.js in the corpus. The diagnosis is kept because it is correct; ' +
      'only the instruction is replaced, with wording that holds for a truthy and a falsy constant alike.',
  },
]

export function conceptOf(engineRuleId: string): string | undefined {
  return ACTIONLINT_RULES.find((rule) => rule.engineRuleId === engineRuleId)?.concept
}
