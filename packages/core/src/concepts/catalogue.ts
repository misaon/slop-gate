import { GENERATED_CONCEPTS } from './concepts.generated.ts'

export const CONCEPT_GROUPS = [
  'correctness',
  'types',
  'dead-code',
  'formatting',
  'style',
  'complexity',
  'duplication',
  'security',
  'perf',
  'a11y',
  'framework',
  'config',
  'deps',
  'slop',
  // The four groups below are not curated concept vocabulary — they are oxlint's own remaining
  // rule categories (correctness, style and perf above already coincide with oxlint's names; these
  // four have no better engine-independent home yet). The registry generator's mechanical default
  // (packages/core/scripts/generate-registry.ts) is `concept = <oxlint category>.<kebab value>`,
  // and a concept's `group` must equal its id's first segment (concepts/validate.ts), so every
  // category oxlint can report has to be a valid group here or generation fails outright the first
  // time it meets a rule in one of these categories. Deliberately *not* collapsed onto an existing
  // group (e.g. `suspicious` into `correctness`): that would be a real taxonomy decision, and the
  // override table (registry/overrides.ts) is where those get made one rule at a time, not baked
  // into the mechanical fallback for rules nobody has looked at yet.
  'pedantic',
  'restriction',
  'suspicious',
  'nursery',
] as const

export type ConceptGroup = (typeof CONCEPT_GROUPS)[number]

export type ConceptDefinition = {
  readonly id: string
  readonly group: ConceptGroup
  readonly title: string
  readonly description: string
  readonly deprecated?: { readonly since: string; readonly replacedBy?: string }
  /**
   * True for a concept the orchestrator emits itself (packages/core/src/run/check.ts) rather than
   * any engine rule — e.g. `config.rule-overlap`. No `RuleEntry` will ever claim one of these, so
   * election must not count that against the repository's coverage.
   */
  readonly servicedBySlopGate?: boolean
}

