import { defineConfig } from '@misaon/slop-gate'

// `recommended` is the product's decision and it is deliberately maximal: every rule that is right when
// it fires. This file is the other half of that decision — what *this* repository does differently, said
// out loud. Nothing below is a rule slop-gate should ship turned off; each is a convention, a threshold
// or a platform fact that belongs to this codebase and not to the tool.
//
// 21,830 findings across 100 concepts are declined here. Anything not listed is fixed, not excused.
export default defineConfig({
  extends: ['recommended'],
  ignore: ['fixtures/**', 'packages/*/fixtures/**', 'packages/perf/.corpus/**'],
  rules: {
    // Symmetric conventions. The rule picks a side of a choice that has two defensible sides, and this
    // codebase already picked the other one. Nothing here describes a defect.
    'style.sort-keys': 'off',
    'style.curly': 'off',
    'style.sort-imports': 'off',
    'style.func-style': 'off',
    'style.group-exports': 'off',
    'style.exports-last': 'off',
    'style.consistent-type-specifier-style': 'off',
    'style.no-null': 'off',
    'style.consistent-type-definitions': 'off',
    'style.capitalized-comments': 'off',
    'style.no-continue': 'off',
    'style.max-nested-calls': 'off',
    'restriction.import-style': 'off',
    'style.method-signature-style': 'off',
    'style.numeric-separators-style': 'off',
    'style.prefer-destructuring': 'off',
    'style.no-await-expression-member': 'off',
    'style.new-cap': 'off',
    'style.number-literal-case': 'off',
    'style.prefer-await-to-then': 'off',
    'restriction.no-plusplus': 'off',
    'restriction.no-bitwise': 'off',
    'style.prefer-export-from': 'off',
    'style.eslint-no-nested-ternary': 'off',
    'restriction.no-void': 'off',
    'style.prefer-template': 'off',
    'restriction.explicit-member-accessibility': 'off',
    'style.no-duplicate-imports': 'off',
    'style.avoid-new': 'off',
    'pedantic.eslint-no-negated-condition': 'off',
    'pedantic.unicorn-no-negated-condition': 'off',
    'style.func-names': 'off',
    'pedantic.escape-case': 'off',
    'restriction.no-eq-null': 'off',
    'style.consistent-type-imports': 'off',
    'style.param-names': 'off',
    'restriction.prefer-module': 'off',
    'restriction.unambiguous': 'off',
    'style.array-type': 'off',

    // Thresholds. The number is a fact about a project, and the tool has no way to know this one's.
    'style.no-magic-numbers': 'off',
    'style.id-length': 'off',
    'style.max-statements': 'off',
    'style.jsx-max-depth': 'off',
    'pedantic.max-lines-per-function': 'off',
    'style.max-params': 'off',
    'pedantic.max-lines': 'off',
    'restriction.complexity': 'off',
    'pedantic.max-dependencies': 'off',
    'pedantic.max-depth': 'off',
    'pedantic.max-classes-per-file': 'off',

    // This package spawns other people's binaries, reads their output and exits with their status. The
    // platform surface these rules keep away from application code is the product here.
    'style.no-nodejs-modules': 'off',
    'restriction.no-relative-parent-imports': 'off',
    'restriction.no-process-env': 'off',
    'perf.no-await-in-loop': 'off',
    'style.no-sync': 'off',
    'restriction.no-top-level-await': 'off',
    'restriction.no-process-exit': 'off',
    'restriction.no-dynamic-delete': 'off',

    // Test-suite conventions. A suite of 2,041 tests already has a shape; these rules ask for a different
    // one, and changing it would touch every file without changing what any test proves.
    'style.vitest-prefer-expect-assertions': 'off',
    'style.vitest-require-top-level-describe': 'off',
    'restriction.require-test-timeout': 'off',
    'style.vitest-prefer-strict-equal': 'off',
    'style.prefer-ending-with-an-expect': 'off',
    'pedantic.vitest-no-conditional-in-test': 'off',
    'style.vitest-max-expects': 'off',
    'style.vitest-prefer-expect-resolves': 'off',
    'style.vitest-prefer-lowercase-title': 'off',

    // Annotations TypeScript already infers. `strict` plus `noUncheckedIndexedAccess` is the guarantee;
    // writing the inferred type out again is duplication that can go stale.
    'restriction.no-use-before-define': 'off',
    'restriction.no-non-null-assertion': 'off',
    'restriction.explicit-function-return-type': 'off',
    'style.init-declarations': 'off',
    'restriction.explicit-module-boundary-types': 'off',
    'restriction.no-invalid-void-type': 'off',

    // Doc-comment rules against a codebase whose written standard is that well-named code needs no comment.
    'pedantic.require-returns': 'off',
    'pedantic.require-param': 'off',

    // React application rules meeting a six-file internal Preact dashboard that is never hydrated, never
    // routed and rendered once.
    'restriction.jsx-no-literals': 'off',
    'perf.jsx-no-new-function-as-prop': 'off',
    'restriction.no-multi-comp': 'off',
    'style.jsx-props-no-spreading': 'off',
    'perf.jsx-no-new-object-as-prop': 'off',
    'restriction.jsx-filename-extension': 'off',
    'restriction.only-export-components': 'off',
    'correctness.jsx-key-index': 'off',
    'perf.jsx-no-new-array-as-prop': 'off',
    'style.function-component-definition': 'off',

    // Correct findings whose rewrite this codebase declines — each is a real observation about code that
    // is already doing the right thing for its context.
    'pedantic.require-unicode-regexp': 'off',
    'suspicious.no-array-sort': 'off',
    'pedantic.eslint-require-await': 'off',
    'style.prefer-named-capture-group': 'off',
    'slop.emoji-in-code': 'off',
    'pedantic.no-useless-undefined': 'off',
    'pedantic.prefer-single-call': 'off',
    'pedantic.no-array-callback-reference': 'off',
    'restriction.no-empty-function': 'off',
    'suspicious.no-array-reverse': 'off',
    'pedantic.no-promise-executor-return': 'off',
    'restriction.no-array-for-each': 'off',
    'style.css-baseline': 'off',
    'restriction.default-case': 'off',
    'pedantic.no-immediate-mutation': 'off',
  },
})
