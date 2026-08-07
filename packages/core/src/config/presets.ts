import { GENERATED_RECOMMENDED_RULES } from '../registry/entries.generated.ts'
import { OPTIONED_RECOMMENDED_RULES } from './rule-options.ts'
import type { PresetName, RuleMap } from './types.ts'

const optionedRules: RuleMap = Object.fromEntries(
  Object.entries(OPTIONED_RECOMMENDED_RULES).map(([concept, rule]) => [concept, rule.setting]),
)

const slop: RuleMap = {
  'slop.as-any-cast': 'warn',
  'slop.double-cast': 'warn',
  'slop.narrative-comment': 'warn',
  'slop.stub-implementation': 'warn',
}

const recommended: RuleMap = {
  'correctness.parse-error': 'error',
  ...GENERATED_RECOMMENDED_RULES,
  ...slop,
  'types.type-error': 'error',
  'dead-code.unused-export': 'warn',
  'dead-code.unused-exported-type': 'warn',
  'deps.unlisted-dependency': 'warn',
  'deps.unresolved-import': 'error',

  'security.vulnerable-dependency': 'warn',
  'security.malicious-dependency': 'error',
  'deps.advisory-coverage-gap': 'warn',
  ...optionedRules,
  'pedantic.prefer-ts-expect-error': 'warn',
  'restriction.no-import-type-side-effects': 'warn',
  'perf.no-accumulating-spread': 'warn',

  // `perf` and `nursery` are outside the two categories the generator promotes, so these are named here
  // one by one. Each was read against its documentation; see docs/measurements.md#perf-nursery-audit.
  'perf.prefer-array-find': 'warn',
  'perf.prefer-array-flat-map': 'warn',
  'perf.prefer-set-has': 'warn',
  'perf.no-useless-call': 'warn',
  'perf.jsx-no-constructed-context-values': 'warn',
  'perf.no-object-type-as-default-prop': 'warn',
  'perf.useless-iterator-to-array': 'warn',
  'correctness.duplicate-export-name': 'error',
  'correctness.missing-named-export': 'error',
  'correctness.return-in-finally': 'error',
  'correctness.component-missing-return': 'error',
  'dead-code.useless-assignment': 'warn',

  'restriction.no-non-null-asserted-nullish-coalescing': 'warn',
  'config.compose-schema': 'error',
  'config.rule-overlap': 'info',
  'config.dead-override': 'warn',
  'config.unused-suppression': 'warn',
  'config.suppression-missing-reason': 'warn',
  'config.fix-oscillation': 'error',
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
  'config.dockerfile-base-image-mutable-tag': 'warn',
  'config.dockerfile-base-image-untagged': 'warn',
  'config.dockerfile-entrypoint-form': 'warn',
  'config.dockerfile-package-cache': 'warn',
  'config.dockerfile-pipefail': 'warn',
  'config.dockerfile-platform': 'warn',
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
  'config.css-not-analysed': 'warn',
  'config.foreign-suppression': 'warn',
}

const strict: RuleMap = {
  ...recommended,
  'dead-code.unused-import': 'error',
  'dead-code.unused-variable': 'error',
  'style.no-var': 'error',
  'config.rule-overlap': 'warn',
}

const essential: RuleMap = Object.fromEntries(
  Object.entries(recommended).filter(([, setting]) => (Array.isArray(setting) ? setting[0] : setting) === 'error'),
)

export const PRESETS: Readonly<Record<PresetName, RuleMap>> = { essential, recommended, strict, slop }
