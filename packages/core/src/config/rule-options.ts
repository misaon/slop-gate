import type { ConceptId } from '../concepts/catalogue.ts'
import type { RuleSetting } from './types.ts'

export type OptionedRule = {
  readonly setting: RuleSetting
  /** The conclusion and the headline figure. The working goes in `docs/measurements.md`. */
  readonly reason: string
  /** Anchor in `docs/measurements.md` holding the corpus, the per-repository split and what was ruled out. */
  readonly evidence?: string
}

const ASSERTION_SHAPES = ['expect', 'expect*', 'assert*', '**.expect', '**.should.**'] as const

const EXPECT_EXPECT_REASON =
  '**3,206 findings on defaults, 584 with these `assertFunctionNames` — an 81.8% reduction** over nine ' +
  'third-party repositories plus one of the author\'s own applications.\n\n' +
  'The rule reads "test has no assertions" from the *name of the function called*, so it cannot see the ' +
  'two ways real suites assert most often: supertest\'s `request(server).post(…).expect(201)` and chai\'s ' +
  '`x.should.be.equal(true)`. Neither calls anything named `expect`, and both assert.\n\n' +
  'Verified not to blunt the rule: a test whose body is `const x = 1` still reports under every value ' +
  'measured. The 584 that survive are not all real either — 100 are type-level tests, whose assertion is ' +
  'that the body compiles, and no option can see that. That residue is why the vitest twin sits at `warn`.'

const TSDOC_BLOCK_TAGS = [
  'decorator',
  'defaultValue',
  'eventProperty',
  'experimental',
  'inheritDoc',
  'label',
  'packageDocumentation',
  'privateRemarks',
  'remarks',
  'sealed',
  'typeParam',
  'return',
] as const

export const OPTIONED_RECOMMENDED_RULES: Readonly<Partial<Record<ConceptId, OptionedRule>>> = {
  'correctness.check-tag-names': {
    setting: ['warn', { definedTags: [...TSDOC_BLOCK_TAGS] }],
    reason:
      '**2,643 findings across twelve repositories, of which 141 are block tags TSDoc standardises and 98 ' +
      'are `@return`.** oxlint validates against *JSDoc*\'s tag list, and a TypeScript codebase documents ' +
      'with TSDoc — so the rule tells projects following a published standard that the standard is a typo. ' +
      '`@return` is not TSDoc at all, and JSDoc itself documents it as a synonym for `@returns`.\n\n' +
      '**This deliberately fixes 239 of the 2,643 and leaves 2,502 standing**, because the rest are tags a ' +
      'project invented for its own tooling — `@schema`, `@oas`, `@publicApi`. Those really are unknown to ' +
      'any toolchain but that project\'s own, and the escape hatch is the same option in the user\'s config, ' +
      'which is where a fact only that repository knows belongs.',
    evidence: 'jsdoc-check-tag-names',
  },
  'correctness.jest-expect-expect': {
    setting: ['warn', { assertFunctionNames: [...ASSERTION_SHAPES] }],
    reason: EXPECT_EXPECT_REASON,
    evidence: 'expect-expect',
  },

  'correctness.vitest-expect-expect': {
    setting: ['warn', { assertFunctionNames: [...ASSERTION_SHAPES] }],
    reason: EXPECT_EXPECT_REASON,
    evidence: 'expect-expect',
  },

  'pedantic.eqeqeq': {
    setting: ['warn', 'smart'],
    reason:
      '**2,637 findings on defaults, 84 with `smart` — a 96.8% reduction, and every one of the 2,553 removed ' +
      'is a comparison that cannot behave differently.** Measured over 32,035 script files from twelve ' +
      'repositories.\n\n' +
      '`smart` exempts exactly three provably equivalent shapes: comparison against `null` (which is the ' +
      'whole story — one repository contributes 2,237 findings on defaults and zero with `smart`), a ' +
      '`typeof` result against a string, and two literals. What is left is loose equality on values that can ' +
      'differ by coercion, which is what the rule is for.\n\n' +
      '`smart` and not `{ "null": "ignore" }`, measured alongside at 134 — the extra 50 are equivalent by ' +
      'construction. It is also the value that forced `RuleOptions` to be a positional list: oxlint 1.76.0 ' +
      'rejects the object form outright.',
    evidence: 'pedantic-eqeqeq',
  },
}
