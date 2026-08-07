// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-registry.ts from the live oxlint rule catalogue (`oxlint --rules --format json`).
// Regenerate: pnpm --filter @misaon/slop-gate-core generate:registry
// CI fails if this file would differ from a fresh regeneration (generate:registry:check).
import type { ConceptDefinition } from './catalogue.ts'

/**
 * One entry per mechanically-named concept a generated rule entry invents; `title` and
 * `description` are factual passthroughs of the source rule, not curated prose.
 *
 * `as const satisfies` and never a type annotation: `ConceptId` is `(typeof CONCEPTS)[number]['id']`,
 * so an annotation widens every id to `string` and collapses the union, erasing concept-id checking
 * everywhere it is used.
 */
export const GENERATED_CONCEPTS = [
  {
    id: 'correctness.no-misused-spread',
    group: 'correctness',
    title: 'typescript/no-misused-spread',
    description: 'Generated from oxlint\'s `typescript/no-misused-spread` rule (category: correctness). No Misused Spread.',
  },
  {
    id: 'correctness.unbound-method',
    group: 'correctness',
    title: 'typescript/unbound-method',
    description: 'Generated from oxlint\'s `typescript/unbound-method` rule (category: correctness). Unbound Method.',
  },
  {
    id: 'nursery.no-restricted-exports',
    group: 'nursery',
    title: 'no-restricted-exports',
    description: 'Generated from oxlint\'s `eslint/no-restricted-exports` rule (category: nursery). No Restricted Exports.',
  },
  {
    id: 'nursery.no-undef',
    group: 'nursery',
    title: 'no-undef',
    description: 'Generated from oxlint\'s `eslint/no-undef` rule (category: nursery). No Undef.',
  },
  {
    id: 'nursery.no-unnecessary-condition',
    group: 'nursery',
    title: 'typescript/no-unnecessary-condition',
    description: 'Generated from oxlint\'s `typescript/no-unnecessary-condition` rule (category: nursery). No Unnecessary Condition.',
  },
  {
    id: 'nursery.no-unreachable-loop',
    group: 'nursery',
    title: 'no-unreachable-loop',
    description: 'Generated from oxlint\'s `eslint/no-unreachable-loop` rule (category: nursery). No Unreachable Loop.',
  },
  {
    id: 'nursery.prefer-optional-chain',
    group: 'nursery',
    title: 'typescript/prefer-optional-chain',
    description: 'Generated from oxlint\'s `typescript/prefer-optional-chain` rule (category: nursery). Prefer Optional Chain.',
  },
  {
    id: 'pedantic.max-nested-callbacks',
    group: 'pedantic',
    title: 'max-nested-callbacks',
    description: 'Generated from oxlint\'s `eslint/max-nested-callbacks` rule (category: pedantic). Max Nested Callbacks.',
  },
  {
    id: 'pedantic.prefer-math-trunc',
    group: 'pedantic',
    title: 'unicorn/prefer-math-trunc',
    description: 'Generated from oxlint\'s `unicorn/prefer-math-trunc` rule (category: pedantic). Prefer Math Trunc.',
  },
  {
    id: 'pedantic.prefer-nullish-coalescing',
    group: 'pedantic',
    title: 'typescript/prefer-nullish-coalescing',
    description: 'Generated from oxlint\'s `typescript/prefer-nullish-coalescing` rule (category: pedantic). Prefer Nullish Coalescing.',
  },
  {
    id: 'pedantic.typescript-require-await',
    group: 'pedantic',
    title: 'typescript/require-await',
    description: 'Generated from oxlint\'s `typescript/require-await` rule (category: pedantic). Require Await.',
  },
  {
    id: 'perf.no-map-spread',
    group: 'perf',
    title: 'oxc/no-map-spread',
    description: 'Generated from oxlint\'s `oxc/no-map-spread` rule (category: perf). No Map Spread.',
  },
  {
    id: 'restriction.extensions',
    group: 'restriction',
    title: 'import/extensions',
    description: 'Generated from oxlint\'s `import/extensions` rule (category: restriction). Extensions.',
  },
  {
    id: 'restriction.forbid-dom-props',
    group: 'restriction',
    title: 'react/forbid-dom-props',
    description: 'Generated from oxlint\'s `react/forbid-dom-props` rule (category: restriction). Forbid Dom Props.',
  },
  {
    id: 'restriction.forbid-elements',
    group: 'restriction',
    title: 'react/forbid-elements',
    description: 'Generated from oxlint\'s `react/forbid-elements` rule (category: restriction). Forbid Elements.',
  },
  {
    id: 'restriction.no-async-await',
    group: 'restriction',
    title: 'oxc/no-async-await',
    description: 'Generated from oxlint\'s `oxc/no-async-await` rule (category: restriction). No Async Await.',
  },
  {
    id: 'restriction.no-default-export',
    group: 'restriction',
    title: 'import/no-default-export',
    description: 'Generated from oxlint\'s `import/no-default-export` rule (category: restriction). No Default Export.',
  },
  {
    id: 'restriction.no-optional-chaining',
    group: 'restriction',
    title: 'oxc/no-optional-chaining',
    description: 'Generated from oxlint\'s `oxc/no-optional-chaining` rule (category: restriction). No Optional Chaining.',
  },
  {
    id: 'restriction.no-rest-spread-properties',
    group: 'restriction',
    title: 'oxc/no-rest-spread-properties',
    description: 'Generated from oxlint\'s `oxc/no-rest-spread-properties` rule (category: restriction). No Rest Spread Properties.',
  },
  {
    id: 'restriction.no-restricted-globals',
    group: 'restriction',
    title: 'no-restricted-globals',
    description: 'Generated from oxlint\'s `eslint/no-restricted-globals` rule (category: restriction). No Restricted Globals.',
  },
  {
    id: 'restriction.no-restricted-imports',
    group: 'restriction',
    title: 'no-restricted-imports',
    description: 'Generated from oxlint\'s `eslint/no-restricted-imports` rule (category: restriction). No Restricted Imports.',
  },
  {
    id: 'restriction.no-restricted-properties',
    group: 'restriction',
    title: 'no-restricted-properties',
    description: 'Generated from oxlint\'s `eslint/no-restricted-properties` rule (category: restriction). No Restricted Properties.',
  },
  {
    id: 'restriction.no-restricted-types',
    group: 'restriction',
    title: 'typescript/no-restricted-types',
    description: 'Generated from oxlint\'s `typescript/no-restricted-types` rule (category: restriction). No Restricted Types.',
  },
  {
    id: 'restriction.no-undefined',
    group: 'restriction',
    title: 'no-undefined',
    description: 'Generated from oxlint\'s `eslint/no-undefined` rule (category: restriction). No Undefined.',
  },
  {
    id: 'restriction.no-unknown-property',
    group: 'restriction',
    title: 'react/no-unknown-property',
    description: 'Generated from oxlint\'s `react/no-unknown-property` rule (category: restriction). No Unknown Property.',
  },
  {
    id: 'restriction.non-nullable-type-assertion-style',
    group: 'restriction',
    title: 'typescript/non-nullable-type-assertion-style',
    description: 'Generated from oxlint\'s `typescript/non-nullable-type-assertion-style` rule (category: restriction). Non Nullable Type Assertion Style.',
  },
  {
    id: 'restriction.use-unknown-in-catch-callback-variable',
    group: 'restriction',
    title: 'typescript/use-unknown-in-catch-callback-variable',
    description: 'Generated from oxlint\'s `typescript/use-unknown-in-catch-callback-variable` rule (category: restriction). Use Unknown In Catch Callback Variable.',
  },
  {
    id: 'style.callback-return',
    group: 'style',
    title: 'node/callback-return',
    description: 'Generated from oxlint\'s `node/callback-return` rule (category: style). Callback Return.',
  },
  {
    id: 'style.catch-error-name',
    group: 'style',
    title: 'unicorn/catch-error-name',
    description: 'Generated from oxlint\'s `unicorn/catch-error-name` rule (category: style). Catch Error Name.',
  },
  {
    id: 'style.dot-notation',
    group: 'style',
    title: 'typescript/dot-notation',
    description: 'Generated from oxlint\'s `typescript/dot-notation` rule (category: style). Dot Notation.',
  },
  {
    id: 'style.id-denylist',
    group: 'style',
    title: 'id-denylist',
    description: 'Generated from oxlint\'s `eslint/id-denylist` rule (category: style). Id Denylist.',
  },
  {
    id: 'style.id-match',
    group: 'style',
    title: 'id-match',
    description: 'Generated from oxlint\'s `eslint/id-match` rule (category: style). Id Match.',
  },
  {
    id: 'style.jest-no-hooks',
    group: 'style',
    title: 'jest/no-hooks',
    description: 'Generated from oxlint\'s `jest/no-hooks` rule (category: style). No Hooks.',
  },
  {
    id: 'style.jest-no-restricted-matchers',
    group: 'style',
    title: 'jest/no-restricted-matchers',
    description: 'Generated from oxlint\'s `jest/no-restricted-matchers` rule (category: style). No Restricted Matchers.',
  },
  {
    id: 'style.jest-require-hook',
    group: 'style',
    title: 'jest/require-hook',
    description: 'Generated from oxlint\'s `jest/require-hook` rule (category: style). Require Hook.',
  },
  {
    id: 'style.no-anonymous-default-export',
    group: 'style',
    title: 'import/no-anonymous-default-export',
    description: 'Generated from oxlint\'s `import/no-anonymous-default-export` rule (category: style). No Anonymous Default Export.',
  },
  {
    id: 'style.no-done-callback',
    group: 'style',
    title: 'jest/no-done-callback',
    description: 'Generated from oxlint\'s `jest/no-done-callback` rule (category: style). No Done Callback.',
  },
  {
    id: 'style.no-importing-vitest-globals',
    group: 'style',
    title: 'vitest/no-importing-vitest-globals',
    description: 'Generated from oxlint\'s `vitest/no-importing-vitest-globals` rule (category: style). No Importing Vitest Globals.',
  },
  {
    id: 'style.no-named-export',
    group: 'style',
    title: 'import/no-named-export',
    description: 'Generated from oxlint\'s `import/no-named-export` rule (category: style). No Named Export.',
  },
  {
    id: 'style.no-restricted-jest-methods',
    group: 'style',
    title: 'jest/no-restricted-jest-methods',
    description: 'Generated from oxlint\'s `jest/no-restricted-jest-methods` rule (category: style). No Restricted Jest Methods.',
  },
  {
    id: 'style.no-restricted-vi-methods',
    group: 'style',
    title: 'vitest/no-restricted-vi-methods',
    description: 'Generated from oxlint\'s `vitest/no-restricted-vi-methods` rule (category: style). No Restricted Vi Methods.',
  },
  {
    id: 'style.no-template-curly-in-string',
    group: 'style',
    title: 'no-template-curly-in-string',
    description: 'Generated from oxlint\'s `eslint/no-template-curly-in-string` rule (category: style). No Template Curly In String.',
  },
  {
    id: 'style.no-ternary',
    group: 'style',
    title: 'no-ternary',
    description: 'Generated from oxlint\'s `eslint/no-ternary` rule (category: style). No Ternary.',
  },
  {
    id: 'style.prefer-catch',
    group: 'style',
    title: 'promise/prefer-catch',
    description: 'Generated from oxlint\'s `promise/prefer-catch` rule (category: style). Prefer Catch.',
  },
  {
    id: 'style.prefer-default-export',
    group: 'style',
    title: 'import/prefer-default-export',
    description: 'Generated from oxlint\'s `import/prefer-default-export` rule (category: style). Prefer Default Export.',
  },
  {
    id: 'style.prefer-describe-function-title',
    group: 'style',
    title: 'vitest/prefer-describe-function-title',
    description: 'Generated from oxlint\'s `vitest/prefer-describe-function-title` rule (category: style). Prefer Describe Function Title.',
  },
  {
    id: 'style.prefer-find',
    group: 'style',
    title: 'typescript/prefer-find',
    description: 'Generated from oxlint\'s `typescript/prefer-find` rule (category: style). Prefer Find.',
  },
  {
    id: 'style.prefer-strict-boolean-matchers',
    group: 'style',
    title: 'vitest/prefer-strict-boolean-matchers',
    description: 'Generated from oxlint\'s `vitest/prefer-strict-boolean-matchers` rule (category: style). Prefer Strict Boolean Matchers.',
  },
  {
    id: 'style.prefer-structured-clone',
    group: 'style',
    title: 'unicorn/prefer-structured-clone',
    description: 'Generated from oxlint\'s `unicorn/prefer-structured-clone` rule (category: style). Prefer Structured Clone.',
  },
  {
    id: 'style.prefer-to-be-falsy',
    group: 'style',
    title: 'vitest/prefer-to-be-falsy',
    description: 'Generated from oxlint\'s `vitest/prefer-to-be-falsy` rule (category: style). Prefer To Be Falsy.',
  },
  {
    id: 'style.prefer-to-be-truthy',
    group: 'style',
    title: 'vitest/prefer-to-be-truthy',
    description: 'Generated from oxlint\'s `vitest/prefer-to-be-truthy` rule (category: style). Prefer To Be Truthy.',
  },
  {
    id: 'style.require-yields-description',
    group: 'style',
    title: 'jsdoc/require-yields-description',
    description: 'Generated from oxlint\'s `jsdoc/require-yields-description` rule (category: style). Require Yields Description.',
  },
  {
    id: 'style.unicorn-prefer-spread',
    group: 'style',
    title: 'unicorn/prefer-spread',
    description: 'Generated from oxlint\'s `unicorn/prefer-spread` rule (category: style). Prefer Spread.',
  },
  {
    id: 'style.vitest-no-hooks',
    group: 'style',
    title: 'vitest/no-hooks',
    description: 'Generated from oxlint\'s `vitest/no-hooks` rule (category: style). No Hooks.',
  },
  {
    id: 'style.vitest-no-restricted-matchers',
    group: 'style',
    title: 'vitest/no-restricted-matchers',
    description: 'Generated from oxlint\'s `vitest/no-restricted-matchers` rule (category: style). No Restricted Matchers.',
  },
  {
    id: 'style.vitest-prefer-each',
    group: 'style',
    title: 'vitest/prefer-each',
    description: 'Generated from oxlint\'s `vitest/prefer-each` rule (category: style). Prefer Each.',
  },
  {
    id: 'style.vitest-require-hook',
    group: 'style',
    title: 'vitest/require-hook',
    description: 'Generated from oxlint\'s `vitest/require-hook` rule (category: style). Require Hook.',
  },
  {
    id: 'suspicious.consistent-return',
    group: 'suspicious',
    title: 'typescript/consistent-return',
    description: 'Generated from oxlint\'s `typescript/consistent-return` rule (category: suspicious). Consistent Return.',
  },
  {
    id: 'suspicious.no-implied-eval',
    group: 'suspicious',
    title: 'no-implied-eval',
    description: 'Generated from oxlint\'s `eslint/no-implied-eval` rule (category: suspicious). No Implied Eval.',
  },
  {
    id: 'suspicious.no-unassigned-import',
    group: 'suspicious',
    title: 'import/no-unassigned-import',
    description: 'Generated from oxlint\'s `import/no-unassigned-import` rule (category: suspicious). No Unassigned Import.',
  },
  {
    id: 'suspicious.no-unnecessary-type-parameters',
    group: 'suspicious',
    title: 'typescript/no-unnecessary-type-parameters',
    description: 'Generated from oxlint\'s `typescript/no-unnecessary-type-parameters` rule (category: suspicious). No Unnecessary Type Parameters.',
  },
] as const satisfies readonly ConceptDefinition[]
