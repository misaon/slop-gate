import type { ConceptId } from '../concepts/catalogue.ts'
import type { RuleSetting } from './types.ts'

export type OptionedRule = {
  /**
   * The complete setting `recommended` carries for this concept — level **and** options together,
   * because the two were measured together and neither number means anything without the other.
   */
  readonly setting: RuleSetting
  /**
   * Why these exact option values, in the same terms every other promotion in this registry is
   * argued: a count against a named corpus, not a description of what the option does.
   */
  readonly reason: string
}

/**
 * Rules that reach `recommended` **only because of a specific option value**, kept as data rather
 * than written inline in `presets.ts`.
 *
 * The failure this exists to prevent is one edit: somebody tidying `['warn', 'smart']` down to
 * `'warn'` because the tuple looks like clutter. That edit is invisible in review — the level is
 * unchanged and the rule is still there — and it restores 2553 findings. Here the options cannot be
 * removed without also removing the measurement that justifies the rule's presence, and
 * `presets.test.ts` asserts every row survives into `recommended` and `strict` byte for byte.
 *
 * Levels stay the same as everything else in `recommended`: `warn` unless a rule clears the bar
 * `config.compose-schema` and `types.type-error` set, which none of these do.
 */
/**
 * The assertion shapes `expect-expect` cannot see by itself. Shared by both twins below so the jest and
 * vitest halves of one rule cannot drift into disagreeing about what an assertion is.
 *
 * `**.expect` and `**.should.**` are property chains, not function names: supertest's
 * `request(app).post(url).expect(201)` and chai's `value.should.be.equal(true)`. `*.expect` was measured
 * too and matches neither — the matcher needs `**` to cross a chain of unknown depth.
 *
 * A bare `should*` is deliberately absent where `expect*` and `assert*` are present: `shouldRetry()` is a
 * predicate, and admitting it would silence real findings to buy nothing measurable.
 */
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

export const OPTIONED_RECOMMENDED_RULES: Readonly<Partial<Record<ConceptId, OptionedRule>>> = {
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
