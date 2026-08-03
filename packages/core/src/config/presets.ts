import { GENERATED_RECOMMENDED_RULES } from '../registry/entries.generated.ts'
import { OPTIONED_RECOMMENDED_RULES } from './rule-options.ts'
import type { PresetName, RuleMap } from './types.ts'

/** `OPTIONED_RECOMMENDED_RULES` flattened to the `RuleMap` shape the presets below spread. */
const optionedRules: RuleMap = Object.fromEntries(
  Object.entries(OPTIONED_RECOMMENDED_RULES).map(([concept, rule]) => [concept, rule.setting]),
)

/**
 * The `slop.*` ruleset, kept as a preset of its own **and** spread into `recommended` below.
 *
 * Two entry points, because they answer two different questions. `extends: ['slop']` alone is "tell
 * me only what looks machine-written", which is a real request and the only way to ask it without
 * also turning on 164 lint rules. `extends: ['recommended']` includes these because a tool called
 * slop-gate that finds no slop by default has failed at the one thing its name promises — and
 * because the evidence for the two rules at the centre of it is better than the evidence for most of
 * what `recommended` already ships: `slop.narrative-comment` and `slop.stub-implementation` each
 * measured **0 false positives across 3,529 files**, recorded per rule in `registry/entries.uncatalogued.ts`.
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
  // `registry/not-recommended.ts`: those produced 11,525 findings and zero defects, this produces findings
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
 * `registry/not-recommended.ts` — see the generator's `buildGeneratedRecommended`. `correctness` alone
 * would silently drop five already-shipped, already-measured-useful rules (`no-shadow` chief among
 * them — see registry/overrides.ts) that are `suspicious`-category in oxlint's own taxonomy; the
 * plan's own grounding measurement reports `correctness` and `suspicious` together (319 rules) for
 * exactly this reason, so both categories are the policy, not `correctness` read literally.
 *
 * `correctness.parse-error` is the one concept this preset still lists by hand: it comes from
 * `entries.uncatalogued.ts`'s synthetic `oxlint/parse-error` entry, which no generator can produce because
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
  // **`dead-code.unused-file` went back out again**, and the entry in `registry/not-recommended.ts` has
  // the measurement: a 145k-line React monorepo produced 105 findings, of which at least 98 are a
  // file loaded by a convention no import graph can see — and by *six unrelated* conventions, which
  // is the part that matters. The re-measurement above was taken on a fixture built from the very
  // cases the profiles fix; it could not have found this.
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
  'dead-code.unused-export': 'warn',
  'dead-code.unused-exported-type': 'warn',
  'deps.unlisted-dependency': 'warn',
  // `error`, alone in this group, and categorically rather than on a count: every other concept here
  // asks "is this still needed?", which is a judgement. An import specifier that resolves to nothing
  // is not — the module cannot load and the code cannot run.
  //
  // **Known duplicate, kept deliberately.** On a TypeScript project this now double-reports with
  // `types.type-error`: a missing `./does-not-exist.js` is both this concept and TS2307, on the same
  // line, from two engines. Arbitration cannot merge them — they are two concepts, not two rules
  // contesting one — so the user genuinely sees it twice. It stays because tsc's half is conditional
  // in two ways this is not: it needs a `tsconfig.json` to exist at all, and it covers only `.ts`.
  // A JavaScript project, or a TypeScript one whose root has no project file, would otherwise get no
  // report of an import that cannot resolve. One duplicated line is the cheaper failure.
  'deps.unresolved-import': 'error',

  // The `deps-security` engine (spec §13.7). Three of its four concepts are in; the exclusion of the
  // fourth is recorded in registry/not-recommended.ts.
  //
  // **This is the only group here promoted on an exact-agreement measurement rather than a
  // false-positive count.** Six real lockfiles, 10,671 resolved packages, 682 advisories, scanned
  // offline and again with `npm audit` against the live registry: zero divergence in either
  // direction. There is no false-positive rate to quote because the question does not arise — a
  // version is inside an advisory's range or it is not.
  //
  // `warn` for the vulnerability concept, and that is the volume valve rather than a hedge about
  // accuracy: the axios lockfile alone yields 164 findings, and an accurate check that fails every
  // build on its first run gets switched off wholesale, which is the outcome worth avoiding. The
  // reachability caveat on the concept is the honest justification for it.
  'security.vulnerable-dependency': 'warn',
  // `error`, and the only one of these that fires on almost nothing: zero findings across all six
  // corpora. A confirmed-malicious published release has no "probably fine" reading.
  'security.malicious-dependency': 'error',
  // Here rather than left to the engine's own logging, because it is the engine reporting what it did
  // *not* cover — a snapshot old enough to be missing advisories, or a lockfile format it cannot
  // read. `npm audit --offline` is the cautionary tale this concept exists to not repeat: on a tree
  // with 34 real advisories it exits 0, writes nothing at all to stderr, and reports zero.
  'deps.advisory-coverage-gap': 'warn',
  // Four oxlint rules promoted **individually**, from three categories none of which is promotable
  // whole. Measured over 21,777 third-party files from 12 repositories (nest, hono, got, trpc, vue
  // core, date-fns, typeorm, fastify, axios, prettier, metabase, vscode), then audited by reading
  // real occurrences in context rather than by counting:
  //
  // | category    | rules | findings | why not wholesale                                            |
  // |-------------|-------|----------|--------------------------------------------------------------|
  // | nursery     |    10 |  121,066 | 119,932 are `no-undef`, wrong on TS by construction; upstream calls the tier unfinished |
  // | restriction |    95 |  501,955 | language-feature bans by definition — top entries ban `async`/`await` (44,303) and optional chaining (34,663) |
  // | style       |   270 |  430,646 | house style; the category oxlint itself describes as "more idiomatic", not "wrong" |
  // | pedantic    |   104 |   56,096 | genuinely mixed — `eqeqeq` and `jsdoc/*` sit in the same tier |
  // | perf        |    14 |    9,866 | 70% is four `react-perf` JSX rules on inline props, a judgement call |
  //
  // A category's name is not evidence, and neither is its size. These five earned it one at a time.
  //
  // Two of the five are here because a selection can now carry per-rule options, so a rule whose
  // *default configuration* was the problem could finally be judged on its behaviour instead. Two
  // were re-measured on that basis; one survived and one did not, and the difference is the useful
  // part — an option that changes the count is not the same as an option that changes the content.
  //
  // `pedantic.eqeqeq` survived. Its setting, and the measurement behind the exact option value, live
  // in `./rule-options.ts` — where removing the options means removing the evidence that put the
  // rule here. On defaults it is the noisiest rule ever considered for this preset (2637 findings);
  // with `smart` it is one of the quietest (84).
  //
  // **`restriction.no-empty-object-type` did not, and the option values are not the reason.** 926
  // findings on defaults over 32,035 files; 608 with `allowInterfaces: 'with-single-extends'`, which
  // exempts the deliberate `interface X extends Y {}` forward-compat idiom (318 of the 376
  // empty-interface findings); 58 once `allowObjectTypes: 'always'` also removes all 550
  // empty-object-literal findings. Setting `allowInterfaces: 'always'` as well takes it to **0** —
  // the rule has no third thing to report, which is the shape of a rule whose entire content is its
  // two option switches.
  //
  // The 58 are where it dies. Eighteen are prettier's `tests/format` fixtures. Of the other 40,
  // every one read in context was deliberate: hono's `ContextVariableMap {}` and Vue's
  // `ComponentCustomOptions {}` (whose own JSDoc is the `declare module` augmentation example),
  // VS Code's `IWorkbenchContribution` (whose body is the comment `// Marker Interface`), tRPC's
  // ambient `Event {}`, TypeORM's `Email {}` type-parameter placeholder. Declaration-merging
  // targets and marker interfaces are what an empty interface is *for* in TypeScript, and no option
  // distinguishes one from a vestigial declaration. The 550 literals it also drops are the same
  // story one level down — `T extends {}`, `S extends Schema = {}`, `: {}` conditional branches —
  // type-level machinery, not holes. Same verdict as `unicorn/no-array-sort`
  // (`registry/not-recommended.ts`): the option changes the count and not the content.
  //
  ...optionedRules,
  'pedantic.prefer-ts-expect-error': 'warn',
  // 79 findings, ~75 true. `@ts-ignore` silences an error *and keeps silencing nothing* once the
  // underlying error is fixed; `@ts-expect-error` fails loudly when it becomes unnecessary. The four
  // false positives are one pattern in tRPC — a suppression whose own comment says the error does not
  // reproduce in every environment, where `@ts-expect-error` would break the build that lacks it.
  //
  // Deliberately promoted while `typescript/ban-ts-comment` is not, and they look like near-
  // duplicates. **Re-measured with options in hand, because "its default configuration is wrong" was
  // the obvious next thing to check about it — and the option fixes the volume without producing a
  // rule worth having.** Over the same 32,035 files: 325 findings on defaults, of which 264 are Vue
  // core alone; with `{ "ts-expect-error": false }`, which is the option that silences the
  // missing-description nit, **24**. Eighteen of those 24 are `@ts-ignore`, every one of which
  // `prefer-ts-expect-error` above already reports — it found 97 across the same corpus, a strict
  // superset, because it flags a described `@ts-ignore` too and ban-ts-comment's default does not.
  // The six that are genuinely its own are all `@ts-nocheck`: one date-fns release script and five
  // axios module-resolution test helpers, all deliberate. Six findings in 32,035 files, none of them
  // a defect, is not a rule — it is the answer to a question, recorded so nobody asks it again.
  //
  // Worth noting for the next reader: oxlint validates this rule's options **laxly**. `eqeqeq` and
  // `no-empty-object-type` reject an unknown key by name and refuse to load the config;
  // `ban-ts-comment` accepts `{ "bogusKey": 1 }` and `{ "ts-expect-error": "bogus" }` in silence
  // (both confirmed against 1.76.0). A typo in its options would have been invisible, which is a
  // second reason not to build a promotion on top of them.
  'restriction.no-import-type-side-effects': 'warn',
  // 100 findings, ~13 of 14 audited true, and the one rule here that catches something a careful
  // developer still would not see. Under single-file transpilation — esbuild, swc, Babel, which is
  // now the default toolchain — `import { type X } from 'y'` is not fully erased the way `import type
  // { X } from 'y'` is, so an import that looks type-only leaves a real runtime import of `y` behind.
  // The rewrite is mechanical and safe. Concentrated (86 of 100 in VS Code, largely one subsystem),
  // which is disclosed because it would otherwise read as a commoner defect than it is.
  'perf.no-accumulating-spread': 'warn',
  // 44 findings across 21,777 files — the lowest volume of anything considered, which is most of the
  // argument: about half are genuine O(n²) accumulation on data that scales (typeorm reduces that
  // reinvent `.flat()`, metabase's array-to-map builders, and Vue's server renderer attribute merge,
  // which runs on every render), and the rest are the same shape on collections that happen to be
  // small. The fix is always mechanical, and 44 findings is not a review burden.
  //
  // Its sibling `oxc/no-map-spread` (226) is deliberately absent: `{...item, x}` inside `.map()` is
  // O(n), the same complexity as the map itself, so that rule names a constant factor as if it were a
  // blowup. Same category, same author, opposite verdict — which is why this list is five rules and
  // not a category.
  'restriction.no-non-null-asserted-nullish-coalescing': 'warn',
  // **1 finding in 21,777 files**, and it is real: `a! ?? b!`, which asserts a value cannot be null
  // and in the same breath handles it being null. Included because a rule that contradicts itself is
  // never a false positive and this one costs nothing to carry — but recorded honestly as
  // near-inert, not as a win. It is the counter-example to judging a rule by its finding count in
  // either direction.
  //
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
  // three in `NOT_RECOMMENDED_UNCATALOGUED` (`config.workflow-runner-label`, `config.workflow-action`,
  // `config.workflow-syntax`), whose exclusion is enforced against this map by `entries.test.ts`.
  //
  // `warn` uniformly, on the measurement recorded per entry in `registry/entries.uncatalogued.ts`: over 403
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
  // The five Dockerfile concepts the `hadolint` engine owns. Out of roughly seventy rules upstream
  // ships, which is the whole story of this engine: over 275 real Dockerfiles from 32 repositories
  // hadolint measured **25% precision**, with thirteen rules producing 552 findings (68% of its
  // output) and **zero** true positives. Those thirteen are in `NOT_RECOMMENDED_UNCATALOGUED`, and
  // `entries.test.ts` asserts none of them reaches this map.
  //
  // `warn` uniformly, on the per-entry measurement in `registry/entries.uncatalogued.ts`: the six shipped
  // rules produced **150 true positives**, and three of them (`DL3007` 18/18, `DL3029` 10/10,
  // `DL3042` 8/8) had no false positives at all. hadolint's own severity is deliberately not mapped —
  // `DL3020` is `error` upstream and measured zero true positives, while `DL4006` is `warning` and
  // measured 78, so its tiers do not track defect density.
  //
  // Costing a repository with no Dockerfiles nothing is structural, exactly as for the workflow
  // concepts above: every entry is scoped to `languages: ['dockerfile']`. On a machine with no
  // hadolint they become a reported coverage gap rather than a silent absence.
  'config.dockerfile-base-image-mutable-tag': 'warn',
  'config.dockerfile-base-image-untagged': 'warn',
  'config.dockerfile-entrypoint-form': 'warn',
  'config.dockerfile-package-cache': 'warn',
  'config.dockerfile-pipefail': 'warn',
  'config.dockerfile-platform': 'warn',
  // The seventeen CSS concepts the `biome-css` engine owns, out of the twenty-six it has; the other
  // nine are in `NOT_RECOMMENDED_UNCATALOGUED`, and `entries.test.ts` asserts none of them reaches this map.
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
