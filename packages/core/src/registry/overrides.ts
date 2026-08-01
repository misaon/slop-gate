import type { ConceptId } from '../concepts/catalogue.ts'
import type { Severity } from '../diagnostics/types.ts'
import type { ClassifyRule } from './types.ts'

/**
 * A correction applied on top of the registry generator's mechanical default
 * (`concept = <oxlint category>.<kebab value>`, see `packages/core/scripts/generate-registry.ts`).
 *
 * Every field is optional: supply only what needs to differ from the mechanical value. The two
 * fields below are the ones that carry real judgement and cannot be derived from
 * `oxlint --rules --format json` alone —
 *
 * - `concepts` (with `classify` alongside it for a multi-concept rule): the whole point of a
 *   concept is that two rules detecting the same thing share one (see the design plan's decision
 *   2), and no mechanical scheme can know that in advance. This is also how a rule already tracked
 *   under a deliberately-chosen name — `no-dupe-keys` as `correctness.no-duplicate-object-key`,
 *   `no-eval` as `security.eval-usage` — keeps that name instead of reverting to the raw rule id.
 * - `severityDefault`: the mechanical default (`correctness` category → `error`, everything else →
 *   `warn`) is right for all but one seeded case (`no-unused-vars`, judged a hygiene issue rather
 *   than a certain bug despite being oxlint's `correctness` category).
 */
export type RuleOverride = {
  readonly concepts?: readonly ConceptId[]
  readonly classify?: readonly ClassifyRule[]
  readonly severityDefault?: Severity
}

/**
 * Keyed by the oxlint `engineRuleId` exactly as the generator derives it mechanically — bare value
 * for the `eslint` scope (`no-debugger`), `${scope}/${value}` otherwise (`typescript/no-explicit-any`),
 * with `jsx_a11y`/`react_perf` already hyphenated to `jsx-a11y`/`react-perf` (see the generator's
 * `engineRuleIdOf`, and the note above `HYPHENATED_SCOPE` there for why). That is the same string
 * that ends up as the generated `RuleEntry.engineRuleId`, so an override here always matches one
 * concrete generated entry — there is no separate raw-catalogue spelling to remember.
 *
 * Seeded entirely from the M0 hand-written registry this generator replaces
 * (`git show da4c6cf:packages/core/src/registry/entries.ts`) — every rule id below was already a
 * `RuleEntry` before generation existed, and the concept each one names is a deliberate,
 * already-shipped decision, not a guess. Verified one at a time against the live catalogue: of the
 * 46 oxlint rules the hand-written registry carried, only `no-debugger` and `no-constant-condition`
 * turned out to already match the mechanical default (`correctness.no-debugger`,
 * `correctness.no-constant-condition`) — every other one, including all four rules the hand-written
 * registry sourced from oxlint's `suspicious` category, used a renamed, `correctness`-grouped concept
 * rather than `suspicious.<value>`. Confirming that in advance, rather than assuming the override
 * table would stay small, is what turned this from ~6 expected entries into 44 — see the
 * registry-generation report for the full before/after table.
 *
 * `fixKind`/`fixTouches`/`tier`/`requires`/`languages`/`docsUrl` are deliberately *not* overridable
 * here: cross-checking the hand-written registry's guesses for those fields against the live
 * catalogue found several it got wrong (e.g. `for-direction` recorded as `fixKind: 'none'` when
 * oxlint reports a real, if dangerous, fix) — evidently nobody had checked the `fix` field per rule
 * when writing them by hand. The mechanically-derived value is more trustworthy than reproducing an
 * approximation, and neither field has a real consumer yet (`fixKind` is metadata; no code reads it
 * to decide whether to invoke `--fix`), so there is nothing to regress by letting it change.
 */
export const RULE_OVERRIDES: Readonly<Record<string, RuleOverride>> = {
  // M0's original six.
  'no-dupe-keys': { concepts: ['correctness.no-duplicate-object-key'] },
  'no-unused-vars': {
    concepts: ['dead-code.unused-variable', 'dead-code.unused-import'],
    classify: [{ messagePattern: '\\bimport(ed)?\\b', concept: 'dead-code.unused-import' }],
    // oxlint's own category is `correctness` (mechanically → `error`), but an unused variable is
    // judged a hygiene issue rather than a certain bug — the one deliberate severity override.
    severityDefault: 'warn',
  },
  'no-var': { concepts: ['style.no-var'] },
  'typescript/no-explicit-any': { concepts: ['slop.as-any-cast'] },

  // M0's 39-rule expansion, correctness-category (35).
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

  // M0's 39-rule expansion, suspicious-category (4) — renamed onto a `correctness.*` concept
  // despite the source category, exactly like the five-fixes `no-shadow` addition below.
  'no-unexpected-multiline': { concepts: ['correctness.ambiguous-line-break'] },
  'no-unmodified-loop-condition': { concepts: ['correctness.unmodified-loop-condition'] },
  'no-extend-native': { concepts: ['correctness.native-prototype-extended'] },
  'preserve-caught-error': { concepts: ['correctness.discarded-caught-error'] },

  // Five-fixes follow-up: found a genuine bug on a real NestJS project (srvc-bat).
  'no-shadow': { concepts: ['correctness.shadows-outer-binding'] },
}
