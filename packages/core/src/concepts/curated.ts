import type { ConceptDefinition } from './catalogue.ts'

export const CURATED_CONCEPTS = [
  {
    id: 'correctness.alt-text',
    group: 'correctness',
    title: 'Missing alternative text',
    description:
      'An image or media element with no text alternative is announced as nothing at all, or as its ' +
      'file name, so whatever it conveys is unavailable to anyone not looking at it.',
  },
  {
    id: 'correctness.anchor-has-content',
    group: 'correctness',
    title: 'Link with no content',
    description:
      'A link with no accessible text gives a screen reader nothing to announce, so its destination ' +
      'cannot be identified from a list of the page\'s links.',
  },
  {
    id: 'correctness.anchor-is-valid',
    group: 'correctness',
    title: 'Anchor that is not a link',
    description:
      'An `<a>` without a valid `href` is not a link: it is not focusable, not in the tab order, and ' +
      'not announced as navigable. A control that only runs JavaScript is a button.',
  },
  {
    id: 'correctness.aria-activedescendant-has-tabindex',
    group: 'correctness',
    title: 'Managed focus on an unfocusable element',
    description:
      'An element that tracks focus through `aria-activedescendant` but cannot itself be focused ' +
      'never receives the keystrokes it exists to interpret.',
  },
  {
    id: 'correctness.aria-props',
    group: 'correctness',
    title: 'Unknown ARIA attribute',
    description:
      'A misspelled `aria-*` attribute is silently ignored, so the semantics it was meant to convey ' +
      'never reach assistive technology.',
  },
  {
    id: 'correctness.aria-proptypes',
    group: 'correctness',
    title: 'Invalid ARIA attribute value',
    description:
      'An `aria-*` value outside the set its specification allows is discarded, leaving the state it ' +
      'described unannounced.',
  },
  {
    id: 'correctness.aria-role',
    group: 'correctness',
    title: 'Invalid ARIA role',
    description:
      'An unrecognised or abstract role leaves the element with its original semantics, which are ' +
      'not the ones the author meant to expose.',
  },
  {
    id: 'correctness.aria-unsupported-elements',
    group: 'correctness',
    title: 'ARIA on an element that ignores it',
    description:
      'Elements such as `meta`, `html`, `script` and `style` are not exposed to assistive technology ' +
      'at all, so ARIA attributes on them have no effect.',
  },
  {
    id: 'correctness.autocomplete-valid',
    group: 'correctness',
    title: 'Invalid autocomplete value',
    description:
      'A token the browser does not recognise turns autofill off for the field rather than steering ' +
      'it, so users retype data the browser already holds.',
  },
  {
    id: 'correctness.bad-array-method-on-arguments',
    group: 'correctness',
    title: 'Array method on `arguments`',
    description: '`arguments` is array-like but carries no array methods, so calling one throws a `TypeError`.',
  },
  {
    id: 'correctness.bad-char-at-comparison',
    group: 'correctness',
    title: 'Character compared with a longer string',
    description:
      'Indexing a string returns at most one character, so comparing the result against a longer ' +
      'string is always false and the branch behind it is dead.',
  },
  {
    id: 'correctness.bad-comparison-sequence',
    group: 'correctness',
    title: 'Chained comparison',
    description:
      'Chaining comparisons does not compare three operands: the first comparison yields a boolean, ' +
      'which is then compared against the third operand.',
  },
  {
    id: 'correctness.bad-match-all-arg',
    group: 'correctness',
    title: 'Non-global pattern passed to `matchAll`',
    description: '`matchAll` throws a `TypeError` when its regular expression lacks the `g` flag.',
  },
  {
    id: 'correctness.bad-min-max-func',
    group: 'correctness',
    title: 'Clamp with inverted bounds',
    description:
      'A `Math.min(Math.max(x, y), z)` clamp whose bounds are the wrong way round always returns one ' +
      'of the bounds, discarding the value it was supposed to constrain.',
  },
  {
    id: 'correctness.bad-object-literal-comparison',
    group: 'correctness',
    title: 'Comparison against a literal object',
    description:
      'An object or array literal is a fresh reference, so comparing anything against one is false ' +
      'whatever the contents. Emptiness is checked through the keys, not the value.',
  },
  {
    id: 'correctness.bad-replace-all-arg',
    group: 'correctness',
    title: 'Non-global pattern passed to `replaceAll`',
    description: '`replaceAll` throws a `TypeError` when its regular expression lacks the `g` flag.',
  },
  {
    id: 'correctness.check-tag-names',
    group: 'correctness',
    title: 'Unrecognised documentation tag',
    description:
      'A block tag the toolchain does not know is skipped, so the documentation attached to it never ' +
      'appears anywhere it is read.',
  },
  {
    id: 'correctness.click-events-have-key-events',
    group: 'correctness',
    title: 'Click handler with no keyboard equivalent',
    description:
      'A click handler with no keyboard counterpart makes the control unreachable for anyone who ' +
      'cannot use a pointer.',
  },
  {
    id: 'correctness.component-missing-return',
    group: 'correctness',
    title: 'Component render with no return',
    description:
      'A render method that falls off its end returns `undefined`, which React treats as an error rather ' +
      'than as an empty component.',
  },
  {
    id: 'correctness.const-comparisons',
    group: 'correctness',
    title: 'Comparison with a fixed result',
    description:
      'A comparison between constants, or of a value against itself, has an outcome fixed at compile ' +
      'time, so one branch is unreachable and the condition does not test what it appears to.',
  },
  {
    id: 'correctness.default',
    group: 'correctness',
    title: 'Default import from a module without one',
    description:
      'The source module exports no default, so the binding is `undefined` where it is used, or a ' +
      'link error outright, depending on how the module is resolved.',
  },
  {
    id: 'correctness.double-comparisons',
    group: 'correctness',
    title: 'Redundant double comparison',
    description:
      'Two comparisons combined in one expression where one already implies the other reduce to a ' +
      'single comparison, so the expression does not constrain what it appears to.',
  },
  {
    id: 'correctness.duplicate-export-name',
    group: 'correctness',
    title: 'Name exported twice from one module',
    description:
      'A module exporting the same name more than once — directly and again through a `export *` — leaves ' +
      'which binding an importer receives up to resolution order rather than to the author.',
  },
  {
    id: 'correctness.erasing-op',
    group: 'correctness',
    title: 'Operation that always yields zero',
    description:
      'An expression such as `x * 0` discards its operand and evaluates to a constant, so whatever ' +
      'the operand computed is thrown away.',
  },
  {
    id: 'correctness.exhaustive-deps',
    group: 'correctness',
    title: 'Incomplete hook dependency list',
    description:
      'A hook whose dependency list omits a value it reads keeps the value captured on the first ' +
      'render, so it operates on stale data and never re-runs when that value changes.',
  },
  {
    id: 'correctness.forward-ref-uses-ref',
    group: 'correctness',
    title: 'Ref forwarder that drops its ref',
    description:
      'A forwarding wrapper that ignores its second parameter discards every ref passed to it, so ' +
      "the caller's ref stays null and the wrapper serves no purpose.",
  },
  {
    id: 'correctness.heading-has-content',
    group: 'correctness',
    title: 'Heading with no content',
    description:
      'An empty heading still appears in the outline used to navigate the page, offering a jump ' +
      'target with nothing behind it.',
  },
  {
    id: 'correctness.hoisted-apis-on-top',
    group: 'correctness',
    title: 'Hoisted test API not at top level',
    description:
      'Vitest lifts `vi.mock`, `vi.unmock` and `vi.hoisted` above the imports regardless of where ' +
      'they are written, so one placed inside a block or after other statements runs at a point the ' +
      'surrounding code does not imply.',
  },
  {
    id: 'correctness.html-has-lang',
    group: 'correctness',
    title: 'Document with no declared language',
    description:
      'With no declared language a screen reader pronounces the page using whatever language the ' +
      'user configured, which mangles the text whenever the two differ.',
  },
  {
    id: 'correctness.iframe-has-title',
    group: 'correctness',
    title: 'Frame with no title',
    description:
      'An untitled frame gives no way to tell one embedded document from another while moving ' +
      'between them.',
  },
  {
    id: 'correctness.img-redundant-alt',
    group: 'correctness',
    title: 'Redundant wording in alternative text',
    description:
      'The element is already announced as an image, so words like `image` or `photo` in its text ' +
      'alternative are read out twice.',
  },
  {
    id: 'correctness.inline-script-id',
    group: 'correctness',
    title: 'Inline script with no id',
    description:
      'Inline scripts are deduplicated by id, so one without an id can be injected and executed ' +
      'again on every render.',
  },
  {
    id: 'correctness.interactive-supports-focus',
    group: 'correctness',
    title: 'Interactive element that cannot take focus',
    description:
      'An element given an interactive role and a handler but no focusability can be clicked and ' +
      'never reached by keyboard or assistive technology.',
  },
  {
    id: 'correctness.jest-no-conditional-expect',
    group: 'correctness',
    title: 'Assertion inside a conditional',
    description:
      'An assertion in a branch or `catch` does not run when that path is not taken, so the test ' +
      'reports success without having checked anything.',
  },
  {
    id: 'correctness.jest-no-focused-tests',
    group: 'correctness',
    title: 'Focused test',
    description:
      'Focusing a test silently reduces the file to that one test, so a committed `.only` stops the ' +
      'rest from running anywhere, including in CI.',
  },
  {
    id: 'correctness.jest-no-standalone-expect',
    group: 'correctness',
    title: 'Assertion outside a test',
    description:
      'An assertion at file scope runs while tests are being collected rather than as part of one, ' +
      'so its failure is attributed to nothing and may not fail the run.',
  },
  {
    id: 'correctness.jest-prefer-snapshot-hint',
    group: 'correctness',
    title: 'Snapshot with no hint',
    description:
      'Auto-numbered snapshots shift when an assertion is added or reordered, so unrelated snapshots ' +
      'appear changed and the real difference is buried among them.',
  },
  {
    id: 'correctness.jest-require-to-throw-message',
    group: 'correctness',
    title: 'Throw assertion with no expected message',
    description:
      'An unqualified throw assertion passes for any error, including one raised for a completely ' +
      'different reason than the test is about.',
  },
  {
    id: 'correctness.jest-valid-describe-callback',
    group: 'correctness',
    title: 'Malformed suite callback',
    description:
      'A suite callback that takes parameters or returns a value does not register its tests the way ' +
      'the runner expects, so some or all of them never run.',
  },
  {
    id: 'correctness.jest-valid-expect',
    group: 'correctness',
    title: 'Malformed assertion call',
    description: '`expect()` called with no argument, or with more than one, does not assert what it appears to.',
  },
  {
    id: 'correctness.jest-valid-expect-in-promise',
    group: 'correctness',
    title: 'Unawaited assertion in a promise chain',
    description:
      'An assertion inside a promise callback that is neither awaited nor returned settles after the ' +
      'test has already finished, so a failure is never attributed to it.',
  },
  {
    id: 'correctness.jest-valid-title',
    group: 'correctness',
    title: 'Unusable test title',
    description:
      'An empty title, a non-string one, or one that repeats its block name leaves the failure ' +
      'output with no usable description of what broke.',
  },
  {
    id: 'correctness.jsx-key',
    group: 'correctness',
    title: 'List element with no key',
    description:
      'Without a key, siblings in a list are matched by position, so inserting or reordering items ' +
      'attaches existing element state to the wrong item.',
  },
  {
    id: 'correctness.jsx-key-index',
    group: 'correctness',
    title: 'List key taken from the array index',
    description:
      'An index is a position, not an identity, so every item after an insertion or a sort gets the key ' +
      'its neighbour had. That is the same failure as no key at all, hidden behind one that looks present.',
  },
  {
    id: 'correctness.jsx-no-duplicate-props',
    group: 'correctness',
    title: 'Duplicate JSX prop',
    description:
      'The last of two identical props wins silently, so the earlier value — often the intended ' +
      'one — never reaches the component.',
  },
  {
    id: 'correctness.jsx-no-undef',
    group: 'correctness',
    title: 'Undeclared name in JSX',
    description:
      'An element referring to a name nothing declares throws a `ReferenceError` as soon as the ' +
      'branch that renders it is reached.',
  },
  {
    id: 'correctness.jsx-props-no-spread-multi',
    group: 'correctness',
    title: 'Same expression spread twice',
    description:
      'The second spread overwrites whatever the props between the two set, and re-evaluates the ' +
      'same expression to do it.',
  },
  {
    id: 'correctness.label-has-associated-control',
    group: 'correctness',
    title: 'Label with no associated control',
    description:
      'A label not bound to a control gives assistive technology no name for the field, and clicking ' +
      'the label does not move focus into it.',
  },
  {
    id: 'correctness.lang',
    group: 'correctness',
    title: 'Invalid language tag',
    description:
      'A value outside BCP 47 is ignored, so the page is pronounced using the language the user ' +
      'configured rather than its own.',
  },
  {
    id: 'correctness.media-has-caption',
    group: 'correctness',
    title: 'Media with no captions',
    description:
      'Audio and video without a caption track carry information that is simply unavailable to ' +
      'anyone who cannot hear it, and to anyone in a context where sound is off.',
  },
  {
    id: 'correctness.missing-named-export',
    group: 'correctness',
    title: 'Named import the module does not export',
    description:
      'The binding is `undefined` at run time rather than an import error, so the failure surfaces wherever ' +
      'it is first called, not where it was imported.',
  },
  {
    id: 'correctness.missing-throw',
    group: 'correctness',
    title: 'Error constructed but not thrown',
    description:
      'A bare `new Error(...)` as a statement builds the error and discards it, so the failure it was ' +
      'meant to signal never happens and execution continues.',
  },
  {
    id: 'correctness.mouse-events-have-key-events',
    group: 'correctness',
    title: 'Hover handler with no focus equivalent',
    description:
      'Pointer enter and leave handlers with no focus and blur counterparts mean whatever they ' +
      'reveal never appears for someone navigating by keyboard.',
  },
  {
    id: 'correctness.namespace',
    group: 'correctness',
    title: 'Namespace member that does not exist',
    description:
      'The source module exports no such name, so the access is `undefined` and fails wherever the ' +
      'value is used rather than at the import that promised it.',
  },
  {
    id: 'correctness.no-access-key',
    group: 'correctness',
    title: 'Access key shortcut',
    description:
      'An access key can collide with a shortcut the browser or screen reader already binds, taking ' +
      "a key away from the user's own navigation.",
  },
  {
    id: 'correctness.no-aria-hidden-on-focusable',
    group: 'correctness',
    title: 'Focusable element hidden from assistive technology',
    description:
      'Hiding a focusable element leaves it in the tab order, so a screen reader user lands on a ' +
      'control it has been told not to describe.',
  },
  {
    id: 'correctness.no-arrow-functions-in-watch',
    group: 'correctness',
    title: 'Arrow function as a watcher',
    description:
      'An arrow function binds `this` lexically, so a watcher written as one has no access to the ' +
      'component instance whose data it is watching.',
  },
  {
    id: 'correctness.no-assign-module-variable',
    group: 'correctness',
    title: 'Variable named `module`',
    description:
      "Declaring `module` shadows the identifier the framework's own module handling relies on, " +
      'breaking the page in ways that point nowhere near this declaration.',
  },
  {
    id: 'correctness.no-async-in-computed-properties',
    group: 'correctness',
    title: 'Asynchronous work in a computed property',
    description:
      'A computed property must derive its value synchronously; an async body returns a promise ' +
      'instead of the value, so everything reading it sees the promise.',
  },
  {
    id: 'correctness.no-autofocus',
    group: 'correctness',
    title: 'Focus moved on load',
    description:
      'Moving focus without the user asking skips past whatever precedes the field and disorients ' +
      'screen reader and magnifier users, who lose their position on the page.',
  },
  {
    id: 'correctness.no-await-in-promise-methods',
    group: 'correctness',
    title: 'Await inside a promise combinator',
    description:
      'Awaiting a promise before handing it to the combinator serialises the work the combinator ' +
      'exists to run concurrently, and a rejection then throws at the `await` instead of being ' +
      'handled by the combinator.',
  },
  {
    id: 'correctness.no-caller',
    group: 'correctness',
    title: 'Access to the calling function',
    description:
      '`arguments.caller` and `arguments.callee` throw under strict mode, and elsewhere they defeat ' +
      'the inlining an engine would otherwise apply.',
  },
  {
    id: 'correctness.no-children-prop',
    group: 'correctness',
    title: 'Children passed as a prop',
    description:
      'Nested content overwrites a `children` prop, so the two forms disagree about what the ' +
      'component actually receives and the explicit one usually loses.',
  },
  {
    id: 'correctness.no-computed-properties-in-data',
    group: 'correctness',
    title: 'Computed property read during initialisation',
    description:
      '`data()` runs before computed properties exist, so reading one there yields `undefined` and ' +
      "stores it as the component's initial state.",
  },
  {
    id: 'correctness.no-conditional-tests',
    group: 'correctness',
    title: 'Conditional inside a test',
    description:
      'A test whose body depends on a condition asserts nothing on the runs where the condition does ' +
      'not hold, and reports success either way.',
  },
  {
    id: 'correctness.no-control-regex',
    group: 'correctness',
    title: 'Control character in a pattern',
    description:
      'A control character is invisible in the source, so the pattern reads as matching something ' +
      'other than what it matches.',
  },
  {
    id: 'correctness.no-danger-with-children',
    group: 'correctness',
    title: 'Raw HTML alongside children',
    description:
      'An element cannot both have its inner HTML replaced and render children into the same place; ' +
      'one of the two is discarded.',
  },
  {
    id: 'correctness.no-delete-var',
    group: 'correctness',
    title: '`delete` applied to a variable',
    description:
      '`delete` removes a property from an object. Applied to a variable it is a syntax error under ' +
      'strict mode and does nothing otherwise.',
  },
  {
    id: 'correctness.no-deprecated-data-object-declaration',
    group: 'correctness',
    title: 'Component state declared as an object',
    description:
      'One object literal is shared by every instance of the component, so state written by one ' +
      'instance shows up in all of them.',
  },
  {
    id: 'correctness.no-deprecated-delete-set',
    group: 'correctness',
    title: 'Removed reactivity helper',
    description:
      'These helpers were removed in Vue 3, where reactivity is backed by proxies and plain ' +
      'assignment already works. Code still calling them throws.',
  },
  {
    id: 'correctness.no-deprecated-destroyed-lifecycle',
    group: 'correctness',
    title: 'Removed teardown lifecycle hook',
    description:
      'Vue 3 renamed these hooks, so one still using the old name is never called and the teardown ' +
      'inside it silently never runs.',
  },
  {
    id: 'correctness.no-deprecated-events-api',
    group: 'correctness',
    title: 'Removed instance events API',
    description:
      'Vue 3 removed the per-instance event emitter, so an event bus built on it registers and emits ' +
      'nothing without any error to say so.',
  },
  {
    id: 'correctness.no-deprecated-model-definition',
    group: 'correctness',
    title: 'Removed two-way binding option',
    description:
      'Vue 3 drives two-way binding through a `modelValue` prop and its update event; the old option ' +
      'is ignored, so the binding stops working.',
  },
  {
    id: 'correctness.no-deprecated-props-default-this',
    group: 'correctness',
    title: 'Instance access in a prop default',
    description:
      'A default factory runs before the instance exists, so `this` is undefined there and the ' +
      'default it computes is wrong or throws.',
  },
  {
    id: 'correctness.no-deprecated-vue-config-keycodes',
    group: 'correctness',
    title: 'Removed key alias configuration',
    description: 'Vue 3 removed this option, so the key aliases it defined silently stop resolving on upgrade.',
  },
  {
    id: 'correctness.no-did-mount-set-state',
    group: 'correctness',
    title: 'State set immediately after mount',
    description:
      'Updating state in the mount hook forces a second render before the browser paints, so the ' +
      'first result is thrown away and the layout can visibly shift.',
  },
  {
    id: 'correctness.no-did-update-set-state',
    group: 'correctness',
    title: 'State set after an update',
    description:
      'Updating state in the update hook triggers another update, which risks an unbounded render ' +
      'loop and recomputes layout every time round.',
  },
  {
    id: 'correctness.no-direct-mutation-state',
    group: 'correctness',
    title: 'Direct mutation of component state',
    description:
      'Assigning to the state object changes the value without scheduling a render, so the component ' +
      'keeps displaying the previous state — and the mutation is overwritten by the next real update.',
  },
  {
    id: 'correctness.no-distracting-elements',
    group: 'correctness',
    title: 'Distracting animated element',
    description:
      'Continuously moving content defeats screen magnifiers and can trigger vestibular or attention ' +
      'difficulties, with no way for the reader to stop it.',
  },
  {
    id: 'correctness.no-document-import-in-page',
    group: 'correctness',
    title: 'Document module imported outside the document',
    description:
      'This module is only valid inside the custom document; importing it elsewhere pulls ' +
      'document-only internals into a page bundle.',
  },
  {
    id: 'correctness.no-duplicate-enum-values',
    group: 'correctness',
    title: 'Duplicate enum value',
    description:
      'Two members sharing a value make the reverse mapping ambiguous, so looking a name up by value ' +
      'returns whichever member happens to be declared last.',
  },
  {
    id: 'correctness.no-duplicate-head',
    group: 'correctness',
    title: 'Duplicate document head',
    description:
      'More than one head element in the custom document duplicates or drops tags depending on the ' +
      'order they render in.',
  },
  {
    id: 'correctness.no-empty-character-class',
    group: 'correctness',
    title: 'Empty character class',
    description:
      'An empty character class matches nothing, so the pattern containing it can never match — ' +
      'usually a bracket typed in the wrong place.',
  },
  {
    id: 'correctness.no-empty-file',
    group: 'correctness',
    title: 'File with no code',
    description:
      'A file holding only comments, directives or whitespace exports nothing and runs nothing, so ' +
      'it is normally what a move left behind.',
  },
  {
    id: 'correctness.no-empty-static-block',
    group: 'correctness',
    title: 'Empty static initialiser',
    description: 'A static block with no body runs no code, and normally marks a refactor that was left unfinished.',
  },
  {
    id: 'correctness.no-export',
    group: 'correctness',
    title: 'Export from a test file',
    description:
      'Importing a test file executes every test in it again in the importing context, so exporting ' +
      'from one invites duplicate runs of the whole file.',
  },
  {
    id: 'correctness.no-export-in-script-setup',
    group: 'correctness',
    title: 'Export from a setup block',
    description:
      'A setup block publishes bindings to the template by declaring them, not by exporting them, so ' +
      'an export there is a compile error rather than a way to expose anything.',
  },
  {
    id: 'correctness.no-expose-after-await',
    group: 'correctness',
    title: 'Exposed members registered after `await`',
    description:
      'Registration after an `await` happens once setup has already finished, so the parent never ' +
      'receives the members through its ref.',
  },
  {
    id: 'correctness.no-extra-boolean-cast',
    group: 'correctness',
    title: 'Redundant boolean cast',
    description:
      'In a position that already coerces to boolean, the cast changes nothing and only obscures ' +
      'what is being tested.',
  },
  {
    id: 'correctness.no-extra-non-null-assertion',
    group: 'correctness',
    title: 'Repeated non-null assertion',
    description:
      'A second `!` on the same value narrows nothing further, so repeating it usually means a ' +
      'different expression was the one meant to be asserted.',
  },
  {
    id: 'correctness.no-find-dom-node',
    group: 'correctness',
    title: 'DOM node located through the component tree',
    description:
      'This escape hatch was removed in React 19, so the call now throws; where it still exists it ' +
      'reaches past the component boundary into a node the child may have replaced.',
  },
  {
    id: 'correctness.no-head-import-in-document',
    group: 'correctness',
    title: 'Head component inside the document',
    description:
      'The head component does not work inside the custom document, so the tags it renders there are ' +
      'dropped from the output.',
  },
  {
    id: 'correctness.no-html-link-for-pages',
    group: 'correctness',
    title: 'Plain anchor for internal navigation',
    description:
      'A plain anchor between pages of the same application triggers a full document load, throwing ' +
      'away client-side state and the prefetch that would have made the navigation instant.',
  },
  {
    id: 'correctness.no-img-element',
    group: 'correctness',
    title: 'Unoptimised image element',
    description:
      "A raw image element bypasses the framework's image pipeline, so the file ships at full size " +
      'in its original format and delays the largest contentful paint.',
  },
  {
    id: 'correctness.no-interactive-element-to-noninteractive-role',
    group: 'correctness',
    title: 'Control given a static role',
    description:
      'Overriding a button or link with a non-interactive role removes it from the controls ' +
      'assistive technology reports, so users never learn it can be operated.',
  },
  {
    id: 'correctness.no-invalid-fetch-options',
    group: 'correctness',
    title: 'Request body on a bodyless method',
    description: '`fetch` throws a `TypeError` when a `GET` or `HEAD` request is given a body.',
  },
  {
    id: 'correctness.no-invalid-remove-event-listener',
    group: 'correctness',
    title: 'Listener removal that cannot match',
    description:
      'Listeners are removed by function identity, so passing a fresh inline function removes ' +
      'nothing and the original stays attached for the lifetime of the target.',
  },
  {
    id: 'correctness.no-irregular-whitespace',
    group: 'correctness',
    title: 'Irregular whitespace',
    description:
      'Non-standard whitespace looks exactly like a space in most editors but is not one, producing ' +
      'parse errors and diffs that nobody can see.',
  },
  {
    id: 'correctness.no-is-mounted',
    group: 'correctness',
    title: 'Mount-state check before updating',
    description:
      'This flag no longer exists, and the pattern it supported — checking before setting state — ' +
      'hides the leak it was working around instead of fixing it.',
  },
  {
    id: 'correctness.no-iterator',
    group: 'correctness',
    title: 'Obsolete iterator property',
    description:
      '`__iterator__` was a SpiderMonkey extension that no current engine honours, so the iteration ' +
      'behaviour it defines never takes effect.',
  },
  {
    id: 'correctness.no-lifecycle-after-await',
    group: 'correctness',
    title: 'Lifecycle hook registered after `await`',
    description:
      'A hook registered after an `await` arrives once setup has finished, by which point the ' +
      'component no longer accepts it, so the hook is never called.',
  },
  {
    id: 'correctness.no-misleading-character-class',
    group: 'correctness',
    title: 'Multi-code-point character in a character class',
    description:
      'A character class holds code points, not characters, so an accented letter or emoji written ' +
      'inside one is split into its parts and the class also matches those parts alone.',
  },
  {
    id: 'correctness.no-misused-new',
    group: 'correctness',
    title: 'Constructor-like member that is not a constructor',
    description:
      'A method named `new`, or an interface declaring `constructor`, reads as a construction ' +
      'signature but is an ordinary member, so nothing enforces the contract it appears to describe.',
  },
  {
    id: 'correctness.no-new-array',
    group: 'correctness',
    title: 'Array constructed from one argument',
    description:
      'With a single number the constructor creates that many empty slots rather than an array ' +
      'holding that number, and the two readings differ for every other argument.',
  },
  {
    id: 'correctness.no-new-statics',
    group: 'correctness',
    title: 'Static promise method called with `new`',
    description:
      '`Promise.resolve`, `Promise.all` and the other statics are plain functions, not constructors, ' +
      'so calling one with `new` throws a `TypeError`.',
  },
  {
    id: 'correctness.no-non-null-asserted-optional-chain',
    group: 'correctness',
    title: 'Non-null assertion after an optional chain',
    description:
      'An optional chain exists to yield `undefined` rather than throw; asserting its result ' +
      'non-null discards that guarantee and moves the crash to the next access.',
  },
  {
    id: 'correctness.no-noninteractive-element-interactions',
    group: 'correctness',
    title: 'Handler on a content element',
    description:
      'A container or piece of content carrying an event handler is reported to assistive technology ' +
      'as neither focusable nor operable, so the interaction exists only for pointer users.',
  },
  {
    id: 'correctness.no-noninteractive-element-to-interactive-role',
    group: 'correctness',
    title: 'Content element given a control role',
    description:
      'An interactive role promises focus, keyboard operation and state that the underlying element ' +
      'does not provide, so the control is announced but cannot be used.',
  },
  {
    id: 'correctness.no-noninteractive-tabindex',
    group: 'correctness',
    title: 'Tab stop on a non-interactive element',
    description:
      'Making something focusable that cannot be operated adds a stop to the tab order where there ' +
      'is nothing for the user to do.',
  },
  {
    id: 'correctness.no-nonoctal-decimal-escape',
    group: 'correctness',
    title: 'Legacy decimal escape',
    description:
      'These sequences have no escape meaning and evaluate to the bare digit, so the character the ' +
      'source appears to spell never ends up in the string.',
  },
  {
    id: 'correctness.no-redundant-roles',
    group: 'correctness',
    title: 'Role identical to the implicit one',
    description:
      'A role that repeats what the element already means adds nothing, and hides that changing the ' +
      'element would change the semantics.',
  },
  {
    id: 'correctness.no-render-return-value',
    group: 'correctness',
    title: 'Use of a render call\'s return value',
    description:
      'The returned handle is a legacy artefact: null under concurrent rendering and gone entirely ' +
      'in React 19, so anything built on it breaks on upgrade.',
  },
  {
    id: 'correctness.no-reserved-component-names',
    group: 'correctness',
    title: 'Component named after a built-in element',
    description:
      'The component shadows the standard element of the same name, so markup using that tag ' +
      'resolves to the component instead and behaves nothing like the element.',
  },
  {
    id: 'correctness.no-reserved-keys',
    group: 'correctness',
    title: 'Reserved instance key redefined',
    description:
      'Declaring a key the framework already exposes on the instance overwrites its own member, ' +
      'breaking whatever depended on the original.',
  },
  {
    id: 'correctness.no-reserved-props',
    group: 'correctness',
    title: 'Prop named after a reserved attribute',
    description:
      'The framework consumes these attributes before the component sees them, so a prop declared ' +
      'under one of those names is always absent.',
  },
  {
    id: 'correctness.no-script-component-in-head',
    group: 'correctness',
    title: 'Script component inside the head',
    description:
      'A script component nested in the head element is not managed by the script loader, so the ' +
      'loading strategy it declares is ignored.',
  },
  {
    id: 'correctness.no-shared-component-data',
    group: 'correctness',
    title: 'Shared component state object',
    description:
      'One object literal is created once and shared by every instance, so state written by one ' +
      'instance shows up in all of them.',
  },
  {
    id: 'correctness.no-side-effects-in-computed-properties',
    group: 'correctness',
    title: 'Side effect in a computed property',
    description:
      'A computed property is cached and re-evaluated on demand, so a side effect inside one fires an ' +
      'unpredictable number of times and at times nothing in the code shows.',
  },
  {
    id: 'correctness.no-single-promise-in-promise-methods',
    group: 'correctness',
    title: 'Single promise in a combinator',
    description:
      'A one-element array yields a one-element result, which is almost never the shape the caller ' +
      'then destructures — the array wrapper is usually a leftover.',
  },
  {
    id: 'correctness.no-static-element-interactions',
    group: 'correctness',
    title: 'Handler on an element with no role',
    description:
      'A `div` or `span` carrying event handlers is reported as plain content, so assistive ' +
      'technology never presents it as something that can be operated.',
  },
  {
    id: 'correctness.no-string-refs',
    group: 'correctness',
    title: 'Ref given as a string',
    description:
      'String refs were removed in React 19, and where they still work they resolve through a legacy ' +
      'owner lookup that fails under any modern rendering path.',
  },
  {
    id: 'correctness.no-sync-scripts',
    group: 'correctness',
    title: 'Parser-blocking script',
    description:
      'A script with neither `async` nor `defer` halts parsing until it has downloaded and run, so ' +
      'first paint is delayed by the length of that request.',
  },
  {
    id: 'correctness.no-thenable',
    group: 'correctness',
    title: 'Object with a `then` property',
    description:
      'Anything with a `then` method is treated as a promise by `await` and by promise resolution, so ' +
      'the object is unwrapped at points where it was meant to be passed through intact.',
  },
  {
    id: 'correctness.no-this-alias',
    group: 'correctness',
    title: 'Alias for `this`',
    description:
      'Capturing `this` in a local variable works around a scoping problem an arrow function already ' +
      'solves, and leaves two names for one object that later readers must keep in step.',
  },
  {
    id: 'correctness.no-this-in-before-route-enter',
    group: 'correctness',
    title: 'Instance access before the route is entered',
    description:
      'This guard runs before the component instance exists, so `this` is undefined and every ' +
      'property read through it throws.',
  },
  {
    id: 'correctness.no-this-in-sfc',
    group: 'correctness',
    title: '`this` inside a function component',
    description:
      'A function component receives its props as an argument, so `this` is undefined or the module ' +
      'scope and every property read from it is wrong.',
  },
  {
    id: 'correctness.no-unassigned-vars',
    group: 'correctness',
    title: 'Variable read but never assigned',
    description:
      'A binding that is read but never written is always `undefined`, so every use of it operates ' +
      'on a value nothing ever produced.',
  },
  {
    id: 'correctness.no-unnecessary-await',
    group: 'correctness',
    title: 'Await on a non-promise',
    description:
      'Awaiting a plain value still yields to the microtask queue, so it costs a turn and advertises ' +
      'an asynchronous boundary that does not exist.',
  },
  {
    id: 'correctness.no-unnecessary-parameter-property-assignment',
    group: 'correctness',
    title: 'Redundant parameter property assignment',
    description:
      'A constructor parameter carrying a visibility modifier is already assigned to the instance, so ' +
      'assigning it again duplicates the write and hides which one is authoritative.',
  },
  {
    id: 'correctness.no-unsafe-declaration-merging',
    group: 'correctness',
    title: 'Class merged with an interface',
    description:
      'The interface can declare members the class never initialises, and the compiler does not ' +
      'check them, so the `undefined` only shows up at runtime.',
  },
  {
    id: 'correctness.no-unused-labels',
    group: 'correctness',
    title: 'Unused label',
    description:
      'A label nothing jumps to is dead syntax, usually left behind when the `break` or `continue` ' +
      'that referred to it was removed.',
  },
  {
    id: 'correctness.no-unused-private-class-members',
    group: 'correctness',
    title: 'Unused private class member',
    description:
      'A private member nothing reads cannot be reached from outside the class either, so it is ' +
      'unreachable code that still ships.',
  },
  {
    id: 'correctness.no-useless-backreference',
    group: 'correctness',
    title: 'Backreference that can never match',
    description:
      'A backreference to a group that cannot have participated yet always compares against the ' +
      'empty string, so the pattern matches more than it appears to.',
  },
  {
    id: 'correctness.no-useless-catch',
    group: 'correctness',
    title: 'Catch that only rethrows',
    description:
      'Catching an error and immediately rethrowing it changes nothing except to make the code look ' +
      'as though the failure is handled here.',
  },
  {
    id: 'correctness.no-useless-empty-export',
    group: 'correctness',
    title: 'Empty export in a module',
    description:
      '`export {}` exists to turn a script into a module. In a file that already has imports or ' +
      'exports it asserts nothing and reads as an unfinished edit.',
  },
  {
    id: 'correctness.no-useless-escape',
    group: 'correctness',
    title: 'Unnecessary escape',
    description:
      'A backslash before a character that needs no escaping is dropped, so the string or pattern ' +
      'does not contain what the source appears to spell.',
  },
  {
    id: 'correctness.no-useless-fallback-in-spread',
    group: 'correctness',
    title: 'Redundant fallback in a spread',
    description:
      'Spreading a falsy value contributes no properties, so the `|| {}` beside it guards against ' +
      'something that cannot happen.',
  },
  {
    id: 'correctness.no-useless-length-check',
    group: 'correctness',
    title: 'Length check that cannot change the result',
    description:
      '`every` already returns true for an empty array and `some` already returns false, so the ' +
      'length test beside either one can never alter the outcome.',
  },
  {
    id: 'correctness.no-useless-rename',
    group: 'correctness',
    title: 'Rename to the same name',
    description: 'Renaming a binding to the name it already has adds a second spelling of one thing to read past.',
  },
  {
    id: 'correctness.no-useless-spread',
    group: 'correctness',
    title: 'Spread of a fresh literal',
    description:
      'Spreading a literal into a literal of the same kind, or cloning a structure created inline, ' +
      'allocates a second one and copies it for no observable difference.',
  },
  {
    id: 'correctness.no-watch-after-await',
    group: 'correctness',
    title: 'Watcher registered after `await`',
    description:
      'A watcher created after an `await` in setup is not bound to the component lifetime, so it ' +
      'outlives the component or never fires at all.',
  },
  {
    id: 'correctness.no-will-update-set-state',
    group: 'correctness',
    title: 'State set while an update is in flight',
    description:
      'Updating state during the update itself leaves the resulting state dependent on render ' +
      'timing rather than on the change that caused the update.',
  },
  {
    id: 'correctness.no-with',
    group: 'correctness',
    title: 'Scope extended by an object',
    description:
      '`with` puts an object\'s properties into scope, so neither a reader nor an optimiser can tell ' +
      'whether a name inside the block is a variable or a property.',
  },
  {
    id: 'correctness.no-wrapper-object-types',
    group: 'correctness',
    title: 'Boxed primitive used as a type',
    description:
      '`String`, `Number` and `Boolean` describe the wrapper objects rather than the primitives, so ' +
      'the annotation rejects ordinary values and accepts boxed ones.',
  },
  {
    id: 'correctness.number-arg-out-of-range',
    group: 'correctness',
    title: 'Numeric argument out of range',
    description:
      'A radix or precision outside the range the method accepts makes the call throw a `RangeError` ' +
      'rather than clamp.',
  },
  {
    id: 'correctness.only-used-in-recursion',
    group: 'correctness',
    title: 'Parameter used only in recursion',
    description:
      'A parameter passed along the recursion but never otherwise read carries no information out, so ' +
      'every call site computes an argument nothing consumes.',
  },
  {
    id: 'correctness.prefer-as-const',
    group: 'correctness',
    title: 'Literal type restated as an annotation',
    description:
      'Annotating a literal with its own literal type duplicates the value in the type position, and ' +
      'the two silently stop agreeing the moment one is edited.',
  },
  {
    id: 'correctness.prefer-import-from-vue',
    group: 'correctness',
    title: 'Import from an internal package',
    description:
      'The internal packages can resolve to a different copy than the application uses, leaving two ' +
      "reactivity systems that do not observe each other's updates.",
  },
  {
    id: 'correctness.prefer-namespace-keyword',
    group: 'correctness',
    title: 'Deprecated namespace keyword',
    description:
      'The `module` keyword for an internal namespace is deprecated and reads as an external module ' +
      'declaration, which means something else entirely.',
  },
  {
    id: 'correctness.prefer-set-size',
    group: 'correctness',
    title: 'Array allocated only to be counted',
    description:
      'Converting a set to an array to read its length allocates the whole array to obtain a number ' +
      'the set already holds.',
  },
  {
    id: 'correctness.prefer-string-starts-ends-with',
    group: 'correctness',
    title: 'Anchored pattern instead of a prefix test',
    description:
      'An anchored regular expression compiles a pattern and runs the engine to answer a question a ' +
      'direct string comparison answers outright.',
  },
  {
    id: 'correctness.prefer-tag-over-role',
    group: 'correctness',
    title: 'Role where an element would do',
    description:
      'A role that duplicates what a semantic element already means gives up everything else the ' +
      'element provides: focus behaviour, keyboard handling, and default semantics.',
  },
  {
    id: 'correctness.require-awaited-expect-poll',
    group: 'correctness',
    title: 'Unawaited polling assertion',
    description:
      'Polling assertions return promises. Unawaited, the test finishes before the assertion settles ' +
      'and passes regardless of the outcome.',
  },
  {
    id: 'correctness.require-local-test-context-for-concurrent-snapshots',
    group: 'correctness',
    title: 'Concurrent snapshot outside its test context',
    description:
      'The shared assertion object cannot tell which concurrent test it is being used from, so ' +
      "snapshots taken through it are matched against another test's entries.",
  },
  {
    id: 'correctness.require-mock-type-parameters',
    group: 'correctness',
    title: 'Untyped mock function',
    description:
      'A mock created without a type parameter accepts any arguments and returns `any`, so it stops ' +
      'resembling the function it stands in for and nothing reports the drift when that signature ' +
      'changes.',
  },
  {
    id: 'correctness.require-prop-type-constructor',
    group: 'correctness',
    title: 'Prop type given as a literal',
    description:
      'A type written as a string looks like the constructor but matches nothing, so runtime ' +
      'validation warns on every value and never actually checks the type.',
  },
  {
    id: 'correctness.require-render-return',
    group: 'correctness',
    title: 'Render function with no return',
    description:
      'A path that falls through returns `undefined`, and the component renders nothing rather than ' +
      'reporting a failure.',
  },
  {
    id: 'correctness.require-slots-as-functions',
    group: 'correctness',
    title: 'Slot used as a value',
    description:
      'In Vue 3 a slot is a render function, so treating one as an array of nodes throws as soon as ' +
      'that branch renders.',
  },
  {
    id: 'correctness.return-in-computed-property',
    group: 'correctness',
    title: 'Computed property with no return',
    description:
      'A getter that returns nothing yields `undefined`, which propagates silently into every ' +
      'template and watcher that reads the property.',
  },
  {
    id: 'correctness.return-in-emits-validator',
    group: 'correctness',
    title: 'Emit validator with no return',
    description:
      'A validator that returns nothing is falsy, so every payload it is given is reported invalid ' +
      'and the warning it produces says nothing about the real cause.',
  },
  {
    id: 'correctness.return-in-finally',
    group: 'correctness',
    title: 'Value returned from a finally block',
    description:
      'A `return` inside `finally` replaces whatever the `try` or `catch` was returning, and discards an ' +
      'in-flight exception with it, so an error disappears with no trace that it happened.',
  },
  {
    id: 'correctness.role-has-required-aria-props',
    group: 'correctness',
    title: 'Role missing a required attribute',
    description:
      'A role whose required attributes are absent is exposed incompletely, so assistive technology ' +
      "cannot describe the control's current state.",
  },
  {
    id: 'correctness.role-supports-aria-props',
    group: 'correctness',
    title: 'Attribute unsupported by the role',
    description:
      'An `aria-*` attribute the element\'s role does not support is ignored, so the state it ' +
      'describes is never announced.',
  },
  {
    id: 'correctness.rules-of-hooks',
    group: 'correctness',
    title: 'Hook called outside the top level of a component',
    description:
      'React identifies hooks by call order, so one behind a condition, a loop or an early return shifts ' +
      'every later hook onto the wrong slot and the component reads another one\'s state.',
  },
  {
    id: 'correctness.scope',
    group: 'correctness',
    title: 'Header scope outside a table header',
    description:
      '`scope` associates a header with its row or column only on a `<th>`; anywhere else it is ' +
      "ignored and the table's structure stays unannounced.",
  },
  {
    id: 'correctness.tabindex-no-positive',
    group: 'correctness',
    title: 'Positive tab index',
    description:
      'A positive tab index moves the element ahead of everything in document order, so the tab ' +
      'sequence stops matching what is on screen.',
  },
  {
    id: 'correctness.triple-slash-reference',
    group: 'correctness',
    title: 'Triple-slash reference directive',
    description:
      'A triple-slash reference pulls in types through a mechanism outside the module graph, so ' +
      'bundlers and module resolution never see the dependency it creates.',
  },
  {
    id: 'correctness.uninvoked-array-callback',
    group: 'correctness',
    title: 'Callback over empty array slots',
    description:
      'An array built from a length has empty slots rather than `undefined` values, and array ' +
      'callbacks skip empty slots, so the callback never runs once.',
  },
  {
    id: 'correctness.valid-define-emits',
    group: 'correctness',
    title: 'Malformed emits declaration',
    description:
      'The macro is erased at compile time, so referencing a local variable or supplying both a type ' +
      'and an argument leaves it unable to produce the declaration it stands for.',
  },
  {
    id: 'correctness.valid-define-options',
    group: 'correctness',
    title: 'Malformed options declaration',
    description:
      'The macro is evaluated at compile time, so anything it references must be statically known — ' +
      'and props or emits declared through it are ignored rather than merged.',
  },
  {
    id: 'correctness.valid-define-props',
    group: 'correctness',
    title: 'Malformed props declaration',
    description:
      'The macro is erased at compile time, so referencing a local variable or supplying both a type ' +
      'and an argument leaves it unable to produce the declaration it stands for.',
  },
  {
    id: 'correctness.valid-next-tick',
    group: 'correctness',
    title: 'Malformed tick callback',
    description:
      'The function either takes a callback or returns a promise. Reading it as a value, or both ' +
      'awaiting it and passing a callback, means the continuation does not run when intended.',
  },
  {
    id: 'correctness.vitest-expect-expect',
    group: 'correctness',
    title: 'Test with no assertion',
    description:
      'A test that asserts nothing passes as long as nothing throws, so it reports success without ' +
      'having checked the behaviour it is named for.',
  },
  {
    id: 'correctness.vitest-no-conditional-expect',
    group: 'correctness',
    title: 'Assertion inside a conditional',
    description:
      'An assertion in a branch or `catch` does not run when that path is not taken, so the test ' +
      'reports success without having checked anything.',
  },
  {
    id: 'correctness.vitest-no-focused-tests',
    group: 'correctness',
    title: 'Focused test',
    description:
      'Focusing a test silently reduces the file to that one test, so a committed `.only` stops the ' +
      'rest from running anywhere, including in CI.',
  },
  {
    id: 'correctness.vitest-no-standalone-expect',
    group: 'correctness',
    title: 'Assertion outside a test',
    description:
      'An assertion at file scope runs while tests are being collected rather than as part of one, ' +
      'so its failure is attributed to nothing and may not fail the run.',
  },
  {
    id: 'correctness.vitest-prefer-snapshot-hint',
    group: 'correctness',
    title: 'Snapshot with no hint',
    description:
      'Auto-numbered snapshots shift when an assertion is added or reordered, so unrelated snapshots ' +
      'appear changed and the real difference is buried among them.',
  },
  {
    id: 'correctness.vitest-require-to-throw-message',
    group: 'correctness',
    title: 'Throw assertion with no expected message',
    description:
      'An unqualified throw assertion passes for any error, including one raised for a completely ' +
      'different reason than the test is about.',
  },
  {
    id: 'correctness.vitest-valid-describe-callback',
    group: 'correctness',
    title: 'Malformed suite callback',
    description:
      'A suite callback that takes parameters or returns a value does not register its tests the way ' +
      'the runner expects, so some or all of them never run.',
  },
  {
    id: 'correctness.vitest-valid-expect-in-promise',
    group: 'correctness',
    title: 'Unawaited assertion in a promise chain',
    description:
      'An assertion inside a promise callback that is neither awaited nor returned settles after the ' +
      'test has already finished, so a failure is never attributed to it.',
  },
  {
    id: 'correctness.vitest-valid-title',
    group: 'correctness',
    title: 'Unusable test title',
    description:
      'An empty title, a non-string one, or one that repeats its block name leaves the failure ' +
      'output with no usable description of what broke.',
  },
  {
    id: 'correctness.void-dom-elements-no-children',
    group: 'correctness',
    title: 'Children on a void element',
    description:
      'Void elements such as `<img>` and `<br>` cannot contain anything, so children handed to one ' +
      'are dropped and the intended content never renders.',
  },
  {
    id: 'correctness.vue-no-dupe-keys',
    group: 'correctness',
    title: 'Duplicate field name',
    description:
      'A name declared twice across props, data, computed, methods and setup resolves to one of them ' +
      'on the instance, so the other is unreachable from the template.',
  },
  {
    id: 'correctness.warn-todo',
    group: 'correctness',
    title: 'Pending test placeholder',
    description:
      'A `.todo` entry reports as pending rather than failing, so an unimplemented test blocks ' +
      'nothing and reads as covered in the summary.',
  },
  {
    id: 'dead-code.useless-assignment',
    group: 'dead-code',
    title: 'Value assigned and never read',
    description:
      'The assigned value is overwritten or goes out of scope before anything reads it. Usually the line ' +
      'that was meant to read it is missing, so this is a symptom rather than untidiness.',
  },
  {
    id: 'pedantic.prefer-ts-expect-error',
    group: 'pedantic',
    title: 'Suppression that outlives its error',
    description:
      '`@ts-ignore` stays silent once the error beneath it is fixed, so the suppression accumulates ' +
      'and hides the next error on that line. `@ts-expect-error` fails when it is no longer needed.',
  },
  {
    id: 'perf.useless-iterator-to-array',
    group: 'perf',
    title: 'Iterator materialised for no reason',
    description:
      'Collecting an iterator into an array only to iterate it once allocates the whole sequence to read ' +
      'it in order, which is what the iterator already did.',
  },
  {
    id: 'restriction.no-import-type-side-effects',
    group: 'restriction',
    title: 'Type-only import that still emits',
    description:
      'Under `verbatimModuleSyntax` an import whose specifiers are all inline `type` still emits an ' +
      'import statement, so the module is loaded at runtime purely for its side effects.',
  },
  {
    id: 'restriction.no-non-null-asserted-nullish-coalescing',
    group: 'restriction',
    title: 'Non-null assertion before a nullish fallback',
    description:
      '`??` exists to handle a null or undefined left operand, so asserting that operand non-null ' +
      'claims the fallback is unreachable. One of the two is wrong.',
  },
  {
    id: 'security.dangerous-html',
    group: 'security',
    title: 'Markup written to the DOM unescaped',
    description:
      'Setting inner HTML from a value bypasses every escape the framework would have applied, so any part ' +
      'of it that came from outside the program is executed rather than displayed.',
  },
  {
    id: 'security.target-blank',
    group: 'security',
    title: 'New tab opened without `noopener`',
    description:
      'A page opened with `target="_blank"` receives a handle to the opener and can navigate it, so a link ' +
      'to somewhere untrusted can replace the tab behind it with a copy of itself.',
  },
  {
    id: 'suspicious.always-return',
    group: 'suspicious',
    title: 'Promise callback with no return',
    description:
      'A `then` callback that starts work without returning it breaks the chain: the next `then` runs ' +
      'immediately, before the inner work has settled, and its rejection is unhandled.',
  },
  {
    id: 'suspicious.consistent-function-scoping',
    group: 'suspicious',
    title: 'Function nested deeper than it needs',
    description:
      'A function that captures nothing from the scope around it is rebuilt on every call of its ' +
      'parent, and its placement implies a dependency on that scope which does not exist.',
  },
  {
    id: 'suspicious.no-empty-named-blocks',
    group: 'suspicious',
    title: 'Empty named import block',
    description:
      'An import with empty braces loads the module for its side effects while reading as though it ' +
      'imports names, and is usually the residue of a deleted binding.',
  },
  {
    id: 'suspicious.no-unstable-nested-components',
    group: 'suspicious',
    title: 'Component defined inside a component',
    description:
      'A component created during render has a new identity on every render, so the whole subtree is ' +
      'unmounted and rebuilt each time the parent updates, discarding its DOM and state.',
  },
  {
    id: 'suspicious.require-module-specifiers',
    group: 'suspicious',
    title: 'Empty specifier list',
    description:
      'An import or export with empty braces is either a side-effect import written the long way or ' +
      'what a removed binding left behind.',
  },
] as const satisfies readonly ConceptDefinition[]
