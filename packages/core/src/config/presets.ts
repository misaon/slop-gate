import { GENERATED_RECOMMENDED_RULES } from '../registry/entries.generated.ts'
import type { PresetName, RuleMap } from './types.ts'

/**
 * Computed from the generated registry by policy, not listed by hand (design plan Task 3):
 * `GENERATED_RECOMMENDED_RULES` (registry/entries.generated.ts) already carries every concept whose
 * source rule is oxlint's `correctness` or `suspicious` category, non-type-aware, and not in
 * `registry/exclusions.ts` — see the generator's `buildGeneratedRecommended`. `correctness` alone
 * would silently drop five already-shipped, already-measured-useful rules (`no-shadow` chief among
 * them — see registry/overrides.ts) that are `suspicious`-category in oxlint's own taxonomy; the
 * plan's own grounding measurement reports `correctness` and `suspicious` together (319 rules) for
 * exactly this reason, so both categories are the policy, not `correctness` read literally.
 *
 * `correctness.parse-error` is the one concept this preset still lists by hand: it comes from
 * `entries.manual.ts`'s synthetic `oxlint/parse-error` entry, which no generator can produce because
 * it is not a real `--rules`-listed rule at all (see that file). The three `config.*` concepts below
 * are slop-gate's own orchestrator diagnostics (`ConceptDefinition.servicedBySlopGate`) — no
 * `RuleEntry` claims them either, generated or otherwise.
 */
