import { GENERATED_CONCEPTS } from './concepts.generated.ts'
import { CURATED_CONCEPTS } from './curated.ts'

export { CURATED_CONCEPTS }

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
  readonly servicedBySlopGate?: boolean
}

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
    id: 'formatting.unformatted',
    group: 'formatting',
    title: 'File is not formatted',
    description:
      'The file differs from what the formatter would produce. One concept covers every kind of difference ' +
      'deliberately, for the reason `types.type-error` covers every tsc code: there is nothing to introspect ' +
      'and nothing a user would want to enable a part of, so setting this to `off` is what keeps a project on ' +
      "its own formatter. Reported against the file rather than a line — reformatting rewrites the file, so " +
      'there is no position at which it went wrong. Delegated to oxfmt entirely (spec 1.2); slop-gate has no ' +
      'formatter of its own and will not grow one.',
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
    id: 'deps.missing-lockfile-entry',
    group: 'deps',
    title: 'Dependency missing from the lockfile',
    description:
      'A package named in a manifest that the lockfile resolved to nothing. It has two causes and, ' +
      'read from the repository alone, they are indistinguishable: the package may not exist on the ' +
      'registry — the hallucinated-dependency case — or the lockfile may simply predate the edit that ' +
      'added it. The reach is narrower than it sounds, because `npm install` and `pnpm install` both ' +
      'fail outright on an unresolvable entry in `dependencies`; `optionalDependencies` is the group ' +
      'where both exit 0 and say nothing. A platform-specific optional dependency does not trip this: ' +
      'both package managers write those into the lockfile with their `os`/`cpu` constraints intact.',
  },
  {
    id: 'deps.advisory-coverage-gap',
    group: 'deps',
    title: 'Dependency security check was incomplete',
    description:
      'The dependency security engine ran but did not cover everything: the advisory snapshot is old ' +
      'enough to be missing findings, or the repository is locked with a package manager whose ' +
      'lockfile format it cannot read. It is not a defect in the dependencies — it is the check ' +
      'declining to imply it looked. Reported as a diagnostic rather than logged so it reaches every ' +
      'reporter, and escalating in wording as a snapshot ages rather than reading the same at three ' +
      'days and three months.',
  },
  {
    id: 'security.vulnerable-dependency',
    group: 'security',
    title: 'Dependency with a known vulnerability',
    description:
      'An installed package version that a published advisory names as affected. Matched offline ' +
      "against a local snapshot of OSV's npm export, which reproduced `npm audit` exactly across six " +
      'real lockfiles. Note what it does not establish: whether the vulnerable code is reachable from ' +
      'this repository. A moderate-severity issue in a transitive devDependency is a fact about the ' +
      'tree, not a judgement that it matters here — which is why the advisory\'s own severity is ' +
      'carried in the message rather than raising the level of the finding.',
  },
  {
    id: 'security.malicious-dependency',
    group: 'security',
    title: 'Dependency recorded as malicious',
    description:
      'An installed package version that appears in the OpenSSF malicious-packages feed — a ' +
      'credential stealer, a typosquat, or a compromised release of an otherwise legitimate package. ' +
      'Version-exact: the September 2025 compromise of `chalk`, `debug` and `ansi-styles` is recorded ' +
      'against the single published release that carried the payload, and the neighbouring versions ' +
      'are unaffected. Fires on almost nothing almost always, which is what malware detection looks ' +
      'like on a clean machine.',
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
      'Owned by oxlint (`typescript/no-explicit-any`), which covers all four spellings natively: ' +
      '`x as any`, `const x: any`, `function f(p: any)` and `<any>x`. The `as unknown as T` form ' +
      'spec §14 groups under this name is a different defect and has its own concept — see ' +
      '`slop.double-cast`.',
  },
  {
    id: 'slop.double-cast',
    group: 'slop',
    title: 'Cast laundered through unknown',
    description:
      'A type assertion routed through `unknown` or `any` to reach a type the compiler rejected as a ' +
      'direct cast (`x as unknown as T`). The direct form is refused precisely because the two types ' +
      'have nothing in common; going the long way round does not make the claim true, it only stops ' +
      'anyone checking it. Distinct from `slop.as-any-cast`: that one opts out of typing a value, ' +
      'this one asserts a specific type the evidence contradicts, and oxlint reports nothing for it ' +
      'because no `any` appears in the source at all.',
  },
  {
    id: 'slop.swallowed-error',
    group: 'slop',
    title: 'Swallowed error',
    description:
      'A `catch` block that discards the error and continues, so a failed operation is indistinguishable ' +
      'from a successful one to everything downstream. The counter-case is real and common — a feature ' +
      'probe, an optional read, a best-effort cleanup — which is why this is reported for review rather ' +
      'than treated as a defect, and why saying so in a suppression reason is the intended response ' +
      'when ignoring the error is the point.',
  },
  {
    id: 'slop.stub-implementation',
    group: 'slop',
    title: 'Stub implementation',
    description:
      'An exported function whose entire body throws "not implemented". It is reachable, callable and ' +
      'type-checks, so nothing but running it reveals that the feature does not exist — the failure ' +
      'mode that separates a stub from an honestly missing function, which would not compile at its ' +
      'call sites. TypeScript already has two ways to say "subclasses must supply this" (`abstract`, ' +
      'and a declared-only overload) that keep the compiler involved.',
  },
  {
    id: 'slop.narrative-comment',
    group: 'slop',
    title: 'Narrative comment',
    description:
      'A comment describing a hypothetical other version of the code — "in a real implementation…", ' +
      '"this is a placeholder", "your code would go here" — rather than explaining the code that is ' +
      'actually there. It marks work that was described instead of done, and it survives long after ' +
      'the surrounding code is finished, which is what makes it worse than no comment. A comment ' +
      'that explains *why* a decision was made is the opposite of this and is deliberately not detected.',
  },
  {
    id: 'slop.emoji-in-code',
    group: 'slop',
    title: 'Emoji in a string literal',
    description:
      'An emoji inside a string or template literal. Decorative status glyphs leak into log ' +
      'aggregators, CI transcripts, code review diffs and terminals with no font for them, where they ' +
      'become replacement characters or mojibake. Deliberate product output — a CLI severity marker, a ' +
      'UI label — is the routine legitimate case and reads identically to the accidental one, so this ' +
      'concept is opt-in rather than part of any preset. Identifiers are not checked because ' +
      'JavaScript identifiers cannot contain emoji: they are excluded from `ID_Start`/`ID_Continue`, ' +
      'so the only place one can appear in JS or TS is a string.',
  },
  {
    id: 'config.compose-schema',
    group: 'config',
    title: 'Compose file violates the specification',
    description:
      'A Docker Compose file does not match the published Compose specification: a misspelled key, a ' +
      'value of the wrong shape, or an enum outside its allowed set. A misspelled key is the case ' +
      'worth having — Compose ignores what it does not recognise, so `prots:` is not an error at ' +
      'deploy time, it is a port that never gets published. Note that the specification leaves many ' +
      'values unconstrained — `restart` is typed as a bare string, so `restart: sometimes` passes — ' +
      'so a clean result means the file matches the schema, not that every value in it is valid.',
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
    description: 'Two enabled rules detect the same concept; one lost arbitration.',
    servicedBySlopGate: true,
  },
  {
    id: 'config.dead-override',
    group: 'config',
    title: 'Dead override',
    description: 'An override targeting a rule or concept that no enabled engine covers.',
    servicedBySlopGate: true,
  },
  {
    id: 'config.fix-oscillation',
    group: 'config',
    title: 'Fixes fighting each other',
    description:
      'Two or more rules rewrite the same code back and forth, so `sgate fix` returned a file to a ' +
      'state it had already been in. Fixing that file stops there and the rules involved are named, ' +
      'because the alternative — iterating until the pass limit — leaves the file in whichever of the ' +
      'two states the loop happened to stop on. Reported only by `sgate fix`; `sgate check` applies ' +
      'nothing and so can never observe it.',
    servicedBySlopGate: true,
  },
  {
    id: 'config.workflow-action',
    group: 'config',
    title: 'Workflow action call is wrong',
    description:
      'A `uses:` step passes an input the action does not declare, omits a required one, or points at ' +
      'action metadata that does not match the schema. Checked against actionlint\'s built-in dataset ' +
      'of popular actions and against local `action.yml` files in the repository.',
  },
  {
    id: 'config.workflow-call',
    group: 'config',
    title: 'Reusable workflow call is wrong',
    description:
      'A job calling a reusable workflow passes an input or secret the called workflow does not ' +
      'declare, or omits a required one. The call fails at run time, not at edit time.',
  },
  {
    id: 'config.workflow-condition',
    group: 'config',
    title: 'Workflow condition never varies',
    description:
      'An `if:` that cannot do what it looks like it does. The case worth having is text around the ' +
      'placeholder — `if: (${{ success() }} || ${{ failure() }})` is evaluated as a non-empty string ' +
      'and is therefore always true, so the step also runs when the job was cancelled.',
  },
  {
    id: 'config.workflow-deprecated-command',
    group: 'config',
    title: 'Deprecated workflow command',
    description:
      'A `run:` block uses a workflow command GitHub has deprecated (`::set-output`, `::save-state`, ' +
      '`::set-env`, `::add-path`). They still work today and are scheduled not to.',
  },
  {
    id: 'config.workflow-env-var',
    group: 'config',
    title: 'Invalid environment variable name',
    description: 'An `env:` key contains `&`, `=` or a space, so the variable cannot be set.',
  },
  {
    id: 'config.workflow-event',
    group: 'config',
    title: 'Workflow trigger is wrong',
    description:
      'An `on:` trigger that does not do what it says: an unknown webhook event name, a `cron:` ' +
      'expression that is malformed or fires more often than GitHub\'s five-minute floor, or a ' +
      '`workflow_call` input that is both required and given a default. An invalid cron is the one to ' +
      'care about — the workflow is accepted and then silently never runs.',
  },
  {
    id: 'config.workflow-expression',
    group: 'config',
    title: 'Workflow expression is wrong',
    description:
      'A `${{ }}` expression that does not typecheck: a property of a context that was never declared, ' +
      'a function called with the wrong number of arguments, malformed syntax, or invalid JSON handed ' +
      'to `fromJSON`. `${{ matrix.os }}` in a job with no matrix and ' +
      '`needs.build.outputs.whatever` where `build` declares no such output both expand to the empty ' +
      'string, so the workflow runs and quietly does the wrong thing.',
  },
  {
    id: 'config.workflow-glob',
    group: 'config',
    title: 'Invalid filter pattern',
    description:
      'A `branches:`, `tags:` or `paths:` filter is not a valid pattern, so it matches nothing and the ' +
      'workflow never triggers on what it was meant to.',
  },
  {
    id: 'config.workflow-id',
    group: 'config',
    title: 'Invalid or duplicated identifier',
    description:
      'A job or step id that GitHub will reject, or a step id used twice in one job — ids are ' +
      'case-insensitive there, so two that differ only in case collide.',
  },
  {
    id: 'config.workflow-job-needs',
    group: 'config',
    title: 'Broken job dependency',
    description: 'A `needs:` naming a job that does not exist, or a cycle between jobs.',
  },
  {
    id: 'config.workflow-matrix',
    group: 'config',
    title: 'Matrix configuration is wrong',
    description:
      'An `exclude:` entry that matches no generated combination, or an `include:`/`exclude:` value ' +
      'outside the matrix it modifies. An exclusion that matches nothing silently runs the job it was ' +
      'written to skip.',
  },
  {
    id: 'config.workflow-permissions',
    group: 'config',
    title: 'Invalid permissions',
    description:
      'A `permissions:` scope or value GitHub does not define. A misspelled value does not fail the ' +
      'workflow — the token is issued with different rights than intended.',
  },
  {
    id: 'config.workflow-runner-label',
    group: 'config',
    title: 'Unknown runner label',
    description:
      'A `runs-on:` label that is neither a GitHub-hosted runner nor declared as self-hosted. Note ' +
      'that actionlint\'s list of GitHub-hosted labels ships with the binary, so a runner GitHub has ' +
      'added more recently than the installed actionlint reads as unknown.',
  },
  {
    id: 'config.workflow-shell',
    group: 'config',
    title: 'Invalid shell name',
    description: 'A `shell:` value outside the set the runner supports.',
  },
  {
    id: 'config.workflow-syntax',
    group: 'config',
    title: 'Workflow does not match the schema',
    description:
      'A key GitHub does not define at this position, a required key missing, or a value of the wrong ' +
      'shape. Deliberately **not** YAML parse errors or duplicate keys, which stay with the `schema` ' +
      'engine as `correctness.parse-error` and `correctness.no-duplicate-object-key`. The schema this ' +
      'is checked against ships with the installed actionlint, so syntax GitHub has added more ' +
      'recently reads as an unexpected key.',
  },
  {
    id: 'security.workflow-hardcoded-credential',
    group: 'security',
    title: 'Credential written into a workflow',
    description:
      'A `services.<id>.credentials.password` given a literal instead of a `secrets.*` reference, so ' +
      'the password is in version control and in every fork of the repository.',
  },
  {
    id: 'correctness.css-unknown-property',
    group: 'correctness',
    title: 'Unknown CSS property',
    description:
      'A property name no browser implements, so the declaration is dropped at parse time and the ' +
      'style silently never applies. The measured case is a typo in a vendor prefix — VS Code ships ' +
      '`-mox-box-sizing` in two files — which is invisible precisely because the correct spelling ' +
      'usually sits on the next line and masks it.',
  },
  {
    id: 'correctness.css-unknown-type-selector',
    group: 'correctness',
    title: 'Unknown element in a selector',
    description:
      'A type selector naming an element that does not exist, so the rule matches nothing. Usually a ' +
      'missing `.` or `#`: pdf.js writes `.annotationEditorLayer freeTextEditor` where every other ' +
      'reference in the same file is `.freeTextEditor`.',
  },
  {
    id: 'correctness.css-unknown-pseudo-class',
    group: 'correctness',
    title: 'Unknown pseudo-class',
    description:
      'A `:pseudo` no browser implements. One invalid item invalidates the whole selector list in CSS, ' +
      'so the rule it belongs to stops matching entirely rather than degrading.',
  },
  {
    id: 'correctness.css-unknown-pseudo-element',
    group: 'correctness',
    title: 'Unknown pseudo-element',
    description: 'A `::pseudo` no browser implements, invalidating the selector it appears in.',
  },
  {
    id: 'correctness.css-invalid-gradient-direction',
    group: 'correctness',
    title: 'Invalid gradient direction',
    description:
      'A `linear-gradient()` whose first argument is a bare keyword like `top` rather than `to top` or ' +
      'an angle. The whole gradient is invalid, so the background falls back to nothing.',
  },
  {
    id: 'correctness.css-import-position',
    group: 'correctness',
    title: '@import after a style rule',
    description:
      'CSS requires `@import` before any style rule. One placed later is ignored outright, so a ' +
      'stylesheet the author believes is loaded is simply absent.',
  },
  {
    id: 'correctness.css-missing-var-function',
    group: 'correctness',
    title: 'Custom property used without var()',
    description:
      'A declaration whose value names `--custom-property` directly instead of `var(--custom-property)`. ' +
      'It parses, so nothing complains, and the value is never substituted.',
  },
  {
    id: 'correctness.css-unmatchable-selector',
    group: 'correctness',
    title: 'Selector that can never match',
    description:
      'An `An+B` expression with no solution — `:nth-child(0)`, `:nth-child(0n+0)` — so the rule is ' +
      'dead. Written by hand it is almost always an off-by-one from the 1-based indexing `nth-child` uses.',
  },
  {
    id: 'correctness.css-shorthand-override',
    group: 'correctness',
    title: 'Shorthand overrides an earlier longhand',
    description:
      'A shorthand property declared after a longhand it subsumes — `flex-wrap: wrap` then ' +
      '`flex-flow: column nowrap` — silently resetting the longhand to the shorthand\'s value or its ' +
      'initial value. The highest-precision rule this engine ships: six findings across 1729 ' +
      'production stylesheets, six real dead declarations.',
  },
  {
    id: 'correctness.css-duplicate-property',
    group: 'correctness',
    title: 'Property declared twice in one block',
    description:
      'The same property declared twice in the same block, so the first is dead. **Repeating a ' +
      'property deliberately is a real technique** — `background: <solid>` then ' +
      '`background: <gradient>` is how a fallback is written for a browser that cannot parse the ' +
      'second — and Biome does not distinguish the two. Measured over 1729 production stylesheets: ' +
      'Biome produced 44 findings, of which 13 came from files it could not parse and the adapter ' +
      'therefore discards; of the 31 that survive, **15 are real** (6 identical values, 9 dead ' +
      'overrides) and 16 are not (14 deliberate fallbacks, 1 CSS Modules `composes`, 1 `color-mix()` ' +
      'fallback). Kept because the 15 are genuine and the noise is recognisable on sight. Note also ' +
      'that Biome reports only the **first** duplicated property in a block, so a finding here can ' +
      'mean more than one.',
  },
  {
    id: 'correctness.css-duplicate-custom-property',
    group: 'correctness',
    title: 'Custom property declared twice',
    description:
      'The same `--custom-property` declared twice in one block. Unlike a duplicated ordinary ' +
      'property this has no fallback reading — a custom property holds an arbitrary token stream and ' +
      'is never rejected for being unparseable — so the earlier declaration is unconditionally dead.',
  },
  {
    id: 'correctness.css-duplicate-import',
    group: 'correctness',
    title: 'Same file imported twice',
    description: 'Two `@import` rules naming the same URL. The second is redundant work at load time.',
  },
  {
    id: 'correctness.css-duplicate-font-name',
    group: 'correctness',
    title: 'Font repeated in a font stack',
    description:
      'A `font-family` listing the same family twice. The repeat can never be reached, and it usually ' +
      'means the intended fallback was lost in an edit.',
  },
  {
    id: 'correctness.css-duplicate-keyframe-selector',
    group: 'correctness',
    title: 'Keyframe selector declared twice',
    description:
      'Two blocks for the same keyframe offset in one `@keyframes` — `from` twice, or `0%` and `from`. ' +
      'The later block wins and the earlier one is silently discarded mid-animation.',
  },
  {
    id: 'correctness.css-important-in-keyframe',
    group: 'correctness',
    title: '!important inside a keyframe',
    description:
      'A declaration inside a `@keyframes` block marked `!important`. The specification says it is ' +
      'ignored, so the property simply does not animate — the opposite of what the author asked for.',
  },
  {
    id: 'correctness.css-deprecated-media-type',
    group: 'correctness',
    title: 'Deprecated media type',
    description:
      'A media type removed from Media Queries Level 4 — `tty`, `tv`, `projection` and the rest. ' +
      'Everything except `all`, `screen` and `print` now never matches, so the block is dead.',
  },
  {
    id: 'correctness.css-irregular-whitespace',
    group: 'correctness',
    title: 'Irregular whitespace in a stylesheet',
    description:
      'A non-breaking space, en space or similar invisible character where an ordinary space was ' +
      'meant. In CSS this is not cosmetic: inside a selector or between a property and its value it ' +
      'is a parse error, and the declaration or rule is discarded with nothing on screen to explain why.',
  },
  {
    id: 'correctness.css-unknown-at-rule',
    group: 'correctness',
    title: 'Unknown at-rule',
    description:
      'An `@rule` CSS does not define. Genuine when the stylesheet really is CSS — and **not genuine ' +
      'when a preprocessor is in the chain**: `@extend` (PostCSS) and `@tailwind` (Tailwind v3) are ' +
      'both valid input to their own build. Measured 26/26 not-genuine on a corpus containing two ' +
      'preprocessed projects, which is a statement about the corpus rather than about the rule.',
  },
  {
    id: 'correctness.css-unknown-function',
    group: 'correctness',
    title: 'Unknown CSS function',
    description:
      'A `fn()` in a value that CSS does not define, so the declaration is dropped. Same preprocessor ' +
      'caveat as `correctness.css-unknown-at-rule`: Mantine\'s `alpha()` is compiled away by ' +
      '`postcss-preset-mantine` and never reaches a browser.',
  },
  {
    id: 'a11y.css-generic-font-name',
    group: 'a11y',
    title: 'Font stack has no generic fallback',
    description:
      'A `font-family` that never reaches `serif`, `sans-serif`, `monospace` or another generic ' +
      'family, so a reader whose system lacks every named font gets the browser default rather than ' +
      'the intended shape. Correct in principle and mostly wrong in practice on real code: 15 of 16 ' +
      'findings over 1729 stylesheets were **icon fonts** (`codicon`, `PrismTreeview`), where adding a ' +
      'generic fallback would render arbitrary letters instead of icons. Not in `recommended` for that ' +
      'reason.',
  },
  {
    id: 'duplication.css-duplicate-selector',
    group: 'duplication',
    title: 'Selector list repeated in a file',
    description:
      'The same selector list declared twice in one stylesheet. Sometimes redundancy; more often ' +
      'deliberate, because grouping declarations by concern (a "sidebar" section, a colour section) ' +
      'means revisiting selectors. 178 findings over 1729 stylesheets, none of the sampled ones a ' +
      'defect. Not in `recommended`.',
  },
  {
    id: 'duplication.css-empty-block',
    group: 'duplication',
    title: 'Empty declaration block',
    description:
      'A rule with no declarations. It costs nothing at run time and is frequently intentional — ' +
      'highlight.js ships `.hljs-property {}` in 176 theme files as a documented placeholder, which ' +
      'was 176 of the 181 findings measured. Outside that one convention the rule is near-silent: five ' +
      'findings in the other 1553 files. Not in `recommended`.',
  },
  {
    id: 'style.css-hex-color',
    group: 'style',
    title: 'Hex colour notation',
    description:
      'A colour written as `#rgb`/`#rrggbb` rather than `hsl()`, `oklch()` or another model. Pure ' +
      'house style with no defect content: 5815 findings over 1729 production stylesheets, zero of ' +
      'them a bug. Available by concept for a project that has adopted a colour-model convention and ' +
      'wants it enforced.',
  },
  {
    id: 'style.css-descending-specificity',
    group: 'style',
    title: 'Selector ordered after a more specific one',
    description:
      'A selector appearing after one with higher specificity that could match the same element, so ' +
      'source order does not decide the outcome. Ordinary correct CSS trips it constantly — 2206 ' +
      'findings across 25% of all files measured, in 8 of 10 repositories — because grouping by ' +
      'component rather than by specificity is how stylesheets are actually written. Available by ' +
      'concept for a codebase that has committed to specificity ordering.',
  },
  {
    id: 'style.css-baseline',
    group: 'style',
    title: 'CSS feature outside the chosen Baseline',
    description:
      'A property, selector or function that is not yet Baseline "widely available". Whether that ' +
      'matters is entirely a property of the project\'s browser targets, which slop-gate does not ' +
      'know: on the corpus this flagged `light-dark()` 813 times, `::selection` 385 and `user-select` ' +
      '259, in an editor that ships its own Chromium. Available by concept for a project whose support ' +
      'floor really is Baseline.',
  },
  {
    id: 'complexity.css-important',
    group: 'complexity',
    title: '!important declaration',
    description:
      'A declaration marked `!important`. Overused it makes a cascade unreasonable about; used ' +
      'deliberately it is how a theming layer wins against a component library, which is why VS Code ' +
      'alone accounts for 1071 of the 1502 findings measured. A judgement about a codebase\'s ' +
      'conventions rather than a defect, so it is available by concept and not in `recommended`.',
  },
  {
    id: 'config.css-not-analysed',
    group: 'config',
    title: 'Stylesheet could not be analysed',
    description:
      'A `.css` file the CSS engine could not parse, so none of its rules ran on it. Deliberately ' +
      'distinct from `correctness.parse-error`, which means the file is broken: every one of the 125 ' +
      'parse errors measured across 1729 production stylesheets came from a `.css` file that is not ' +
      'plain CSS at all — PostCSS `$variables` and `%placeholder` selectors, browser-specific ' +
      'directives — all of which compile and ship. Calling those broken would be wrong every time. ' +
      'Reported anyway, one finding per file rather than per error, because the alternative is a ' +
      'repository whose stylesheets were never read coming back clean.',
  },
  {
    id: 'config.foreign-suppression',
    group: 'config',
    title: 'Foreign suppression comment',
    description:
      'A file carries a suppression comment written for the underlying engine rather than for ' +
      'slop-gate — a `biome-ignore` in a stylesheet. slop-gate owns the rules (D2) and `init` replaces ' +
      'the repository\'s own Biome configuration, so a comment left behind by that migration keeps ' +
      'silencing findings with **nothing anywhere in the engine\'s output to say it happened**: the ' +
      'diagnostic is simply absent and the summary counts it as clean. Reported because a silent gap ' +
      'must not be representable, on the same principle as an unavailable engine. Use ' +
      'a `sgate-disable`-family directive instead, which slop-gate can see, attribute and report as ' +
      'unused when it stops matching.',
  },
  {
    id: 'config.dockerfile-base-image-untagged',
    group: 'config',
    title: 'Base image has no tag',
    description:
      'A `FROM` with no tag at all, which Docker resolves as `:latest`. The same Dockerfile builds a ' +
      'different image tomorrow, so a build that succeeded once is not reproducible. Measured 15 of 20 ' +
      'true across 275 real Dockerfiles — the five misses are `FROM` lines whose image name is ' +
      'assembled from an `ARG`, which hadolint cannot resolve.',
  },
  {
    id: 'config.dockerfile-base-image-mutable-tag',
    group: 'config',
    title: 'Base image is pinned to a moving tag',
    description:
      'A `FROM` naming `:latest` explicitly. Same non-reproducibility as an untagged image, separated ' +
      'because the two are separate hadolint rules and a concept can have only one owning rule per ' +
      'language. Measured **18 of 18** true across 275 real Dockerfiles — no false positives at all, ' +
      'because unlike the untagged case there is no interpolation to misread.',
  },
  {
    id: 'config.dockerfile-entrypoint-form',
    group: 'config',
    title: 'Entrypoint uses shell form',
    description:
      'A `CMD` or `ENTRYPOINT` written as a bare string rather than a JSON array. Shell form wraps the ' +
      'process in `/bin/sh -c`, which does not forward `SIGTERM`, so the container is killed on stop ' +
      'rather than shut down and in-flight work is lost. Deliberately **not** reported for ' +
      '`HEALTHCHECK … CMD`, where shell form is normal and nothing signals the probe.',
  },
  {
    id: 'config.dockerfile-pipefail',
    group: 'config',
    title: 'Pipeline in RUN can fail silently',
    description:
      'A `RUN` containing a pipe, without `SHELL` having set `-o pipefail`. The exit status of a ' +
      'pipeline is the status of its *last* command, so `curl … | bash` succeeds when the download ' +
      'fails and the image ships missing whatever was being installed. The largest measured source of ' +
      'true positives in the Dockerfile engine: 78 of 94 across 275 files.',
  },
  {
    id: 'config.dockerfile-platform',
    group: 'config',
    title: 'FROM hardcodes a platform',
    description:
      'A `--platform=` flag written as a literal in `FROM` rather than left to the builder or taken ' +
      'from `$BUILDPLATFORM`. The image then builds for that one architecture whatever it was asked ' +
      'for, which turns a multi-arch build into a silently wrong single-arch one.',
  },
  {
    id: 'config.dockerfile-package-cache',
    group: 'config',
    title: 'Package manager cache left in the layer',
    description:
      'A `pip install` without `--no-cache-dir`. The download cache is written into the image layer, ' +
      'where nothing will ever read it. Unlike the apt and apk cache rules — which measured zero true ' +
      'positives and are excluded — this one is a single flag with no maintenance cost and no ' +
      'legitimate reason to omit it in an image.',
  },
] as const satisfies readonly ConceptDefinition[]

export const CONCEPTS = [
  ...HAND_WRITTEN_CONCEPTS,
  ...CURATED_CONCEPTS,
  ...GENERATED_CONCEPTS,
] as const satisfies readonly ConceptDefinition[]

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

const WIDENED_CONCEPTS: readonly ConceptDefinition[] = CONCEPTS

export const SLOP_GATE_SERVICED_CONCEPTS: ReadonlySet<string> = new Set(
  WIDENED_CONCEPTS.filter((c) => c.servicedBySlopGate).map((c) => c.id),
)

export const GENERATED_CONCEPT_IDS: ReadonlySet<string> = new Set(GENERATED_CONCEPTS.map((c) => c.id))
