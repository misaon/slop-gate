import type { ConceptId } from '../concepts/catalogue.ts'
import type { RuleSetting } from './types.ts'

export type OptionedRule = {
  readonly setting: RuleSetting
  readonly reason: string
}

const ASSERTION_SHAPES = ['expect', 'expect*', 'assert*', '**.expect', '**.should.**'] as const

const EXPECT_EXPECT_REASON =
  '**3206 findings on default settings, 584 with these `assertFunctionNames` — an 81.8% reduction, ' +
  'measured over nine third-party repositories plus one of the author\'s own applications.** Per repo: ' +
  'metabase 145 → 0, nest 779 → 19, srvc-loan 869 → 74, typeorm 954 → 221, trpc 144 → 54, hono 209 → 110, ' +
  'date-fns 100 → 100, prettier 6 → 6, fastify and got 0 → 0.\n\n' +
  'The rule reads "test has no assertions" from the *name of the function called*, so it cannot see the two ' +
  'ways a real test suite asserts most often. nest\'s 779 were almost entirely supertest — ' +
  '`request(server).post(\'/photo\').expect(201, {...})` — and typeorm\'s were chai\'s `should` style, ' +
  '`migrations.should.be.equal(true)`. Neither is a call to anything named `expect`, and both assert.\n\n' +
  'Verified not to blunt the rule: a test whose body is `const x = 1` is still reported under every option ' +
  'value measured here. The 584 that survive are not all real either — date-fns\'s 100 are **type-level ' +
  'tests**, whose assertion is that the body compiles at all, and no value of this option can see that. That ' +
  'residue is why the vitest twin sits at `warn` rather than the `error` its category would give it: a ' +
  'type-level test is an ordinary TypeScript pattern and must not fail a build.'

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
      '**2,643 findings across twelve repositories of a 20-repository corpus, of which 141 are block ' +
      'tags TSDoc standardises and 98 are `@return`.** oxlint validates against *JSDoc*’s tag list ' +
      '(verified against 1.76.0: `@privateRemarks`, `@defaultValue` and `@typeParam` are all reported ' +
      'as invalid), and a TypeScript codebase documents with TSDoc — so the rule tells projects ' +
      'following a published standard that the standard is a typo. `@return` is not TSDoc at all: ' +
      'JSDoc itself documents it as a synonym for `@returns`, so reporting it as *unrecognised* is ' +
      'wrong about JSDoc.\n\n' +
      'Per tag, measured by reading the source at each finding’s byte range: `@defaultValue` 43, ' +
      '`@privateRemarks` 34, `@typeParam` 32, `@experimental` 13, `@link` 6, `@remarks` 6, ' +
      '`@deprecated` 3, plus `@return` 98.\n\n' +
      '**This deliberately fixes 239 of the 2,643 and leaves 2,502 standing**, because the rest are ' +
      'tags a project invented for its own tooling — `@schema` 598 and `@oas` 502 on medusa, ' +
      '`@publicApi` 367 on nest, `@zh_CN` 216 on vue-vben-admin — and those really are unknown to any ' +
      'toolchain but that project’s own. The escape hatch is the same option written in the user’s ' +
      'config, which is the right place for a fact only that repository knows. Verified against oxlint ' +
      '1.76.0 that `definedTags` is honoured for this rule: adding `schema` silences `@schema` and ' +
      'leaves the other two reported.',
  },

  'correctness.jest-expect-expect': {
    setting: ['warn', { assertFunctionNames: [...ASSERTION_SHAPES] }],
    reason: EXPECT_EXPECT_REASON,
  },

  'correctness.vitest-expect-expect': {
    setting: ['warn', { assertFunctionNames: [...ASSERTION_SHAPES] }],
    reason: EXPECT_EXPECT_REASON,
  },

  'pedantic.eqeqeq': {
    setting: ['warn', 'smart'],
    reason:
      "**2637 findings on default settings, 84 with `smart` — a 96.8% reduction, and every one of " +
      "the 2553 removed is a comparison that cannot behave differently.** Measured over 32,035 " +
      "script files from the same twelve repositories the four individually-promoted rules were " +
      "measured against (nest, hono, got, trpc, vue core, date-fns, typeorm, fastify, axios, " +
      "prettier, metabase, vscode), counting `eslint(eqeqeq)` diagnostics only — oxlint also emits " +
      "`TS(...)` parse diagnostics over a corpus containing deliberately-malformed fixtures, and " +
      "counting those instead inflates every figure here by more than an order of magnitude.\n\n" +
      "`smart` exempts exactly three shapes, all of them provably equivalent under `===`: comparison " +
      "against `null` (which is the whole story — metabase alone contributes 2237 findings on " +
      "defaults and **zero** with `smart`), comparison of a `typeof` result against a string, and " +
      "comparison of two literals. What is left is ordinary loose equality on values that can differ " +
      "by coercion, which is what the rule is for.\n\n" +
      "Of the 84 that remain, 31 are prettier's `tests/format` corpus (which prettier's own eslint " +
      "config ignores) and 22 are one autogenerated file in fastify (`lib/config-validator.js`, " +
      "first line: *this file is autogenerated ... do not edit*). The other 31 are ordinary " +
      "production code across six repositories — `offset != lastOffset`, `indexOf(x) != -1`, " +
      "`currentQuotes == \"\"`, `t.id != task.id` — and the fix for each is a single character.\n\n" +
      "`smart` and not `[\"warn\", \"always\", { \"null\": \"ignore\" }]`, which was measured " +
      "alongside it at 134: the extra 50 are `typeof` and literal comparisons, so the stricter " +
      "setting buys 50 findings that are equivalent by construction. It is also the option value " +
      "that forced `RuleOptions` to be a positional list — oxlint 1.76.0 rejects the object form " +
      "outright (*unknown variant `null`, expected `always` or `smart`*).",
  },
}