// Hand-authored concept vocabulary: M0's original catalogue plus every deliberate rename the
// registry generator's override table (registry/overrides.ts) redirects a mechanical concept onto.
// `CONCEPTS` below merges this with `GENERATED_CONCEPTS` — the concepts the generator invents for
// everything the override table did *not* redirect — so this array is deliberately incomplete on
// its own; see the comment on the merged `CONCEPTS` export just below the closing bracket.
//
// Exported (not module-private) specifically so `scripts/generate-registry.ts` can import *this*
// array, not the merged `CONCEPTS`, when it decides which concepts are genuinely new. Reading the
// merged export there would be circular: after the first run, `GENERATED_CONCEPTS` (produced by
// that run) is already part of `CONCEPTS`, so every concept the generator ever produced would look
// "already known" on every subsequent run and `concepts.generated.ts` would regenerate empty —
// exactly the bug this comment is here so nobody reintroduces.
export const HAND_WRITTEN_CONCEPTS = [
  {
    id: 'correctness.no-debugger',
    group: 'correctness',
    title: 'Debugger statement',
    description: 'A `debugger` statement halts execution wherever it is reached.',
  },
  {
    id: 'correctness.no-duplicate-object-key',
    group: 'correctness',
    title: 'Duplicate object key',
    description: 'A repeated key silently discards the earlier value.',
  },
  {
    id: 'correctness.no-constant-condition',
    group: 'correctness',
    title: 'Constant condition',
    description: 'A condition that cannot vary makes one branch unreachable.',
  },
  {
    id: 'correctness.parse-error',
    group: 'correctness',
    title: 'Parse error',
    description:
      'The file has a syntax error and could not be parsed, so no engine could analyse it at all. ' +
      'Unlike every other concept, this has no owning rule: any engine capable of parsing the ' +
      "language may report it, attributed via a synthetic per-engine rule id (oxlint's is `parse-error`).",
  },
  // The 35 entries below and the one under `security` (further down) are M0's curated stopgap
  // expansion of the registry (packages/core/src/registry/entries.ts) — 39 hand-picked rules from
  // oxlint's `correctness` and `suspicious` categories, chosen over the hundreds available in
  // `style` and `restriction` specifically because those collide with a project's own Prettier/
  // ESLint choices and teach users to ignore the gate. Generating the registry from engine
  // introspection instead of hand-authoring it is M1 work.
  {
    id: 'correctness.invalid-super-call',
    group: 'correctness',
    title: 'Invalid super() call',
    description:
      'A derived class constructor does not call `super()`, or a base class constructor calls a ' +
      '`super()` that does not exist — both throw at runtime.',
  },
  {
    id: 'correctness.invalid-loop-direction',
    group: 'correctness',
    title: 'Loop counter moves the wrong way',
    description:
      "A `for` loop's update expression moves the counter away from its stop condition, so the " +
      'loop runs forever or not as intended.',
  },
  {
    id: 'correctness.getter-missing-return',
    group: 'correctness',
    title: 'Getter missing a return',
    description: 'A `get` accessor does not return a value on every code path.',
  },
  {
    id: 'correctness.async-promise-executor',
    group: 'correctness',
    title: 'Async Promise executor',
    description:
      'An `async` function passed to `new Promise()` silently swallows any error it throws instead ' +
      'of rejecting the promise.',
  },
  {
    id: 'correctness.class-reassigned',
    group: 'correctness',
    title: 'Class binding reassigned',
    description: "A class declaration's binding is reassigned, detaching later references from the original class.",
  },
  {
    id: 'correctness.compare-negative-zero',
    group: 'correctness',
    title: 'Comparison against -0',
    description: 'A comparison against `-0` is misleading: `-0 === 0` is `true`, so the comparison cannot distinguish them.',
  },
  {
    id: 'correctness.assignment-in-condition',
    group: 'correctness',
    title: 'Assignment in a condition',
    description: 'An assignment (`=`) appears inside a condition where a comparison (`==`/`===`) was likely intended.',
  },
  {
    id: 'correctness.const-reassigned',
    group: 'correctness',
    title: 'const binding reassigned',
    description: 'A `const` binding is reassigned, which throws at runtime.',
  },
  {
    id: 'correctness.constant-binary-expression',
    group: 'correctness',
    title: "Binary expression can't vary",
    description:
      'One side of a comparison or logical expression makes the result constant regardless of the ' +
      'other side, so a branch depending on it is dead.',
  },
  {
    id: 'correctness.duplicate-class-member',
    group: 'correctness',
    title: 'Duplicate class member',
    description:
      'A class declares the same member name twice; only the last declaration survives, silently ' +
      'discarding the earlier one.',
  },
  {
    id: 'correctness.duplicate-else-if-condition',
    group: 'correctness',
    title: 'Duplicate else-if condition',
    description: 'An `else if` branch repeats a condition already tested earlier in the same chain, so it can never run.',
  },
  {
    id: 'correctness.duplicate-switch-case',
    group: 'correctness',
    title: 'Duplicate switch case',
    description: 'A `switch` statement tests the same case value twice; the second one can never run.',
  },
  {
    id: 'correctness.empty-destructuring-pattern',
    group: 'correctness',
    title: 'Empty destructuring pattern',
    description: 'A destructuring pattern matches nothing and binds no variables — usually a leftover or a typo.',
  },
  {
    id: 'correctness.caught-error-reassigned',
    group: 'correctness',
    title: 'Caught error reassigned',
    description: "A `catch` clause's exception parameter is reassigned, discarding the original error object.",
  },
  {
    id: 'correctness.function-reassigned',
    group: 'correctness',
    title: 'Function binding reassigned',
    description: "A function declaration's binding is reassigned, detaching later references from the original function.",
  },
  {
    id: 'correctness.global-reassigned',
    group: 'correctness',
    title: 'Read-only global reassigned',
    description: 'A read-only global such as `undefined`, `NaN` or `Infinity` is reassigned.',
  },
  {
    id: 'correctness.import-binding-reassigned',
    group: 'correctness',
    title: 'Imported binding reassigned',
    description: 'An imported binding is reassigned; ES module imports are read-only bindings and this throws at runtime.',
  },
  {
    id: 'correctness.invalid-regexp',
    group: 'correctness',
    title: 'Invalid regular expression',
    description: 'A string passed to the `RegExp` constructor is not a valid pattern and throws at runtime.',
  },
  {
    id: 'correctness.numeric-literal-loses-precision',
    group: 'correctness',
    title: 'Numeric literal loses precision',
    description: 'A numeric literal has more digits than a JavaScript number can represent and silently loses precision.',
  },
  {
    id: 'correctness.invalid-native-constructor-call',
    group: 'correctness',
    title: 'new on a non-constructor built-in',
    description:
      'A built-in that is not a constructor, such as `Symbol` or `BigInt`, is called with `new`, ' +
      'which throws at runtime.',
  },
  {
    id: 'correctness.namespace-object-called',
    group: 'correctness',
    title: 'Namespace object called as a function',
    description: 'A built-in namespace object such as `Math`, `JSON` or `Reflect` is called as a function; none of them are callable.',
  },
  {
    id: 'correctness.self-assignment',
    group: 'correctness',
    title: 'Self-assignment',
    description: 'A variable or property is assigned to itself, which has no effect and usually indicates a typo.',
  },
  {
    id: 'correctness.setter-returns-value',
    group: 'correctness',
    title: 'Setter returns a value',
    description: "A `set` accessor returns a value, but a setter's return value is always discarded by the language.",
  },
  {
    id: 'correctness.shadows-reserved-global',
    group: 'correctness',
    title: 'Shadows a reserved global',
    description:
      'A declaration reuses the name of a reserved global such as `undefined`, `NaN` or `eval`, ' +
      'which is almost never intentional.',
  },
  {
    id: 'correctness.sparse-array-literal',
    group: 'correctness',
    title: 'Sparse array literal',
    description:
      'An array literal contains a gap between commas, such as `[1, , 3]`, which is usually a typo ' +
      'rather than an intentional hole.',
  },
  {
    id: 'correctness.this-before-super',
    group: 'correctness',
    title: 'this used before super()',
    description: 'A derived class constructor uses `this`, or returns, before calling `super()`, which throws at runtime.',
  },
  {
    id: 'correctness.unreachable-code',
    group: 'correctness',
    title: 'Unreachable code',
    description: 'Code follows a `return`, `throw`, `break` or `continue` and can never execute.',
  },
  {
    id: 'correctness.unsafe-finally-control-flow',
    group: 'correctness',
    title: 'Control flow inside finally',
    description:
      'A `finally` block contains `return`, `throw`, `break` or `continue`, which silently ' +
      'overrides whatever the `try` or `catch` block was doing.',
  },
  {
    id: 'correctness.unsafe-negation',
    group: 'correctness',
    title: 'Negation binds to the wrong operand',
    description:
      'A negation (`!`) sits next to a relational, `in` or `instanceof` operator without ' +
      'parentheses, so it binds to the wrong operand — for example `!key in obj`.',
  },
  {
    id: 'correctness.unsafe-optional-chaining',
    group: 'correctness',
    title: 'Unguarded optional chaining result',
    description:
      'The possibly-`undefined` result of an optional chain is used where a non-nullable value is ' +
      'required, with no guard in between.',
  },
  {
    id: 'correctness.generator-never-yields',
    group: 'correctness',
    title: 'Generator never yields',
    description:
      'A function is declared as a generator (`function*`) but its body never reaches a `yield`, ' +
      'usually a missing `yield` or an unnecessary `*`.',
  },
  {
    id: 'correctness.nan-comparison',
    group: 'correctness',
    title: 'Comparison against NaN',
    description:
      'A comparison against `NaN` using `==`/`===` is always `false`, because `NaN` is never equal ' +
      'to anything, including itself — `Number.isNaN` is required instead.',
  },
  {
    id: 'correctness.invalid-typeof-comparison',
    group: 'correctness',
    title: 'Invalid typeof comparison',
    description: 'A `typeof` expression is compared to a string that is not one of its possible results, or to a non-string.',
  },
  {
    id: 'correctness.ambiguous-line-break',
    group: 'correctness',
    title: 'Ambiguous line break',
    description:
      'A line break between two statements is ambiguous: automatic semicolon insertion does not ' +
      'split them the way the formatting suggests, so they parse as one statement.',
  },
  {
    id: 'correctness.unmodified-loop-condition',
    group: 'correctness',
    title: 'Loop condition never changes',
    description: "A `while` or `for` loop's condition references a variable that nothing inside the loop body ever modifies.",
  },
  {
    id: 'correctness.native-prototype-extended',
    group: 'correctness',
    title: 'Native prototype extended',
    description:
      'A built-in prototype such as `Array.prototype` or `Object.prototype` is modified directly, ' +
      'which can silently change behaviour everywhere in the program, including inside dependencies.',
  },
  {
    id: 'correctness.discarded-caught-error',
    group: 'correctness',
    title: 'Caught error discarded',
    description:
      'A `catch` block throws a new error without linking the original one (for example via ' +
      '`{ cause }`), discarding the information needed to debug what actually failed.',
  },
  // Added after the M0 batch above, in the five-fixes follow-up session: real-world use on a
  // NestJS project surfaced this as a genuine finding (see registry/entries.ts and
  // docs/superpowers/specs/2026-07-31-m0-followups.md). Named for what oxlint's `no-shadow`
  // detects, engine-independently, rather than for the rule's own id.
  {
    id: 'correctness.shadows-outer-binding',
    group: 'correctness',
    title: 'Shadows an outer-scope binding',
    description:
      'A declaration reuses the name of a variable, parameter, function or class already bound in ' +
      'an enclosing scope, hiding the outer binding for the rest of the inner scope and inviting ' +
      'the wrong one to be read from or written to.',
  },
  {
    id: 'types.type-error',
    group: 'types',
    title: 'Type error',
    description:
      "A type error reported by the TypeScript compiler (`tsc`) against the project's own " +
      "tsconfig — the same error the developer's editor and existing build already report. One " +
      'concept covers every `tsc` diagnostic code deliberately: `tsc` has no `--rules`-style catalogue ' +
      'to introspect (unlike oxlint), and setting this one concept to `off` is what lets a user disable ' +
      'typechecking wholesale. Type-aware lint concepts such as `types.floating-promise` are a ' +
      'different domain owned by tsgolint (spec §13.1): those have discrete, separately-electable ' +
      'rules, unlike a raw compiler diagnostic.',
  },
  {
    id: 'dead-code.unused-import',
    group: 'dead-code',
    title: 'Unused import',
    description: 'An imported binding that is never referenced.',
  },
  {
    id: 'dead-code.unused-variable',
    group: 'dead-code',
    title: 'Unused variable',
    description: 'A declared binding that is never read.',
  },
  {
    id: 'dead-code.no-op-expression',
    group: 'dead-code',
    title: 'Expression statement with no effect',
    description:
      'An expression statement produces a value or has no side effect that is ever used — usually a ' +
      'typo for a call, assignment or comparison.',
  },
  // The knip domain (spec §13.2). Every concept below is *whole-program*: none of them can be decided
  // by looking at one file, which is what separates them from `dead-code.unused-import` and
  // `dead-code.unused-variable` above — those are scope-local and oxlint owns them. The corollary
  // matters when reading a finding: each of these is only as good as the reachability graph knip built,
  // and that graph is exactly what a repository with an undeclared workspace layout, a runtime-loaded
  // convention directory or a framework-injected entry point can invalidate. See the measured
  // false-positive rates recorded on each entry in registry/entries.manual.ts.
  {
    id: 'dead-code.unused-file',
    group: 'dead-code',
    title: 'Unused file',
    description:
      'A file that no entry point reaches, transitively — dead weight that still has to be read, ' +
      'reviewed and kept compiling. The most entry-point-sensitive concept in the catalogue: a file ' +
      'discovered at runtime rather than imported (an ORM migration, a convention-loaded theme, a ' +
      'script named only in `package.json`) is unreachable by static analysis and perfectly alive in ' +
      'practice, so a finding here is a question, not a verdict.',
  },
  {
    id: 'dead-code.unused-export',
    group: 'dead-code',
    title: 'Unused export',
    description:
      'An exported binding nothing outside its own module imports. Distinct from ' +
      '`dead-code.unused-variable`, which is decidable within one file: this one needs the whole ' +
      'import graph, and is therefore only meaningful once every entry point is known.',
  },
  {
    id: 'dead-code.unused-exported-type',
    group: 'dead-code',
    title: 'Unused exported type',
    description:
      'An exported type, interface or type alias nothing outside its own module imports. Separate ' +
      'from `dead-code.unused-export` because the answer is routinely different: a type exported for ' +
      "a consumer's benefit is a deliberate part of a package's public surface far more often than an " +
      'exported value is.',
  },
  {
    id: 'dead-code.unused-enum-member',
    group: 'dead-code',
    title: 'Unused exported enum member',
    description:
      'A member of an exported enum that nothing references. Frequently deliberate — an enum mirroring ' +
      'an external protocol or database column is expected to carry members this codebase never ' +
      'constructs — so it is reported for review rather than treated as a defect.',
  },
  {
    id: 'dead-code.duplicate-export',
    group: 'dead-code',
    title: 'Duplicate export',
    description:
      'The same binding exported under more than one name from the same module — typically a value ' +
      'exported both by name and as the default. Both spellings stay reachable forever, and consumers ' +
      'split across them.',
  },
  {
    id: 'deps.unused-dependency',
    group: 'deps',
    title: 'Unused dependency',
    description:
      'A package declared in `dependencies` that nothing imports. Reachability-derived, so it inherits ' +
      "every caveat `dead-code.unused-file` carries plus one of its own: a dependency named only in a " +
      'config file, loaded by a plugin system, or resolved dynamically is used without ever being ' +
      'imported.',
  },
  {
    id: 'deps.unused-dev-dependency',
    group: 'deps',
    title: 'Unused devDependency',
    description:
      'A package declared in `devDependencies` that nothing imports and no script invokes. The ' +
      'canonical case is a tool removed from the repository whose plugin packages were left behind.',
  },
  {
    id: 'deps.unlisted-dependency',
    group: 'deps',
    title: 'Unlisted dependency',
    description:
      'A package that is imported but appears in no manifest — it works today only because something ' +
      "else happens to hoist it into `node_modules`, and stops working the moment that other package's " +
      'own dependencies change. Note the mirror-image false positive: a package legitimately re-exported ' +
      'by a framework meta-package (Express through a Nest platform adapter, say) reads as unlisted too.',
  },
  {
    id: 'deps.unlisted-binary',
    group: 'deps',
    title: 'Unlisted binary',
    description:
      'A command invoked from a `package.json` script that no declared dependency provides. Either the ' +
      'dependency is missing, or the script silently depends on something being installed globally.',
  },
  {
    id: 'deps.unresolved-import',
    group: 'deps',
    title: 'Unresolved import',
    description:
      'An import specifier that resolves to nothing at all — neither a file nor an installed package. ' +
      'Unlike the rest of this group this is not a hygiene question: the module cannot load, so the ' +
      'code cannot run. The static-analysis half of `slop.hallucinated-import` (spec §14).',
  },
  {
    id: 'style.no-var',
    group: 'style',
    title: 'Use of var',
    description: '`var` is function-scoped and hoisted; prefer `const` or `let`.',
  },
  {
    id: 'security.eval-usage',
    group: 'security',
    title: 'Use of eval',
    description: '`eval` executes arbitrary text as code, the most direct code-injection vector in JavaScript.',
  },
  {
    id: 'slop.as-any-cast',
    group: 'slop',
    title: 'Explicit any',
    description:
      'An explicit `any` — whether an annotation or an `as any` cast — opts out of the type system. ' +
      'M0 detects it syntactically; the narrower `as unknown as T` pattern needs type information and arrives with the type-aware engine in M2.',
  },
  {
    id: 'config.unused-suppression',
    group: 'config',
    title: 'Unused suppression',
    description: 'A suppression comment that matches no diagnostic, left behind after a fix.',
    servicedBySlopGate: true,
  },
  {
    id: 'config.suppression-missing-reason',
    group: 'config',
    title: 'Suppression missing a reason',
    description:
      'An inline `sgate-disable-*` comment has no `-- reason`. It still suppresses the finding — ' +
      'hiding something a user explicitly silenced, as punishment for comment formatting, is worse ' +
      'than the formatting problem — but a reason is required so a future reader knows why.',
    servicedBySlopGate: true,
  },
  {
    id: 'config.rule-overlap',
    group: 'config',
    title: 'Overlapping rules',
    description: 'Two enabled rules detect the same concept; one was suppressed by arbitration.',
    servicedBySlopGate: true,
  },
  {
    id: 'config.dead-override',
    group: 'config',
    title: 'Dead override',
    description: 'An override targeting a rule or concept that no enabled engine covers.',
    servicedBySlopGate: true,
  },
] as const satisfies readonly ConceptDefinition[]

