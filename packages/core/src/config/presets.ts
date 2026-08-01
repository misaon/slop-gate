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
  'config.rule-overlap': 'info',
  'config.dead-override': 'warn',
  'config.unused-suppression': 'warn',
  'config.suppression-missing-reason': 'warn',
  // `error`, unlike its three neighbours: the others describe config rot a user can leave for later,
  // this one means `sgate fix` gave up on a file mid-run and the rules named are still fighting. It
  // is only ever emitted by `sgate fix`, so it costs a `sgate check` nothing.
  'config.fix-oscillation': 'error',
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
