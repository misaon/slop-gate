import type { RuleEntry } from './types.ts'

/**
 * knip (`packages/engine-knip`), the third engine and the second with `granularity: 'project'`.
 *
 * **`engineRuleId` is a knip *issue type*, not a rule.** knip has no per-rule catalogue at all — no
 * `--rules` to introspect the way oxlint has, and unlike `tsc` (whose entire domain collapses into one
 * synthetic `type-error`) knip does publish a real, finite selection vocabulary: the seventeen names
 * its own `--include`/`--exclude` accept. Ten of them are surfaced here, one entry each, so a user can
 * disable exactly the category they distrust (`'dead-code.unused-file': 'off'`) without losing the
 * rest. The other seven are excluded as first-class data, each with a written reason, in
 * `packages/engine-knip/src/issue-types.ts` — that file and this list are asserted to partition knip's
 * full vocabulary between them, so no category can be dropped silently.
 *
 * **`tier: 2`** (JavaScript/WebAssembly). knip parses with `oxc-parser`, but tier expresses what the
 * engine *is* and knip's analysis — the module graph, the workspace resolution, the plugin catalogue —
 * is JavaScript. Inert in practice: no other engine contests any of these concepts today.
 *
 * **`requires: []`, `provides: []`.** `workspace-graph` would read as the apt `requires` value, but
 * `requires`/`provides` is a pool populated by engines' own `provides` declarations, and nothing
 * provides `workspace-graph` — declaring it would make every entry here permanently unelectable. And
 * knip *consuming* a workspace graph does not make one available to another engine's rules, which is
 * what `provides` means (see the `tsc` entry below for the same argument at length).
 *
 * **None of these are in `recommended`,** and that is a measurement, not caution. Two independent
 * repositories were checked (a NestJS-shaped fixture reproducing the srvc-bat grounding run, and this
 * repository): `files` was **13/13 false positives** across both, `dependencies` **3/3**. Every entry
 * below records what was actually measured for it. Cost is not the reason — knip runs this repository
 * (153 JS/TS files) in ~0.31s, a genuinely cheap project engine — accuracy is. Opt in by concept, the
 * same way `types.type-error` is opted into today.
 *
 * **`severityDefault` is the deliberate level choice**, since it is what applies when a user enables a
 * concept without naming a level. It is `warn` for everything except `deps.unresolved-import`: the
 * whole group is judgement, reported for review, except the one case where the module genuinely
 * cannot load.
 *
 * `docsUrl` is knip's own issue-type reference for every entry — that page documents the ten in one
 * table and publishes no per-type anchors (checked directly), so a fabricated fragment would be worse
 * than the honest one.
 */
const KNIP_DOCS = 'https://knip.dev/reference/issue-types'

