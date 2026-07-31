import type { PresetName, RuleMap } from './types.ts'

const recommended: RuleMap = {
  'correctness.parse-error': 'error',
  'correctness.no-debugger': 'error',
  'correctness.no-duplicate-object-key': 'error',
  'correctness.no-constant-condition': 'error',
  // The 35 lines below are genuine bugs sourced from oxlint's `correctness` category (M0's curated
  // registry expansion — see registry/entries.ts); the 4 after them are `suspicious`-sourced, one
  // step less certain, so `warn` rather than `error`.
  'correctness.invalid-super-call': 'error',
  'correctness.invalid-loop-direction': 'error',
  'correctness.getter-missing-return': 'error',
  'correctness.async-promise-executor': 'error',
  'correctness.class-reassigned': 'error',
  'correctness.compare-negative-zero': 'error',
  'correctness.assignment-in-condition': 'error',
  'correctness.const-reassigned': 'error',
  'correctness.constant-binary-expression': 'error',
  'correctness.duplicate-class-member': 'error',
  'correctness.duplicate-else-if-condition': 'error',
  'correctness.duplicate-switch-case': 'error',
  'correctness.empty-destructuring-pattern': 'error',
  'security.eval-usage': 'error',
  'correctness.caught-error-reassigned': 'error',
  'correctness.function-reassigned': 'error',
  'correctness.global-reassigned': 'error',
  'correctness.import-binding-reassigned': 'error',
  'correctness.invalid-regexp': 'error',
  'correctness.numeric-literal-loses-precision': 'error',
  'correctness.invalid-native-constructor-call': 'error',
  'correctness.namespace-object-called': 'error',
  'correctness.self-assignment': 'error',
  'correctness.setter-returns-value': 'error',
  'correctness.shadows-reserved-global': 'error',
  'correctness.sparse-array-literal': 'error',
  'correctness.this-before-super': 'error',
  'correctness.unreachable-code': 'error',
  'correctness.unsafe-finally-control-flow': 'error',
  'correctness.unsafe-negation': 'error',
  'correctness.unsafe-optional-chaining': 'error',
  'dead-code.no-op-expression': 'error',
  'correctness.generator-never-yields': 'error',
  'correctness.nan-comparison': 'error',
  'correctness.invalid-typeof-comparison': 'error',
  'correctness.ambiguous-line-break': 'warn',
  'correctness.unmodified-loop-condition': 'warn',
  'correctness.native-prototype-extended': 'warn',
  'correctness.discarded-caught-error': 'warn',
  'dead-code.unused-import': 'warn',
  'dead-code.unused-variable': 'warn',
  'config.rule-overlap': 'info',
  'config.dead-override': 'warn',
  'config.unused-suppression': 'warn',
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