/**
 * The full concept vocabulary: `HAND_WRITTEN_CONCEPTS` above plus `GENERATED_CONCEPTS`
 * (concepts/concepts.generated.ts) — every mechanically-named concept the registry generator
 * invented for a rule the override table did not redirect onto one of the hand-written ids above.
 * Both halves are `as const satisfies readonly ConceptDefinition[]` before this spread, which is
 * what keeps `ConceptId` below a closed union of every concept's literal id rather than widening to
 * plain `string` the moment a generated id joins the array.
 */
export const CONCEPTS = [...HAND_WRITTEN_CONCEPTS, ...GENERATED_CONCEPTS] as const satisfies readonly ConceptDefinition[]

export type ConceptId = (typeof CONCEPTS)[number]['id']

const byId = new Map<string, ConceptDefinition>(CONCEPTS.map((c) => [c.id, c]))

export function isConceptId(value: string): value is ConceptId {
  return byId.has(value)
}

export function conceptById(id: ConceptId): ConceptDefinition {
  const found = byId.get(id)
  if (!found) throw new Error(`unknown concept: ${id}`)
  return found
}

// `CONCEPTS` is deliberately `as const satisfies readonly ConceptDefinition[]` so each concept
// keeps its narrow literal type (see `RULE_ENTRIES` for the same pattern). A concept that omits
// `servicedBySlopGate` doesn't structurally have that key at all, so reading it needs the widened
// `ConceptDefinition` view rather than `CONCEPTS` directly.
const WIDENED_CONCEPTS: readonly ConceptDefinition[] = CONCEPTS

/** Concepts the orchestrator services itself — see `ConceptDefinition.servicedBySlopGate`. */
export const SLOP_GATE_SERVICED_CONCEPTS: ReadonlySet<string> = new Set(
  WIDENED_CONCEPTS.filter((c) => c.servicedBySlopGate).map((c) => c.id),
)