const recommended: RuleMap = {
  'correctness.parse-error': 'error',
  ...GENERATED_RECOMMENDED_RULES,
  // The `schema` engine's own concept. Its other two rules need no entry here: they claim
  // `correctness.parse-error` (listed above) and `correctness.no-duplicate-object-key` (already in
  // `GENERATED_RECOMMENDED_RULES` at `error`), which they now co-own with oxlint per language.
  // `error`, like its neighbours, on the strength of the measurement: 826 YAML files across four
  // unrelated repositories, six findings, zero false positives.
  'config.compose-schema': 'error',
  'config.rule-overlap': 'info',
  'config.dead-override': 'warn',
  'config.unused-suppression': 'warn',
  'config.suppression-missing-reason': 'warn',
  // `error`, unlike its three neighbours: the others describe config rot a user can leave for later,
  // this one means `sgate fix` gave up on a file mid-run and the rules named are still fighting. It
  // is only ever emitted by `sgate fix`, so it costs a `sgate check` nothing.
  'config.fix-oscillation': 'error',
  // The thirteen GitHub Actions concepts the `actionlint` engine owns — every one it has except the
  // three in `MANUAL_RULE_EXCLUSIONS` (`config.workflow-runner-label`, `config.workflow-action`,
  // `config.workflow-syntax`), whose exclusion is enforced against this map by `entries.test.ts`.
  //
  // `warn` uniformly, on the measurement recorded per entry in `registry/entries.manual.ts`: over 403
  // workflow files from 17 repositories these thirteen produced **29 findings, 29 true positives, no
  // false positives**, with eight of them silent across thousands of opportunities. `error` is the
  // `schema` engine's bar and is deliberately not claimed on a first release.
  //
  // Costing a repository with no workflows nothing is structural rather than careful: every entry is
  // scoped to `languages: ['github-workflow']`, so arbitration never elects one where the inventory
  // contains no workflow files. On a machine with no actionlint, all thirteen become a reported
  // coverage gap instead — never a silent absence.
  'config.workflow-call': 'warn',
  'config.workflow-condition': 'warn',
  'config.workflow-deprecated-command': 'warn',
  'config.workflow-env-var': 'warn',
  'config.workflow-event': 'warn',
  'config.workflow-expression': 'warn',
  'config.workflow-glob': 'warn',
  'config.workflow-id': 'warn',
  'config.workflow-job-needs': 'warn',
  'config.workflow-matrix': 'warn',
  'config.workflow-permissions': 'warn',
  'config.workflow-shell': 'warn',
  'security.workflow-hardcoded-credential': 'warn',
  // The seventeen CSS concepts the `biome-css` engine owns, out of the twenty-six it has; the other
  // nine are in `MANUAL_RULE_EXCLUSIONS`, and `entries.test.ts` asserts none of them reaches this map.
  //
  // **This set is deliberately quiet, and that is the design rather than an accident to fix later.**
  // Thirteen of the seventeen produced zero findings across 1729 production stylesheets from ten
  // repositories; the other four produced 21 findings between them. On a typical repository this
  // engine reports nothing. What was excluded is what would have made it loud: four house-style rules
  // that account for 11,525 of the 12,125 findings measured and none of the ~23 real defects.
  //
  // `warn` uniformly, matching actionlint's first-release policy — `error` is the bar the `schema`
  // engine clears on 826 files, and the best-measured rule here has six findings behind it.
  //
  // Costing a repository with no stylesheets nothing is structural, not careful: every entry is
  // `languages: ['css']`, so arbitration never elects one where the inventory has no CSS. Note the
  // deliberate absence of `scss` — Biome cannot lint it at all (see `BIOME_CSS_RULE_ENTRIES`), and a
  // repository whose stylesheets are all SCSS gets no coverage here and no false impression of it.
  'correctness.css-deprecated-media-type': 'warn',
  'correctness.css-duplicate-custom-property': 'warn',
  'correctness.css-duplicate-font-name': 'warn',
  'correctness.css-duplicate-import': 'warn',
  'correctness.css-duplicate-keyframe-selector': 'warn',
  'correctness.css-duplicate-property': 'warn',
  'correctness.css-import-position': 'warn',
  'correctness.css-important-in-keyframe': 'warn',
  'correctness.css-invalid-gradient-direction': 'warn',
  'correctness.css-irregular-whitespace': 'warn',
  'correctness.css-missing-var-function': 'warn',
  'correctness.css-shorthand-override': 'warn',
  'correctness.css-unknown-property': 'warn',
  'correctness.css-unknown-pseudo-class': 'warn',
  'correctness.css-unknown-pseudo-element': 'warn',
  'correctness.css-unknown-type-selector': 'warn',
  'correctness.css-unmatchable-selector': 'warn',
  // Neither of the next two is a Biome rule; both are the adapter reporting on its own coverage, and
  // both are here because the failure they guard is silence rather than noise. A stylesheet biome
  // cannot parse, and a stylesheet carrying a suppression written for biome rather than for us, are
  // each a file whose clean result means nothing — the same shape as an engine that is not installed.
  'config.css-not-analysed': 'warn',
  // The adapter's own report that a stylesheet carries a `biome-ignore` comment
  // it cannot see through. In `recommended` for the reason `config.unused-suppression` is: a
  // suppression slop-gate did not write and cannot account for is a coverage gap, and the failure
  // mode it guards is silence rather than noise.
  'config.foreign-suppression': 'warn',
}

const strict: RuleMap = {
  ...recommended,
  'dead-code.unused-import': 'error',
  'dead-code.unused-variable': 'error',
  'style.no-var': 'error',
  'config.rule-overlap': 'warn',
}

/**
 * Opt-in by name (`extends: ['recommended', 'slop']`), which is a different bar from `recommended`:
 * a user who asks for AI-slop detection has accepted that some of it is a judgement call. It is not
 * a lower bar, though — membership here is still a measurement, recorded per rule in
 * `registry/entries.manual.ts` (ast-grep) and `registry/entries.generated.ts` (oxlint).
 *
 * Two of the five concepts ast-grep owns are deliberately **not** here, and both exclusions are
 * numbers rather than caution: `slop.swallowed-error` (433 findings over the third-party corpus,
 * ~19 of a 22-item sample deliberate) and `slop.emoji-in-code` (20/20 false positives on this
 * repository, all of them the pretty reporter's own severity glyphs and the tests for them). Both
 * remain available by concept, the same way everything knip owns is.
 */
const slop: RuleMap = {
  'slop.as-any-cast': 'warn',
  'slop.double-cast': 'warn',
  'slop.narrative-comment': 'warn',
  'slop.stub-implementation': 'warn',
}

export const PRESETS: Readonly<Record<PresetName, RuleMap>> = { recommended, strict, slop }
