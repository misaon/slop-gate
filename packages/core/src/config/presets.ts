import { GENERATED_RECOMMENDED_RULES } from '../registry/entries.generated.ts'
import type { PresetName, RuleMap } from './types.ts'

/**
 * The `slop.*` ruleset, kept as a preset of its own **and** spread into `recommended` below.
 *
 * Two entry points, because they answer two different questions. `extends: ['slop']` alone is "tell
 * me only what looks machine-written", which is a real request and the only way to ask it without
 * also turning on 164 lint rules. `extends: ['recommended']` includes these because a tool called
 * slop-gate that finds no slop by default has failed at the one thing its name promises — and
 * because the evidence for the two rules at the centre of it is better than the evidence for most of
 * what `recommended` already ships: `slop.narrative-comment` and `slop.stub-implementation` each
 * measured **0 false positives across 3,529 files**, recorded per rule in `registry/entries.manual.ts`.
 *
 * Spread rather than folded so the measurements stay attached to the thing they measure: a reader
 * asking "what does the slop ruleset consist of, and what is the evidence" gets one list and one
 * comment, not four rows scattered through a preset built by a different policy.
 *
 * **Two of the six concepts ast-grep owns stay out, and both exclusions are numbers rather than
 * caution:** `slop.swallowed-error` (433 findings over the third-party corpus, ~19 of a 22-item
 * sample deliberate) and `slop.emoji-in-code` (20/20 false positives on this repository, all of them
 * the pretty reporter's own severity glyphs and the tests for them). Both remain available by
 * concept. Re-measuring them is the only thing that should change that.
 *
 * `warn`, not `error`, for all four: warnings do not fail a run (`EXIT_CODES` — only errors, or
 * warnings past an explicit `--max-warnings`, do). These are things to look at, not things to stop a
 * build over, and that distinction is what makes shipping them on by default defensible.
 */