const KNIP_RULE_ENTRIES = [
  {
    engine: 'knip',
    // Measured: 13/13 false positives across two repositories. On the NestJS-shaped fixture, six of
    // six — three MikroORM migrations (discovered by the ORM at runtime, never imported), a
    // `mikro-orm.config.ts` read by path, and two VitePress convention-loaded files. On this
    // repository, seven of seven — six committed e2e fixture sources plus `slop-gate.config.ts`
    // itself. Every one is a file that is loaded, but not *imported*, which is the only kind of
    // reachability a static analyser has. `engine-knip` removes the last of those (it ignores our own
    // config file, which it knows the path of); the rest are the concept's irreducible failure mode,
    // documented on the concept itself.
    engineRuleId: 'files',
    concepts: ['dead-code.unused-file'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Measured: 3/3 false positives. `@mikro-orm/core` and `@mikro-orm/migrations` on the fixture
    // (both imported only from files knip had already — wrongly — decided were unreachable, so this
    // category compounds `files`' errors rather than failing independently), and `oxlint` on this
    // repository, which `packages/engine-oxlint` spawns via `require.resolve` rather than importing.
    // Two different causes, one shared shape: a dependency used in a way no import graph can see.
    engineRuleId: 'dependencies',
    concepts: ['deps.unused-dependency'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // The best-performing category measured: four true positives out of four on the fixture — the
    // `@typescript-eslint/*`, `eslint-config-prettier` and `eslint-plugin-prettier` packages left
    // behind after eslint itself was removed, which is exactly the defect this category exists for.
    // Not promoted to `recommended` on that alone: the one false positive seen (`vitepress`, reported
    // unused in a workspace whose only consumer is a convention-loaded config knip's own plugin failed
    // to locate) shows it inherits reachability's failure mode too, and four findings is not a sample.
    engineRuleId: 'devDependencies',
    concepts: ['deps.unused-dev-dependency'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Measured: 3/3 false positives, all three the *same* logical finding — `express`, reported once
    // per importing file, on a project that gets it transitively through `@nestjs/platform-express`.
    // The duplication is deliberate and kept (see `parseKnipOutput`); the false positive is not
    // fixable here, because "a framework meta-package re-exports this" is exactly the framework
    // awareness the M0 follow-ups record the registry as lacking.
    engineRuleId: 'unlisted',
    concepts: ['deps.unlisted-dependency'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Measured: 1 true positive (`nest`, a script calling a CLI the fixture never declares) and 1
    // false positive (`vitepress`, provided by a workspace devDependency knip could not see for the
    // same plugin-path reason as above). Small sample, both directions represented.
    engineRuleId: 'binaries',
    concepts: ['deps.unlisted-binary'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Zero findings across both repositories, so no accuracy claim is made — but this is the one
    // entry whose `severityDefault` is `error`, and the reason is categorical rather than measured:
    // every other concept in this group asks "is this still needed?", which is a judgement. An import
    // specifier that resolves to nothing is not a judgement — the module cannot load and the code
    // cannot run, which is `correctness`-grade even though it is filed under `deps` for provenance.
    engineRuleId: 'unresolved',
    concepts: ['deps.unresolved-import'],
    tier: 2,
    priority: 50,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // 1 true positive, 0 false positives — the cleanest measured rate here, and also the smallest
    // sample in the set, which is why it is not in `recommended` either. Structurally the most
    // trustworthy of the ten: it is computed *within* files knip already reached, so it only fails
    // when reachability errs in the rarer direction (a file wrongly considered reached), not the
    // common one.
    engineRuleId: 'exports',
    concepts: ['dead-code.unused-export'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Zero findings measured. Kept separate from `exports` rather than folded into it because the
    // right answer differs systematically: an exported type is part of a package's published surface
    // far more often than an exported value is, so a user will plausibly want one on and the other off.
    engineRuleId: 'types',
    concepts: ['dead-code.unused-exported-type'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Zero findings measured on real code; exercised against a purpose-built fixture only
    // (packages/engine-knip/src/parse.test.ts), which is what confirmed knip qualifies the member with
    // its parent enum via the JSON reporter's `namespace` field rather than a bare member name.
    engineRuleId: 'enumMembers',
    concepts: ['dead-code.unused-enum-member'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
  {
    engine: 'knip',
    // Zero findings on real code; reproduced deliberately in a fixture (`export function duped` plus
    // `export default duped`), which is what surfaced that `duplicates` is one of only two issue types
    // knip's JSON reporter emits as an array *of arrays* — one inner array per group of names that
    // duplicate each other. Each name in a group becomes its own diagnostic, at its own position.
    engineRuleId: 'duplicates',
    concepts: ['dead-code.duplicate-export'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: KNIP_DOCS,
    since: '0.1.0',
  },
] as const satisfies readonly RuleEntry[]

/**
 * ast-grep (`packages/engine-astgrep`), the fourth engine and the second with `granularity: 'file'`.
 * It owns the pattern-shaped half of the slop ruleset (spec §14) and nothing else.
 *
 * **`tier: 0`.** ast-grep is a native Rust binary over tree-sitter grammars, doing syntax-only
 * matching — the same tier as oxlint, and not `2` merely because its rules are authored in YAML.
 * The consequence is deliberate and load-bearing: it puts ast-grep on equal footing with oxlint at
 * arbitration, where the engine preference order then hands oxlint anything both can do. That is why
 * there is no entry here for `slop.as-any-cast` — see `slop-double-cast` below.
 *
 * **`docsUrl` points at this repository, not at `slop-gate.dev`.** Core's own orchestrator
 * diagnostics use a `slop-gate.dev/concepts/<id>` URL (`engine/normalize.ts`); that site does not
 * exist yet, and a slop rule is required by §14 to ship with a page explaining *why* the pattern is a
 * problem. `docs/rules/*.md` is committed here and reachable today, which is the point of a
 * `docsUrl`. Move these when the site lands.
 *
 * **Levels and preset membership are measurements.** Every rule below was run over two corpora
 * before it was given either: this repository's own 163 JS/TS files (spec §20 — "the tool's own
 * source has to survive its own `slop.*` ruleset"), and 3,366 third-party JS/TS files (~45 MB) from
 * `node_modules`, chosen because it is human-written code nobody wrote to pass these rules. Each
 * entry records what it found. Two rules earned a place in the `slop` preset; two are opt-in by
 * concept only, and the reason is a number in both cases.
 *
 * **True-positive evidence is weaker than false-positive evidence here, and deliberately so.** No
 * corpus of known AI-generated code was available to measure against, so what is proved on real code
 * is the false-positive rate; that a rule fires at all on the pattern it names is proved by
 * `packages/engine-astgrep/fixtures`. Any claim below of the form "0 false positives over N files"
 * is measured; there is no matching claim about recall.
 */
const ASTGREP_DOCS = 'https://github.com/misaon/slop-gate/blob/main/docs/rules'

const ASTGREP_RULE_ENTRIES = [
  {
    engine: 'astgrep',
    // Measured: 2 findings on this repository, both in `packages/engine-tsc/src/parse.ts`, both
    // genuine — a `RegExpExecArray` asserted to be a fixed-length tuple of non-optional strings, so
    // a regex change that makes one group optional yields `undefined` typed as `string` with nothing
    // to catch it. 65 on the third-party corpus, but concentrated rather than diffuse: 7 files in 2
    // packages, 62 of them in `zod`, whose entire subject matter is type-level construction. That
    // shape is what puts it in the `slop` preset (opt-in, by name) and not in `recommended`: on
    // ordinary application code it is low-volume and points at something real, and on a type-level
    // library it is a wall — and the author of a type-level library will not have opted in.
    //
    // This entry exists at all only because oxlint does not cover it. Verified against oxlint 1.76.0
    // on a five-case fixture: `typescript/no-explicit-any` reported 4 (`x as any`, `const b: any`,
    // `function d(p: any)`, `<any>x`) and reported *nothing* for `x as unknown as string` — there is
    // no `any` in that source to find. Claiming `slop.as-any-cast` here instead would have lost
    // arbitration to that rule on engine preference at equal tier and contributed nothing.
    engineRuleId: 'slop-double-cast',
    concepts: ['slop.double-cast'],
    tier: 0,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    // TypeScript syntax; `as` is not JavaScript, so the rule has no `language: JavaScript` document.
    languages: ['ts', 'tsx'],
    docsUrl: `${ASTGREP_DOCS}/slop.double-cast.md`,
    since: '0.1.0',
  },
  {
    engine: 'astgrep',
    // The worst-measured rule shipped here, and the number is the whole reason it is in no preset.
    // 0 findings on this repository (which contains no empty `catch` at all). 433 on the third-party
    // corpus across 34 packages; a random sample of 22 was read in context and roughly 19 were
    // deliberate — feature probes (`try { require.resolve('picomatch') } catch {}`), optional reads,
    // best-effort cleanup, `new URL(x)` validity tests. The three that were not include one whose
    // own comment reads `// Swallow // XXX should we be logging these?`, which is the concept
    // exactly. So: the rule detects what §14 asks for, and in library code most of what it detects
    // is intentional. Opt-in by concept, like everything knip owns and for the same reason.
    //
    // Only the *empty* half of §14's "empty, or only logs and continues" is implemented. The logging
    // half was written and measured out: 5 findings across the third-party corpus, every one a CLI
    // printing an error at its top level, where that is the correct handling.
    engineRuleId: 'slop-swallowed-error',
    concepts: ['slop.swallowed-error'],
    tier: 0,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: `${ASTGREP_DOCS}/slop.swallowed-error.md`,
    since: '0.1.0',
  },
  {
    engine: 'astgrep',
    // Measured: 0 findings on both corpora — 0 false positives over 3,529 files, and 0 true
    // positives too. That second half is not a defect of the rule and is worth stating plainly:
    // published library code does not ship functions that throw "not implemented", which is the
    // point — unfinished work does. It fires correctly on the fixture, including the cases it must
    // *not* fire on (an `abstract` member, a non-exported helper, a real `throw new Error('config
    // file missing')`, a guard clause that throws mid-body).
    //
    // In the `slop` preset rather than merely available, on the strength of how narrow the match is:
    // the function's entire body must be one `throw new X(...)` whose message names non-completion.
    // The one legitimate shape it can hit is a concrete must-override hook, which TypeScript already
    // has `abstract` for; the documented escape covers the rest.
    engineRuleId: 'slop-stub-implementation',
    concepts: ['slop.stub-implementation'],
    tier: 0,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: `${ASTGREP_DOCS}/slop.stub-implementation.md`,
    since: '0.1.0',
  },
  {
    engine: 'astgrep',
    // The rule this ruleset is named for, and the one measured hardest. 0 findings on this
    // repository — the strongest available discriminator, because spec §20 mandates dense
    // explanatory comments here and near-misses are everywhere in them ("in a real run", "a
    // placeholder path", "in production that transitively loads..."), none of which match. 2 on the
    // third-party corpus, and both are the same comment in two bundles of rollup — `// Placeholder
    // until proper Symbol.Iterator support` — which is a genuine self-declared placeholder, so the
    // measured false-positive count across 3,529 files is **0**.
    //
    // That number is the product of measuring six candidate patterns *out*, and the list matters
    // more than the survivors because §14 names one of them as an example to detect. Dropped, with
    // counts, on the third-party corpus: the reader-addressing family ("note that we", "as you can
    // see", "we'll", "here we", "notice that") — **76 findings, every one a legitimate
    // explanation**, so §14's "Note that we…" example is deliberately not implemented; `for now` —
    // 25; `this is a (simplified|example|mock|dummy)` — 2; `for testing purposes` — 2;
    // `in (production|reality)` — 2; `you can (typically|…)` — 1. Re-adding any of them needs a
    // measurement, not an argument.
    engineRuleId: 'slop-narrative-comment',
    concepts: ['slop.narrative-comment'],
    tier: 0,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: `${ASTGREP_DOCS}/slop.narrative-comment.md`,
    since: '0.1.0',
  },
  {
    engine: 'astgrep',
    // Measured: **20 findings on this repository, 20/20 false positives** — twelve in
    // `packages/reporters/src/display-width.test.ts` and four in `position.test.ts`, which exist
    // *to* test wide and multi-byte characters, plus the three severity glyphs in
    // `packages/reporters/src/severity.ts`, which are the product's own output. 127 on the
    // third-party corpus, dominated by `tsdown`'s CLI status lines. Every single hit across both
    // corpora is a deliberate glyph, and no syntactic property separates a deliberate one from
    // `console.log('✅ Done!')` — so this ships opt-in by concept and enters no preset, including
    // `slop`. It is aimed at repositories where emoji have no business appearing at all, and it is
    // useless-to-harmful in a CLI, which is what slop-gate happens to be.
    //
    // The pattern is `\p{Emoji_Presentation}` plus VS16-qualified pictographs, never `\p{Emoji}`:
    // that property is true for `#`, `*` and every ASCII digit, so the naive version flags
    // `'#1 and *2 and 3'`, `'25°C'` and `'€100'` (all reproduced). `™`, `✓`, `→` and the box-drawing
    // characters this repository's own frame renderer uses are correctly left alone.
    engineRuleId: 'slop-emoji-in-code',
    concepts: ['slop.emoji-in-code'],
    tier: 0,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx'],
    docsUrl: `${ASTGREP_DOCS}/slop.emoji-in-code.md`,
    since: '0.1.0',
  },
] as const satisfies readonly RuleEntry[]

/**
 * The `schema` engine (`packages/engine-schema`) — JSON Schema and YAML structural validation, and
 * the first engine here that is not a wrapper around somebody else's binary.
 *
 * **`tier: 2`** (JavaScript/WebAssembly), which is honest: `ajv` and `yaml` are both JavaScript.
 * Inert in practice, because after the concept split below no other engine contests any of these.
 *
 * **All three are in `recommended`, and all three are `error`** — the only entries in this file that
 * are, and the reason is the measurement rather than confidence in the idea. Measured over **826 YAML
 * files from four unrelated repositories** (docker/awesome-compose, kubernetes/examples,
 * actions/starter-workflows, prometheus/prometheus): **six findings in total, zero false positives**.
 * Every one was a `duplicate-mapping-key`, and every one was read in context and confirmed genuine —
 * two of them discard a *different* value (prometheus's own `section_key_dup.bad.yml`, a deliberately
 * invalid fixture, and a Kubernetes secret declaring `type` twice), the rest are redundant
 * re-declarations. That is the inverse of the knip and ast-grep measurements in this same file, and it
 * is why these reach `recommended` where those did not: there is no judgement call in a duplicate key.
 *
 * **The concepts are `config.*`, not `correctness.*`, and that is not cosmetic.** `electOwners` elects
 * one owner per concept for the **whole repository**, not per language. A `schema` entry claiming
 * `correctness.parse-error` or `correctness.no-duplicate-object-key` would lose to oxlint's tier-0
 * entry in every repository that contains any TypeScript — which is every repository slop-gate targets
 * — and YAML would go silently unchecked while the run reported a `config.rule-overlap` for an overlap
 * that does not exist, since the two engines cover disjoint files. Verified directly against
 * `electOwners`. The M0 follow-ups record the underlying limitation; these entries route around it.
 *
 * `fixKind: 'none'` throughout. A schema knows a value is wrong, never what the author meant, and
 * `ports: 8080` has at least two plausible repairs in a file that governs how something deploys.
 */
const SCHEMA_RULE_ENTRIES = [
  {
    engine: 'schema',
    // 0 findings over all 826 files of the corpus — no false positives, and no true positives either.
    // Stated plainly because it is the honest read: published repositories do not contain YAML that
    // fails to parse, since nothing they run would work if they did. It earns `recommended` on cost
    // and consequence rather than on hit rate — the check is free (the file is already being parsed
    // for the other two rules) and the finding is never a judgement call.
    engineRuleId: 'parse-error',
    concepts: ['correctness.parse-error'],
    tier: 2,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['yaml', 'github-workflow'],
    docsUrl: 'https://yaml.org/spec/1.2.2/',
    since: '0.1.0',
  },
  {
    engine: 'schema',
    // The measurement that carries this whole engine: 6/6 true positives, 0 false positives, over 826
    // files from four unrelated repositories. Two discard a different value outright; the other four
    // are redundant re-declarations, which are still defects — the file states an intention twice and
    // a reader cannot tell which one the system honours without knowing YAML's merge order.
    engineRuleId: 'duplicate-mapping-key',
    concepts: ['correctness.no-duplicate-object-key'],
    tier: 2,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['yaml', 'github-workflow'],
    docsUrl: 'https://yaml.org/spec/1.2.2/#nodes',
    since: '0.1.0',
  },
  {
    engine: 'schema',
    // Measured from both ends. False positives: the binding pattern matched exactly 39 files across
    // the 826-file corpus, every one a genuine Compose file, and all 39 validated clean — 0/39. True
    // positives: of ten deliberately seeded defects, nine are caught and each collapses to exactly one
    // finding pointing at the offending token (see `validate.ts` on why collapsing is necessary at
    // all). The tenth, `restart: sometimes`, is **not** caught, and the gap is upstream rather than
    // here — the specification types `restart` as a bare string with no enum, so an invalid policy is
    // not a schema violation. Recorded so nobody reads a clean run as proof the value was checked.
    engineRuleId: 'compose-spec',
    concepts: ['config.compose-schema'],
    tier: 2,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    // Not `github-workflow`: a workflow is never a Compose file, and `bindSchema` keys off the
    // basename, so this rule can only ever fire on a file named like one.
    languages: ['yaml'],
    docsUrl: 'https://github.com/compose-spec/compose-spec/blob/main/spec.md',
    since: '0.1.0',
  },
] as const satisfies readonly RuleEntry[]

const ACTIONLINT_DOCS = 'https://github.com/rhysd/actionlint/blob/v1.7.12/docs/checks.md'

/**
 * The `actionlint` engine (`packages/engine-actionlint`) — GitHub Actions workflow correctness, and
 * the **first optional engine**: it declares `availability()`, wins these concepts only where the
 * binary is present, and is a reported coverage gap where it is not.
 *
 * **`tier: 0`** — a native Go binary, honestly the same tier as oxlint's Rust. Inert in practice:
 * nothing else claims a `config.workflow-*` concept, and `ENGINE_PREFERENCE` would rank actionlint
 * after `schema` anyway if anything ever did.
 *
 * **The measurement all of this rests on.** 403 workflow files from 17 actively-maintained
 * repositories at pinned default-branch HEADs (grafana, airflow, next.js, bun, oxc, biome, cpython,
 * react, astro, home-assistant, terraform, deno, vite, prometheus, svelte, knip, nest), linted with
 * actionlint 1.7.12 and `-shellcheck= -pyflakes=`. **447 findings; 32 true positives, 406 false
 * positives, 9 correct-but-inert.** That aggregate is not the number any decision here was made on —
 * it is dominated by rules this file excludes — so every entry below carries its own.
 *
 * The half that ships: **29 findings, 29 true positives, 0 false positives** across `expression`
 * (minus two excluded message classes), `events` and `if-cond`, plus eight more rules that had
 * thousands of opportunities to fire on those 403 files and fired on none.
 *
 * **Everything is `warn`, uniformly, and that is a policy rather than a per-rule judgement.** This is
 * the engine's first release; 29/29 on 403 real files earns `recommended`, and `error` is the bar the
 * `schema` engine's entries clear on 826 files with no judgement call anywhere in them. Two rules
 * here have a consequence argument for `error` that only lacks exposure —
 * `config.workflow-event` (an invalid `cron` means the workflow is accepted and then silently never
 * runs) and `security.workflow-hardcoded-credential` (a password in version control) — and both
 * should be revisited once real repositories have produced any.
 *
 * **`fixKind: 'none'` throughout.** actionlint emits no fix data in any of its output formats, and
 * none of these findings has one mechanical repair: an unknown runner label, a `matrix.` reference in
 * a job with no matrix, and a required input carrying a default are all decisions about intent.
 */
const ACTIONLINT_RULE_ENTRIES = [
  {
    engine: 'actionlint',
    // 10 findings on the corpus (4 stable, 6 not — see below), 1 true positive. Excluded from
    // `recommended`; see `MANUAL_RULE_EXCLUSIONS`, which records the nondeterminism in full.
    engineRuleId: 'action',
    concepts: ['config.workflow-action'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#action-format-in-uses`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // Zero findings on the corpus, and — unlike the eight rules below — zero *opportunities*: not one
    // of the 403 files contains a `services.<id>.credentials` block at all (3 `services:` blocks in 2
    // files, 0 with credentials). So this is in `recommended` on the strength of its shape rather than
    // on measured precision: it fires only where a `password:` under `credentials:` is a literal
    // rather than a `secrets.*` reference, which cannot be a false positive without being a real
    // secret in version control. Stated plainly so nobody reads it as measured.
    engineRuleId: 'credentials',
    concepts: ['security.workflow-hardcoded-credential'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#hardcoded-credentials`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // The other rule with zero measured exposure: no file in the corpus uses `::set-output`,
    // `::save-state`, `::set-env` or `::add-path` (24 occurrences of `::add-matcher`, which is not
    // deprecated, and none of the four that are). In `recommended` on the same structural ground as
    // `credentials` — it matches a fixed list of four names GitHub has itself deprecated, so the only
    // false positive available to it is one of those names appearing in a `run:` block that is not a
    // workflow command.
    engineRuleId: 'deprecated-commands',
    concepts: ['config.workflow-deprecated-command'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#check-deprecated-workflow-commands`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // 0 findings against 971 `env:` blocks in 275 of the 403 files.
    engineRuleId: 'env-var',
    concepts: ['config.workflow-env-var'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#environment-variable-names`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // 3 findings, 3 true positives — all the same shape, a `workflow_call` input marked `required`
    // and also given a `default` that can therefore never apply.
    //
    // The cron half of this rule is the one worth having and is the reason the corpus had to be built
    // the way it was. A previous measurement against `actions/starter-workflows` produced 60 `invalid
    // CRON format "$cron-daily"` findings out of 99 — every one a template placeholder GitHub
    // substitutes when the workflow is used, i.e. an artefact of measuring files that were never
    // meant to run, which would have argued for excluding a rule that is fine. Measured here instead
    // against files that do run: **87 of the 403 carry a `cron:` schedule, and the rule fired zero
    // times on them**. It does catch a malformed expression and a sub-five-minute interval, proved by
    // fixture. An invalid cron is high consequence and nearly invisible by eye — GitHub accepts the
    // workflow and it simply never runs.
    engineRuleId: 'events',
    concepts: ['config.workflow-event'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#webhook-events-validation`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // The engine's strongest entry, and its most heavily filtered. 114 findings on the corpus, of
    // which **91 belong to two false-positive classes the adapter drops by message pattern**
    // (`MESSAGE_EXCLUSIONS` in packages/engine-actionlint/src/rules.ts carries both measurements and
    // both reasons). What is left is **23 findings, 23 true positives, across 4 repositories**:
    // 20 references to a context property that was never declared and 3 trailing commas inside a
    // `fromJSON('[…]')` literal.
    //
    // Those 20 are the case this engine exists for. `${{ matrix.goos }}` in a job with no matrix
    // (hashicorp/terraform), `needs.check.outputs.version_changed` where the `check` job declares only
    // `version` — so a release job's `if:` is permanently false (biomejs/biome) — and
    // `github.event.inputs.releaseType` where the input is called `type`, naming an environment that
    // does not exist (vercel/next.js). Every one expands to the empty string, so the workflow runs and
    // quietly does something else. All 20 were verified by locating the enclosing job and confirming
    // the context really is empty, not sampled.
    //
    // The 3 trailing-comma findings are true positives by the JSON specification and **were not
    // verified against GitHub's own `fromJSON` at run time**; in two of the three a `||` short-circuits
    // before the call is ever evaluated, so the affected repository's green CI proves nothing either
    // way. Recorded rather than quietly counted.
    engineRuleId: 'expression',
    concepts: ['config.workflow-expression'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#contexts-and-built-in-functions`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // 0 findings against 298 `branches:`/`tags:`/`paths:` filter lists in 156 of the 403 files.
    engineRuleId: 'glob',
    concepts: ['config.workflow-glob'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#glob-filter-pattern-syntax-validation`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // 0 findings against 2,432 job ids and 619 explicit step ids.
    engineRuleId: 'id',
    concepts: ['config.workflow-id'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#job-id-and-step-id-uniqueness`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // 3 findings, 3 true positives. Two are sveltejs/svelte's
    // `if: (${{ success() }} || ${{ failure() }})` — the parentheses make it a non-empty string, so it
    // is unconditionally true and the step also runs on cancellation, which is precisely what the
    // comment above it says it is there to avoid. The third is vercel/next.js's `if: false`.
    //
    // **The `if: false` message is not surfaced as actionlint words it.** Upstream emits one message
    // for every constant and ends it "remove the if: section"; `if: false` is the standard way to
    // disable a job deliberately, so following that advice would enable it. The adapter keeps the
    // diagnosis and replaces the instruction — see `MESSAGE_REWRITES`.
    engineRuleId: 'if-cond',
    concepts: ['config.workflow-condition'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#constant-conditions-at-if`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // 0 findings against 469 `needs:` declarations across 90 of the 403 files.
    engineRuleId: 'job-needs',
    concepts: ['config.workflow-job-needs'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#job-dependencies-validation`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // 0 findings against 196 matrices, 88 of them carrying an `include:` or `exclude:`, in 30 files.
    engineRuleId: 'matrix',
    concepts: ['config.workflow-matrix'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#matrix-values`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // 0 findings against 773 `permissions:` blocks in 354 of the 403 files — the most heavily
    // exercised rule in the set and still silent.
    engineRuleId: 'permissions',
    concepts: ['config.workflow-permissions'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#permissions`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // 308 findings — 69% of everything the corpus produced — and **zero true positives**. Excluded
    // from `recommended`; the full measurement and the condition for revisiting are in
    // `MANUAL_RULE_EXCLUSIONS`.
    engineRuleId: 'runner-label',
    concepts: ['config.workflow-runner-label'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#runner-labels`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // 0 findings against 252 `shell:` keys in 64 of the 403 files.
    engineRuleId: 'shell-name',
    concepts: ['config.workflow-shell'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#shell-name-validation-at-shell`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // 9 findings, 2 true positives, 7 false — and all 7 are one failure mode. Excluded from
    // `recommended`; see `MANUAL_RULE_EXCLUSIONS`. Note what this entry does **not** claim:
    // `correctness.parse-error` and `correctness.no-duplicate-object-key` both stay with the `schema`
    // engine, and the adapter drops those two message classes outright rather than mapping them here.
    engineRuleId: 'syntax-check',
    concepts: ['config.workflow-syntax'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#unexpected-keys`,
    since: '0.1.0',
  },
  {
    engine: 'actionlint',
    // 0 findings against 165 `uses: ./.github/workflows/…` calls in 34 files.
    engineRuleId: 'workflow-call',
    concepts: ['config.workflow-call'],
    tier: 0,
    priority: 100,
    severityDefault: 'warn',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['github-workflow'],
    docsUrl: `${ACTIONLINT_DOCS}#reusable-workflows`,
    since: '0.1.0',
  },
] as const satisfies readonly RuleEntry[]

/**
 * Entries the registry generator (packages/core/scripts/generate-registry.ts) cannot produce,
 * because neither one is a real row in `oxlint --rules --format json` — merged with
 * `GENERATED_RULE_ENTRIES` into `RULE_ENTRIES` below. Kept hand-written deliberately; see each
 * entry's own comment for why it exists at all.
 */
export const MANUAL_RULE_ENTRIES = [
  {
    engine: 'oxlint',
    // Synthetic: not a real `--rules`-listed oxlint rule, but the id oxlint's own adapter assigns
    // a parse failure (see packages/engine-oxlint/src/parse.ts) so it can flow through the same
    // ownership/severity/caching pipeline as every other finding. It must never reach oxlint's own
    // `--config` (parsing isn't a rule that can be toggled, and oxlint's config parser hard-rejects
    // an unrecognised rule id) — `materializeOxlintConfig` filters it out before writing rules.
    engineRuleId: 'parse-error',
    concepts: ['correctness.parse-error'],
    tier: 0,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'astro'],
    docsUrl: 'https://oxc.rs/docs/guide/usage/linter.html',
    since: '0.1.0',
  },
  // Deliberately kept from M0: the registry's only `eslint`-engine entry, and the only entry whose
  // engine is not `oxlint` at all. It exists so `entries.test.ts` ("the shipped registry contains a
  // real overlap and resolves it to oxlint") can prove tier-based arbitration on a genuine overlap —
  // both this and the generated `oxlint/no-unused-vars` claim `dead-code.unused-variable` — without
  // depending on a second engine actually being implemented yet. A real `sgate check` never
  // instantiates the `eslint` engine (packages/cli/src/commands/check.ts registers only oxlint), so
  // `electOwners`'s `participatingEngines` filter keeps this from ever contesting a real run
  // (see `elect.ts`'s comment on that field) — it only contests arbitration in a test that names
  // `eslint` as participating on purpose.
  {
    engine: 'eslint',
    engineRuleId: '@typescript-eslint/no-unused-vars',
    concepts: ['dead-code.unused-variable'],
    tier: 2,
    priority: 50,
    severityDefault: 'warn',
    fixKind: 'suggested',
    fixTouches: ['imports', 'statements'],
    requires: [],
    languages: ['ts', 'tsx'],
    docsUrl: 'https://typescript-eslint.io/rules/no-unused-vars/',
    since: '0.1.0',
  },
  // `tsc` (packages/engine-tsc): the second engine, and the first with `granularity: 'project'`
  // (spec §8.1) rather than `'file'`. Like `oxlint/parse-error` above, this is synthetic — not a row
  // any `--rules`-style catalogue lists, because `tsc` has no such catalogue at all: it reports a few
  // hundred numbered diagnostic codes (TS2307, TS2322, ...) as free text, not a queryable, individually
  // electable rule set. One concept for the whole domain (see `types.type-error` in
  // concepts/catalogue.ts for the full defence) is what makes `'types.type-error': 'off'` able to
  // disable typechecking wholesale without inventing group-wildcard config syntax nothing else needs.
  //
  // `tier: 1` ("native with type information"): `tsc` is the authoritative source of TypeScript's own
  // type information, the same tier tsgolint's type-aware rules occupy — not `0`, which the registry
  // reserves for oxc/Rust-native syntax-only rules, and not `2` (JS/WASM engines), even though today's
  // resolved `tsc` happens to be JS-implemented pre-TS-7 (see the ecosystem table, §3): tier expresses
  // what the engine *is*, not which binary a given repository's `typescript` version happens to ship.
  // Inert in practice either way — no other engine will ever contest `types.type-error`.
  //
  // `provides: []`, deliberately, not `['types']`: `provides`/`requires` (registry/types.ts) is a
  // *global* capability pool arbitration checks before electing any rule that declares
  // `requires: ['types']` — e.g. a future tsgolint-owned `types.floating-promise` entry. `tsc` shelling
  // out and parsing text does not make TypeScript's resolved type graph available to *other* engines'
  // rules; tsgolint gets its own type information from its own separate wiring (see the M0 follow-ups'
  // "Blocks M2" entry on the type-aware capability probe that still needs to land there). Declaring
  // `provides: ['types']` here would let arbitration elect a type-aware rule the moment `tsc` is merely
  // *registered*, regardless of whether that rule's own engine can actually run it yet — reintroducing
  // the exact `EngineError: the materialised config is not selecting exactly the elected ruleset`
  // failure mode the same follow-up entry describes, just triggered by this change instead.
  {
    engine: 'tsc',
    engineRuleId: 'type-error',
    concepts: ['types.type-error'],
    tier: 1,
    priority: 100,
    severityDefault: 'error',
    fixKind: 'none',
    fixTouches: [],
    requires: [],
    languages: ['ts', 'tsx'],
    docsUrl: 'https://www.typescriptlang.org/docs/',
    since: '0.1.0',
  },
  ...KNIP_RULE_ENTRIES,
  ...ASTGREP_RULE_ENTRIES,
  ...SCHEMA_RULE_ENTRIES,
  ...ACTIONLINT_RULE_ENTRIES,
] as const satisfies readonly RuleEntry[]
