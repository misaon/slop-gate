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
}

const strict: RuleMap = {
  ...recommended,
  'dead-code.unused-import': 'error',
  'dead-code.unused-variable': 'error',
  'style.no-var': 'error',
  'config.rule-overlap': 'warn',
}

const slop: RuleMap = {
  'slop.as-any-cast': 'warn',
}

export const PRESETS: Readonly<Record<PresetName, RuleMap>> = { recommended, strict, slop }