const slop: RuleMap = {
  // Owned by oxlint's `typescript/no-explicit-any`, not by ast-grep — so this line is also the
  // decision to put a `restriction`-category oxlint rule into `recommended`, and it is the loudest
  // thing in this change. Measured over 21,777 third-party files: **10,777 findings in 2,093 files**,
  // and the density is wildly uneven — 0 per file in axios and fastify, 0.07 in prettier, 0.09 in
  // hono, 0.13 in metabase, 0.39 in VS Code, but **1.2 in tRPC, 2.9 in TypeORM, 3.0 in NestJS itself
  // and 4.0 in Vue core**. The heavy end is exactly the codebases whose subject matter *is* generic
  // type machinery, the same concentration `slop.double-cast` records for `zod`.
  //
  // It goes in anyway, and the reason is that these are not false positives. Every one is a real hole in the
  // type system, which is the distinction between this and the four house-style CSS rules in
  // `registry/exclusions.ts`: those produced 11,525 findings and zero defects, this produces findings
  // whose content is precisely the thing the user asked to be pedantic about. A library whose job is
  // type-level construction should turn it off in one line; an application that has accumulated three
  // `any`s per file should be told.
  'slop.as-any-cast': 'warn',
  'slop.double-cast': 'warn',
  'slop.narrative-comment': 'warn',
  'slop.stub-implementation': 'warn',
}

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
  ...slop,
  // `tsc`. Excluded from the first release on cost, which was the wrong axis: **a type error is a
  // compiler error, so the false-positive rate is zero by construction** — not low, zero — and no
  // rule in this map has better evidence than that. A tool that names type-safety as a goal and then
  // declines to notice that a project does not compile has mis-set its own bar.
  //
  // Cost, now measured rather than feared, on a 17-file NestJS project with a warm `typescript`
  // install: **+436 ms cold** (98 ms -> 534 ms) and **0 ms warm** — the result cache absorbs it
  // completely, and `tsc --incremental`'s own build info under `.slop-gate/cache` absorbs the rest.
  // A cold run that pays a third of a second once to learn whether the repository compiles is not
  // the reason a user turns a quality gate off.
  //
  // What did nearly make this wrong is not cost, and it is why `createTscEngine` now declares
  // `availability()`: `tsc -p` does no project discovery, so on a monorepo whose root has no
  // `tsconfig.json` — this repository included — the engine failed outright and `sgate check` exited
  // 3. Promoting this concept without that fix would have turned the default preset into a hard
  // first-run failure on the commonest TypeScript monorepo shape. It is now a reported coverage gap
  // instead, which is the honest answer: nothing was typechecked, and the run says so.
  'types.type-error': 'error',
  // Five of the ten concepts knip owns. Excluded wholesale on a measurement taken **before the fix
  // for it existed**: the false positives recorded against these were MikroORM migrations, a
  // `mikro-orm.config.ts` read by path, VitePress convention-loaded files and NestJS's transitive
  // `express` — which is the list §23 framework awareness was substantially built from. Nobody
  // re-measured afterwards. Re-measured now, and the exclusion's basis is gone.
  //
  // On the NestJS-shaped fixture, knip run directly reports **8 findings, 7 of them false** (5 unused
  // files: three migrations, the ORM config and slop-gate's own config; `@mikro-orm/migrations`
  // unused; `express` unlisted) against **1 true positive**. The same repository through slop-gate,
  // with profiles applied, reports **1 finding — the true positive — and nothing else**.
  //
  // A second false-positive class had to be fixed before this was honest, and it was ours rather than
  // knip's: a project-granularity engine picks its own files, so the user's `ignore` globs never
  // reached it. On this repository that alone produced **20 `dead-code.unused-file` findings, every
  // one inside a directory the config explicitly excluded**. `buildIgnore` now forwards them; the
  // count went 28 -> 7.
  //
  // **The other five stay out, and each for a reason that survived the re-measurement:**
  // `deps.unused-dependency` (1/1 false here — `oxlint`, which `engine-oxlint` reaches through
  // `require.resolve`, invisible to any import graph) and `deps.unused-dev-dependency` (1/1 false —
  // `@misaon/slop-gate`, used only by the config file slop-gate itself tells knip to ignore) are both
  // dynamic-resolution failures that framework profiles do not touch. `deps.unlisted-binary` has one
  // true and one false against it and has not been re-measured since. `dead-code.unused-enum-member`
  // and `dead-code.duplicate-export` have produced **zero findings on real code** in every
  // measurement — fixture-only evidence that they fire at all, which is how `no-implied-eval` got
  // into a registry it could never contribute to. Promoting a rule nobody has watched work is the
  // mistake this file exists to prevent.
  'dead-code.unused-file': 'warn',
  'dead-code.unused-export': 'warn',
  'dead-code.unused-exported-type': 'warn',
  'deps.unlisted-dependency': 'warn',
  // `error`, alone in this group, and categorically rather than on a count: every other concept here
  // asks "is this still needed?", which is a judgement. An import specifier that resolves to nothing
  // is not — the module cannot load and the code cannot run.
  'deps.unresolved-import': 'error',
  // The `schema` engine's own concept. Its other two rules need no entry here: they claim
  // `correctness.parse-error` (listed above) and `correctness.no-duplicate-object-key` (already in
  // `GENERATED_RECOMMENDED_RULES` at `error`), which they now co-own with oxlint per language.
  // `error`, like its neighbours, on the strength of the measurement: 826 YAML files across four
  // unrelated repositories, six findings, zero false positives.
  'config.compose-schema': 'error',
  'config.rule-overlap': 'info',
  'config.dead-override': 'warn',
  'config.unused-suppression': 'warn',
  'config.suppression-missing-reason': 'warn',
  // `error`, unlike its three neighbours: the others describe config rot a user can leave for later,
  // this one means `sgate fix` gave up on a file mid-run and the rules named are still fighting. It
  // is only ever emitted by `sgate fix`, so it costs a `sgate check` nothing.
  'config.fix-oscillation': 'error',
  // The thirteen GitHub Actions concepts the `actionlint` engine owns — every one it has except the
  // three in `MANUAL_RULE_EXCLUSIONS` (`config.workflow-runner-label`, `config.workflow-action`,
  // `config.workflow-syntax`), whose exclusion is enforced against this map by `entries.test.ts`.
  //
  // `warn` uniformly, on the measurement recorded per entry in `registry/entries.manual.ts`: over 403
  // workflow files from 17 repositories these thirteen produced **29 findings, 29 true positives, no
  // false positives**, with eight of them silent across thousands of opportunities. `error` is the
  // `schema` engine's bar and is deliberately not claimed on a first release.
  //
  // Costing a repository with no workflows nothing is structural rather than careful: every entry is
  // scoped to `languages: ['github-workflow']`, so arbitration never elects one where the inventory
  // contains no workflow files. On a machine with no actionlint, all thirteen become a reported
  // coverage gap instead — never a silent absence.
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
  // The seventeen CSS concepts the `biome-css` engine owns, out of the twenty-six it has; the other
  // nine are in `MANUAL_RULE_EXCLUSIONS`, and `entries.test.ts` asserts none of them reaches this map.
  //
  // **This set is deliberately quiet, and that is the design rather than an accident to fix later.**
  // Thirteen of the seventeen produced zero findings across 1729 production stylesheets from ten
  // repositories; the other four produced 21 findings between them. On a typical repository this
  // engine reports nothing. What was excluded is what would have made it loud: four house-style rules
  // that account for 11,525 of the 12,125 findings measured and none of the ~23 real defects.
  //
  // `warn` uniformly, matching actionlint's first-release policy — `error` is the bar the `schema`
  // engine clears on 826 files, and the best-measured rule here has six findings behind it.
  //
  // Costing a repository with no stylesheets nothing is structural, not careful: every entry is
  // `languages: ['css']`, so arbitration never elects one where the inventory has no CSS. Note the
  // deliberate absence of `scss` — Biome cannot lint it at all (see `BIOME_CSS_RULE_ENTRIES`), and a
  // repository whose stylesheets are all SCSS gets no coverage here and no false impression of it.
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
  // Neither of the next two is a Biome rule; both are the adapter reporting on its own coverage, and
  // both are here because the failure they guard is silence rather than noise. A stylesheet biome
  // cannot parse, and a stylesheet carrying a suppression written for biome rather than for us, are
  // each a file whose clean result means nothing — the same shape as an engine that is not installed.
  'config.css-not-analysed': 'warn',
  // The adapter's own report that a stylesheet carries a `biome-ignore` comment
  // it cannot see through. In `recommended` for the reason `config.unused-suppression` is: a
  // suppression slop-gate did not write and cannot account for is a coverage gap, and the failure
  // mode it guards is silence rather than noise.
  'config.foreign-suppression': 'warn',
}

const strict: RuleMap = {
  ...recommended,
  'dead-code.unused-import': 'error',
  'dead-code.unused-variable': 'error',
  'style.no-var': 'error',
  'config.rule-overlap': 'warn',
}

export const PRESETS: Readonly<Record<PresetName, RuleMap>> = { recommended, strict, slop }
