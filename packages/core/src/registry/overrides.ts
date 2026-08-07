import type { ConceptId } from '../concepts/catalogue.ts'
import type { Severity } from '../diagnostics/types.ts'
import type { ClassifyRule } from './types.ts'

export type RuleOverride = {
  readonly concepts?: readonly [ConceptId, ...ConceptId[]]
  readonly classify?: readonly ClassifyRule[]
  readonly severityDefault?: Severity
}

export const RULE_OVERRIDES: Readonly<Record<string, RuleOverride>> = {
  'no-dupe-keys': { concepts: ['correctness.no-duplicate-object-key'] },
  'no-unused-vars': {
    concepts: ['dead-code.unused-variable', 'dead-code.unused-import'],
    classify: [{ messagePattern: '\\bimport(ed)?\\b', concept: 'dead-code.unused-import' }],
    severityDefault: 'warn',
  },
  'vitest/require-mock-type-parameters': {
    severityDefault: 'warn',
  },
  // Fires on any non-literal title, so a table-driven test trips it: right 6% of the time across five
  // public repositories. See docs/measurements.md.
  'vitest/valid-title': {
    severityDefault: 'warn',
  },
  // `nursery` is oxlint's readiness label, not a subject. A concept id is a config key a user writes
  // down, so it cannot be one that stops being true the day upstream graduates the rule.
  'import/export': { concepts: ['correctness.duplicate-export-name'] },
  'import/named': { concepts: ['correctness.missing-named-export'] },
  'promise/no-return-in-finally': { concepts: ['correctness.return-in-finally'] },
  'react/require-render-return': { concepts: ['correctness.component-missing-return'] },
  'no-useless-assignment': { concepts: ['dead-code.useless-assignment'] },
  'unicorn/no-useless-iterator-to-array': { concepts: ['perf.useless-iterator-to-array'] },
  // Filed under `perf` upstream because an index key defeats reconciliation. The cost is state landing
  // on the wrong row, which is a defect and not a slow render.
  'react/no-array-index-key': { concepts: ['correctness.jsx-key-index'] },

  'no-var': { concepts: ['style.no-var'] },
  'typescript/no-explicit-any': { concepts: ['slop.as-any-cast'] },

  'constructor-super': { concepts: ['correctness.invalid-super-call'] },
  'for-direction': { concepts: ['correctness.invalid-loop-direction'] },
  'getter-return': { concepts: ['correctness.getter-missing-return'] },
  'no-async-promise-executor': { concepts: ['correctness.async-promise-executor'] },
  'no-class-assign': { concepts: ['correctness.class-reassigned'] },
  'no-compare-neg-zero': { concepts: ['correctness.compare-negative-zero'] },
  'no-cond-assign': { concepts: ['correctness.assignment-in-condition'] },
  'no-const-assign': { concepts: ['correctness.const-reassigned'] },
  'no-constant-binary-expression': { concepts: ['correctness.constant-binary-expression'] },
  'no-dupe-class-members': { concepts: ['correctness.duplicate-class-member'] },
  'no-dupe-else-if': { concepts: ['correctness.duplicate-else-if-condition'] },
  'no-duplicate-case': { concepts: ['correctness.duplicate-switch-case'] },
  'no-empty-pattern': { concepts: ['correctness.empty-destructuring-pattern'] },
  'no-eval': { concepts: ['security.eval-usage'] },
  'no-ex-assign': { concepts: ['correctness.caught-error-reassigned'] },
  'no-func-assign': { concepts: ['correctness.function-reassigned'] },
  'no-global-assign': { concepts: ['correctness.global-reassigned'] },
  'no-import-assign': { concepts: ['correctness.import-binding-reassigned'] },
  'no-invalid-regexp': { concepts: ['correctness.invalid-regexp'] },
  'no-loss-of-precision': { concepts: ['correctness.numeric-literal-loses-precision'] },
  'no-new-native-nonconstructor': { concepts: ['correctness.invalid-native-constructor-call'] },
  'no-obj-calls': { concepts: ['correctness.namespace-object-called'] },
  'no-self-assign': { concepts: ['correctness.self-assignment'] },
  'no-setter-return': { concepts: ['correctness.setter-returns-value'] },
  'no-shadow-restricted-names': { concepts: ['correctness.shadows-reserved-global'] },
  'no-sparse-arrays': { concepts: ['correctness.sparse-array-literal'] },
  'no-this-before-super': { concepts: ['correctness.this-before-super'] },
  'no-unreachable': { concepts: ['correctness.unreachable-code'] },
  'no-unsafe-finally': { concepts: ['correctness.unsafe-finally-control-flow'] },
  'no-unsafe-negation': { concepts: ['correctness.unsafe-negation'] },
  'no-unsafe-optional-chaining': { concepts: ['correctness.unsafe-optional-chaining'] },
  'no-unused-expressions': { concepts: ['dead-code.no-op-expression'] },
  'require-yield': { concepts: ['correctness.generator-never-yields'] },
  'use-isnan': { concepts: ['correctness.nan-comparison'] },
  'valid-typeof': { concepts: ['correctness.invalid-typeof-comparison'] },

  'no-unexpected-multiline': { concepts: ['correctness.ambiguous-line-break'] },
  'no-unmodified-loop-condition': { concepts: ['correctness.unmodified-loop-condition'] },
  'no-extend-native': { concepts: ['correctness.native-prototype-extended'] },
  'preserve-caught-error': { concepts: ['correctness.discarded-caught-error'] },

  'no-shadow': { concepts: ['correctness.shadows-outer-binding'] },
}
