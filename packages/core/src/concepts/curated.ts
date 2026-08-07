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
    id: 'correctness.await-thenable',
    group: 'correctness',
    title: 'Await on something that is not a promise',
    description:
      'Awaiting a plain value yields it after an unnecessary microtask, and awaiting a function instead ' +
      'of its call awaits the function object — which resolves immediately and skips the work entirely.',
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
    id: 'correctness.check-property-names',
    group: 'correctness',
    title: 'Documented property that does not exist',
    description:
      'A `@property` naming something the type does not declare, or naming it twice, documents a shape ' +
      'callers cannot rely on.',
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
    id: 'correctness.control-has-associated-label',
    group: 'correctness',
    title: 'Interactive control with no accessible name',
    description:
      'A control with no label, title or accessible text is announced by its role alone, so a screen ' +
      'reader user is told there is a button and not what it does.',
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
      "the caller’s ref stays null and the wrapper serves no purpose.",
  },
  {
    id: 'correctness.google-font-display',
    group: 'correctness',
    title: 'Web font loaded without a display strategy',
    description:
      'Without `display=swap` the text stays invisible while the font downloads, so a slow connection ' +
      'shows an empty page rather than unstyled words.',
  },
  {
    id: 'correctness.google-font-preconnect',
    group: 'correctness',
    title: 'Font host contacted without a preconnect',
    description:
      'The connection to the font host is opened only when the stylesheet is parsed, which adds a full ' +
      'round trip to the point at which text can first be painted.',
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
    id: 'correctness.implements-on-classes',
    group: 'correctness',
    title: '`@implements` on something that is not a constructor',
    description:
      'The tag only means anything on a class or a constructor function; elsewhere the interface it ' +
      'claims to satisfy is never checked against anything.',
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
    id: 'correctness.jest-expect-expect',
    group: 'correctness',
    title: 'Test that asserts nothing',
    description:
      'A test body with no assertion passes whatever the code does, so it reports coverage of a ' +
      'behaviour nobody is checking.',
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
    id: 'correctness.jest-no-disabled-tests',
    group: 'correctness',
    title: 'Test switched off in place',
    description:
      'A skipped test still appears in the suite and still reports as part of it, so the behaviour it ' +
      'covered goes unchecked without the count going down.',
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
    id: 'correctness.next-script-for-ga',
    group: 'correctness',
    title: 'Analytics loaded with a raw script tag',
    description:
      'A bare `<script>` blocks parsing and is re-run on client navigation, which the framework’s ' +
      'script component exists to avoid.',
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
    id: 'correctness.no-array-delete',
    group: 'correctness',
    title: '`delete` used on an array element',
    description:
      '`delete` removes the property and leaves the length alone, so the array keeps a hole that reads ' +
      'as `undefined` and that `map` and `forEach` skip without saying so.',
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
      "Declaring `module` shadows the identifier the framework’s own module handling relies on, " +
      'breaking the page in ways that point nowhere near this declaration.',
  },
  {
    id: 'correctness.no-async-client-component',
    group: 'correctness',
    title: 'Client component declared `async`',
    description:
      'Only server components may be async; a client component that returns a promise renders as ' +
      'nothing and the error names the component rather than the `async` keyword.',
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
    id: 'correctness.no-base-to-string',
    group: 'correctness',
    title: 'Value stringified to `[object Object]`',
    description:
      'Converting a value whose type has no meaningful `toString` produces `[object Object]`, which ' +
      'reaches a log, a key or a user interface as text that identifies nothing.',
  },
  {
    id: 'correctness.no-before-interactive-script-outside-document',
    group: 'correctness',
    title: '`beforeInteractive` script outside the document',
    description:
      'The strategy only takes effect in the custom document; anywhere else the script loads at the ' +
      'normal time and the guarantee it was chosen for does not hold.',
  },
  {
    id: 'correctness.no-callback-in-promise',
    group: 'correctness',
    title: 'Callback invoked from inside a promise chain',
    description:
      'Mixing a node-style callback into `then` puts the callback’s own throw inside the promise, where ' +
      'it is converted to a rejection nobody is watching for.',
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
    id: 'correctness.no-css-tags',
    group: 'correctness',
    title: 'Stylesheet linked by hand',
    description:
      'A hand-written `<link>` to a stylesheet skips the bundler, so the file is neither hashed nor ' +
      'preloaded and a deploy can serve a stale copy.',
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
    id: 'correctness.no-defaults',
    group: 'correctness',
    title: 'Default value written into a documentation tag',
    description:
      'A default restated in a `@param` tag is a second copy of what the signature already says, and ' +
      'the two drift apart the first time either changes.',
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
    id: 'correctness.no-duplicate-type-constituents',
    group: 'correctness',
    title: 'Union or intersection member repeated',
    description:
      'The same type listed twice in a union or intersection narrows nothing the single occurrence did ' +
      'not, and usually marks a member someone meant to change rather than repeat.',
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
    id: 'correctness.no-floating-promises',
    group: 'correctness',
    title: 'Promise nobody waits for',
    description:
      'A promise created and neither awaited nor handled runs outside the caller’s control flow: its ' +
      'errors surface as an unhandled rejection long after the call, and its work may not finish before ' +
      'the process exits.',
  },
  {
    id: 'correctness.no-for-in-array',
    group: 'correctness',
    title: '`for…in` over an array',
    description:
      '`for…in` walks string keys, including inherited ones, so the loop variable is a string index ' +
      'rather than an element and any property added to the prototype joins the iteration.',
  },
  {
    id: 'correctness.no-head-element',
    group: 'correctness',
    title: 'Raw `<head>` element used',
    description:
      'A literal `<head>` is not merged or deduplicated, so tags it contains can be emitted twice and ' +
      'the later one silently wins.',
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
      "A raw image element bypasses the framework’s image pipeline, so the file ships at full size " +
      'in its original format and delays the largest contentful paint.',
  },
  {
    id: 'correctness.no-implied-eval',
    group: 'correctness',
    title: 'Code compiled from a string',
    description:
      'Passing a string to `setTimeout`, `setInterval` or `Function` compiles it at run time with the ' +
      'privileges of the caller, which is `eval` reached through a different name.',
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
    id: 'correctness.no-meaningless-void-operator',
    group: 'correctness',
    title: '`void` applied to something already undefined',
    description:
      '`void` exists to discard a value; applying it to an expression that has none says nothing and ' +
      'hides whether the author meant to discard a result that used to be there.',
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
    id: 'correctness.no-page-custom-font',
    group: 'correctness',
    title: 'Custom font declared on one page',
    description:
      'A font linked from a page rather than the document is re-requested on every navigation to it and ' +
      'blocks that page’s first paint each time.',
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
    id: 'correctness.no-redundant-type-constituents',
    group: 'correctness',
    title: 'Union member the rest already covers',
    description:
      'A member absorbed by another — `string | any`, `number | never` — collapses on assignment, so ' +
      'the type checks far less than it appears to.',
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
    id: 'correctness.no-styled-jsx-in-document',
    group: 'correctness',
    title: '`styled-jsx` used in the custom document',
    description:
      'The document renders once on the server with no styled-jsx runtime, so the styles are dropped ' +
      'without any error being raised.',
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
    id: 'correctness.no-title-in-document-head',
    group: 'correctness',
    title: '`<title>` placed in the custom document',
    description:
      'A title there cannot be overridden per page, so every route inherits it and the per-page title ' +
      'is ignored.',
  },
  {
    id: 'correctness.no-typos',
    group: 'correctness',
    title: 'Misspelled framework data function',
    description:
      'The framework matches these exports by exact name, so a misspelling is not an error — the export ' +
      'is simply never called and the page renders without its data.',
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
    id: 'correctness.no-unsafe',
    group: 'correctness',
    title: 'Deprecated unsafe lifecycle method',
    description:
      'These lifecycles are not called in concurrent rendering and are scheduled for removal, so the ' +
      'setup they perform silently stops happening.',
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
    id: 'correctness.no-unsafe-unary-minus',
    group: 'correctness',
    title: 'Negation applied to something that is not a number',
    description:
      'Unary minus coerces its operand, so negating a string or an object yields `NaN` and every ' +
      'comparison downstream of it silently becomes false.',
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
    id: 'correctness.no-unwanted-polyfillio',
    group: 'correctness',
    title: 'Polyfill already shipped by the framework',
    description:
      'Requesting a polyfill the bundle already contains adds a blocking request for code that is ' +
      'present, and the two can disagree about which implementation wins.',
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
    id: 'correctness.no-useless-default-assignment',
    group: 'correctness',
    title: 'Default that can never apply',
    description:
      'A default value on a parameter or a destructured property whose type excludes `undefined` is ' +
      'dead: the branch that would use it cannot be reached or tested.',
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
    id: 'correctness.require-array-sort-compare',
    group: 'correctness',
    title: '`sort` without a comparator',
    description:
      'The default comparator converts each element to a string, so numbers order as `1, 10, 2` and ' +
      'objects compare as `[object Object]` — stable, and almost never the order that was wanted.',
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
    id: 'correctness.require-property',
    group: 'correctness',
    title: 'Documented object type with no properties listed',
    description:
      'A `@typedef` for an object that names none of its properties documents that the type exists and ' +
      'nothing about what it holds.',
  },
  {
    id: 'correctness.require-property-description',
    group: 'correctness',
    title: 'Documented property with no description',
    description:
      'A `@property` tag carrying only a name and a type repeats the declaration and adds nothing a ' +
      'reader could not already see.',
  },
  {
    id: 'correctness.require-property-name',
    group: 'correctness',
    title: 'Documented property with no name',
    description:
      'A `@property` tag without a name cannot be matched to anything in the type, so it documents ' +
      'nothing and no tool can check it.',
  },
  {
    id: 'correctness.require-property-type',
    group: 'correctness',
    title: 'Documented property with no type',
    description:
      'A `@property` tag without a type leaves the shape unstated in a block whose purpose is to state ' +
      'it.',
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
    id: 'correctness.require-yields',
    group: 'correctness',
    title: 'Generator whose yielded value is undocumented',
    description:
      'A generator documented without `@yields` describes how it is called and not what it produces, ' +
      'which is the half a caller needs.',
  },
  {
    id: 'correctness.restrict-template-expressions',
    group: 'correctness',
    title: 'Value interpolated that has no useful text form',
    description:
      'Interpolating an object, a nullable or an `any` into a template puts `[object Object]`, `null` ' +
      'or whatever the value happens to be into text a person or a machine reads.',
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
    id: 'correctness.valid-params',
    group: 'correctness',
    title: 'Promise method called with the wrong number of arguments',
    description:
      '`then`, `catch` and `finally` take a fixed number of handlers; extra or missing ones are ' +
      'ignored, so the handler that was meant to run never does.',
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
    id: 'correctness.vitest-no-disabled-tests',
    group: 'correctness',
    title: 'Test switched off in place',
    description:
      'A skipped test still appears in the suite and still reports as part of it, so the behaviour it ' +
      'covered goes unchecked without the count going down.',
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
    id: 'pedantic.array-callback-return',
    group: 'pedantic',
    title: 'Array callback that returns nothing',
    description:
      '`map`, `filter` and `reduce` read the callback’s return value; a body that falls off its end ' +
      'fills the result with `undefined` and the loop looks like it worked.',
  },
  {
    id: 'pedantic.ban-ts-comment',
    group: 'pedantic',
    title: 'Type error suppressed without a reason',
    description:
      'A `@ts-ignore`, or a `@ts-expect-error` with nothing written beside it, hides a diagnostic and ' +
      'records nothing about why. `@ts-ignore` also stays silent once the error underneath it is gone.',
  },
  {
    id: 'pedantic.ban-types',
    group: 'pedantic',
    title: 'Type that means less than it looks like',
    description:
      '`Object`, `Function` and the boxed primitives accept far more than their names suggest, so the ' +
      'annotation checks almost nothing.',
  },
  {
    id: 'pedantic.branches-sharing-code',
    group: 'pedantic',
    title: 'Both branches beginning or ending the same way',
    description:
      'Statements shared by every branch belong outside the condition, where a change reaches all of ' +
      'them instead of one.',
  },
  {
    id: 'pedantic.checked-requires-onchange-or-readonly',
    group: 'pedantic',
    title: 'Controlled input with no way to change',
    description:
      'An input given `checked` without a change handler or `readOnly` ignores every click, and the ' +
      'framework logs a warning rather than fixing it.',
  },
  {
    id: 'pedantic.consistent-empty-array-spread',
    group: 'pedantic',
    title: 'Conditional spread that changes type by branch',
    description:
      'Spreading an array in one branch and a non-array in the other produces different shapes from one ' +
      'expression, which the type is unable to describe.',
  },
  {
    id: 'pedantic.display-name',
    group: 'pedantic',
    title: 'Component with no name to report',
    description:
      'Without a name the component appears as `Unknown` in a stack trace, in the developer tools and ' +
      'in every error boundary above it.',
  },
  {
    id: 'pedantic.eqeqeq',
    group: 'pedantic',
    title: 'Loose equality between values that can coerce',
    description:
      '`==` converts before comparing, so `0 == ’’` and `null == undefined` are true and a comparison ' +
      'passes for a value the author did not have in mind.',
  },
  {
    id: 'pedantic.jsx-no-useless-fragment',
    group: 'pedantic',
    title: 'Fragment wrapping a single child',
    description:
      'A fragment around one element adds a node to the tree that the reconciler walks and the reader ' +
      'has to look past.',
  },
  {
    id: 'pedantic.new-for-builtins',
    group: 'pedantic',
    title: 'Built-in called with the wrong construction form',
    description:
      'Some built-ins must be called with `new` and some must not, and the wrong form yields an object ' +
      'where a primitive was wanted or throws outright.',
  },
  {
    id: 'pedantic.no-array-constructor',
    group: 'pedantic',
    title: 'Array built with its constructor',
    description:
      '`new Array(3)` makes three holes and `new Array(3, 4)` makes two elements, so the same call ' +
      'means different things depending on how many arguments it has.',
  },
  {
    id: 'pedantic.no-case-declarations',
    group: 'pedantic',
    title: 'Declaration inside a switch case',
    description:
      'A `let`, `const` or `class` in a case is scoped to the whole switch, so a later case can reach a ' +
      'binding whose initialiser never ran.',
  },
  {
    id: 'pedantic.no-constructor-return',
    group: 'pedantic',
    title: 'Constructor that returns a value',
    description:
      'Returning an object from a constructor discards the instance `new` created, so the class’s own ' +
      'initialisation is thrown away.',
  },
  {
    id: 'pedantic.no-deprecated',
    group: 'pedantic',
    title: 'Deprecated API used',
    description:
      'The declaration says it is going away, so the call compiles today and stops compiling on an ' +
      'upgrade nobody scheduled.',
  },
  {
    id: 'pedantic.no-fallthrough',
    group: 'pedantic',
    title: 'Case that falls into the next one',
    description:
      'Without a `break` the following case also runs, and nothing distinguishes the deliberate ' +
      'fall-through from the missing statement.',
  },
  {
    id: 'pedantic.no-hex-escape',
    group: 'pedantic',
    title: 'Escape written with a leading zero',
    description:
      '`\\x0a` and `\\u000a` are the same character written two ways, and the padded form invites a ' +
      'reader to count digits that do not matter.',
  },
  {
    id: 'pedantic.no-inner-declarations',
    group: 'pedantic',
    title: 'Function declared inside a block',
    description:
      'How a declaration in a block is hoisted differs between strict and sloppy mode, so what the name ' +
      'refers to before that line depends on the file’s mode.',
  },
  {
    id: 'pedantic.no-instanceof-array',
    group: 'pedantic',
    title: 'Array checked with `instanceof`',
    description:
      'An array from another realm has a different constructor, so the check is false for something ' +
      'that is exactly an array. `Array.isArray` is not.',
  },
  {
    id: 'pedantic.no-misused-promises',
    group: 'pedantic',
    title: 'Promise passed where a plain value belongs',
    description:
      'A promise in a condition is always truthy, and an async function given to something expecting ' +
      '`void` runs unawaited with its rejection unhandled.',
  },
  {
    id: 'pedantic.no-mixed-enums',
    group: 'pedantic',
    title: 'Enum mixing numbers and strings',
    description:
      'Numeric members get a reverse mapping and string ones do not, so iterating the enum yields a ' +
      'different set depending on which member is read.',
  },
  {
    id: 'pedantic.no-negation-in-equality-check',
    group: 'pedantic',
    title: 'Negation applied before a comparison',
    description:
      '`!a === b` negates first and compares a boolean, which is almost never the `a !== b` it was ' +
      'written to mean.',
  },
  {
    id: 'pedantic.no-new-buffer',
    group: 'pedantic',
    title: 'Buffer allocated with its constructor',
    description:
      '`new Buffer(n)` returns memory that was never cleared, so the contents are whatever the process ' +
      'last had there.',
  },
  {
    id: 'pedantic.no-new-wrappers',
    group: 'pedantic',
    title: 'Primitive wrapped in its object form',
    description:
      '`new Boolean(false)` is an object and every object is truthy, so the value tests as the opposite ' +
      'of what it holds.',
  },
  {
    id: 'pedantic.no-object-as-default-parameter',
    group: 'pedantic',
    title: 'Object literal as a default parameter',
    description:
      'The default is one object shared by nothing — it is rebuilt per call — but its identity changes ' +
      'every time, so anything memoising on it never hits.',
  },
  {
    id: 'pedantic.no-object-constructor',
    group: 'pedantic',
    title: 'Object built with its constructor',
    description:
      '`Object()` returns its argument when given one, so the call produces a number or a string ' +
      'wherever an empty object was expected.',
  },
  {
    id: 'pedantic.no-prototype-builtins',
    group: 'pedantic',
    title: 'Prototype method called directly on an object',
    description:
      'An object used as a map can carry a key called `hasOwnProperty`, or have no prototype at all, ' +
      'and the call then throws or answers about the data.',
  },
  {
    id: 'pedantic.no-redeclare',
    group: 'pedantic',
    title: 'Name declared twice in one scope',
    description:
      'The second declaration wins silently, so one of the two initialisers never takes effect and ' +
      'neither line says which.',
  },
  {
    id: 'pedantic.no-self-compare',
    group: 'pedantic',
    title: 'Value compared against itself',
    description:
      'The result is fixed except for `NaN`, so the comparison either always holds or is a `NaN` check ' +
      'written in a way nobody reads as one.',
  },
  {
    id: 'pedantic.no-static-only-class',
    group: 'pedantic',
    title: 'Class holding only static members',
    description:
      'A class used as a namespace cannot be tree-shaken, and it invites an instantiation that produces ' +
      'an object with nothing on it.',
  },
  {
    id: 'pedantic.no-this-assignment',
    group: 'pedantic',
    title: '`this` copied into a variable',
    description:
      'Aliasing the receiver predates arrow functions, and the alias outlives the scope it was captured ' +
      'for, so it points at the wrong object after a refactor.',
  },
  {
    id: 'pedantic.no-throw-literal',
    group: 'pedantic',
    title: 'Something other than an `Error` thrown',
    description:
      'A thrown string or object carries no stack, so the report names the line that caught it rather ' +
      'than the line that failed.',
  },
  {
    id: 'pedantic.no-typeof-undefined',
    group: 'pedantic',
    title: 'Undefined checked through `typeof`',
    description:
      '`typeof x === ’undefined’` was needed when reading an undeclared name threw; for a declared ' +
      'binding the direct comparison says the same thing and catches the typo.',
  },
  {
    id: 'pedantic.no-unescaped-entities',
    group: 'pedantic',
    title: 'Quote or bracket written raw in JSX',
    description:
      'Characters such as `>` and `"` are ambiguous in JSX text: some parsers accept them and some do ' +
      'not, so the same source renders differently.',
  },
  {
    id: 'pedantic.no-unnecessary-array-flat-depth',
    group: 'pedantic',
    title: '`flat` given the depth it already uses',
    description:
      'Passing `1` is what omitting the argument does, and the explicit value becomes wrong when the ' +
      'nesting changes.',
  },
  {
    id: 'pedantic.no-unnecessary-array-splice-count',
    group: 'pedantic',
    title: '`splice` given a count that reaches the end',
    description:
      'Passing the remaining length is what omitting the argument does, and the arithmetic is a place ' +
      'to make an off-by-one that removes one element too few.',
  },
  {
    id: 'pedantic.no-unnecessary-slice-end',
    group: 'pedantic',
    title: '`slice` given an end it does not need',
    description:
      'Passing the length is what omitting the argument does, and the expression has to be revisited ' +
      'whenever the receiver changes.',
  },
  {
    id: 'pedantic.no-unreadable-iife',
    group: 'pedantic',
    title: 'Immediately invoked arrow with an inline body',
    description:
      'An arrow whose body is itself parenthesised and called reads as a call to something else, and ' +
      'the number of parentheses is the only thing that says otherwise.',
  },
  {
    id: 'pedantic.no-unsafe-function-type',
    group: 'pedantic',
    title: '`Function` used as a type',
    description:
      'It accepts any callable with any signature and returns `any`, so nothing about the call is ' +
      'checked.',
  },
  {
    id: 'pedantic.no-useless-promise-resolve-reject',
    group: 'pedantic',
    title: 'Promise wrapped around a value inside an async function',
    description:
      'An async function already wraps what it returns, so resolving explicitly adds a layer and ' +
      'rejecting explicitly hides what a `throw` would have shown.',
  },
  {
    id: 'pedantic.no-useless-return',
    group: 'pedantic',
    title: '`return` at the end of a function',
    description:
      'A final bare return does what falling off the end already does, and suggests a branch that used ' +
      'to be below it.',
  },
  {
    id: 'pedantic.no-useless-switch-case',
    group: 'pedantic',
    title: 'Default preceded by an empty case',
    description:
      'A case falling straight into `default` matches what `default` already matches, so removing it ' +
      'changes nothing and leaving it suggests it does.',
  },
  {
    id: 'pedantic.only-throw-error',
    group: 'pedantic',
    title: 'Non-error thrown or rejected with',
    description:
      'A rejection carrying a string reaches the handler with no stack and no name, so what failed has ' +
      'to be inferred from where it was caught.',
  },
  {
    id: 'pedantic.prefer-array-flat',
    group: 'pedantic',
    title: 'Nesting removed by hand',
    description:
      '`concat`, `reduce` and spread each flatten one level in a way the reader has to decode, where ' +
      'the dedicated method says the depth outright.',
  },
  {
    id: 'pedantic.prefer-array-some',
    group: 'pedantic',
    title: 'Existence tested by finding or filtering',
    description:
      '`find` and `filter` build or return a value the caller discards, and `filter(...).length > 0` ' +
      'walks the whole array to answer a question the first match settles.',
  },
  {
    id: 'pedantic.prefer-at',
    group: 'pedantic',
    title: 'Last element reached by arithmetic',
    description:
      '`x[x.length - 1]` names the receiver twice and produces `undefined` on an empty array with no ' +
      'sign that the arithmetic went negative.',
  },
  {
    id: 'pedantic.prefer-blob-reading-methods',
    group: 'pedantic',
    title: 'Blob read through a reader object',
    description:
      'The reader form is event-based and needs its own error handling; the promise-returning methods ' +
      'report the same failure through the call.',
  },
  {
    id: 'pedantic.prefer-code-point',
    group: 'pedantic',
    title: 'Character handled as a UTF-16 unit',
    description:
      '`charCodeAt` and `fromCharCode` truncate to 16 bits, so anything outside the basic plane — an ' +
      'emoji, most scripts — is split or corrupted.',
  },
  {
    id: 'pedantic.prefer-date-now',
    group: 'pedantic',
    title: 'Current time taken through a date object',
    description:
      'Constructing a date to read one number allocates an object and gives three ways to write the ' +
      'same thing.',
  },
  {
    id: 'pedantic.prefer-dom-node-append',
    group: 'pedantic',
    title: 'Node added with the older insertion method',
    description:
      '`appendChild` takes one node and returns it; `append` takes several and accepts strings, so the ' +
      'older form is the one that needs a loop.',
  },
  {
    id: 'pedantic.prefer-dom-node-dataset',
    group: 'pedantic',
    title: 'Data attribute reached as a raw attribute',
    description:
      'Going through `getAttribute` means spelling the `data-` prefix and the casing by hand at every ' +
      'call site.',
  },
  {
    id: 'pedantic.prefer-dom-node-remove',
    group: 'pedantic',
    title: 'Node removed through its parent',
    description:
      '`parentNode.removeChild(node)` fails when the parent is null, which is exactly the case ' +
      '`remove()` handles.',
  },
  {
    id: 'pedantic.prefer-enum-initializers',
    group: 'pedantic',
    title: 'Enum member with an implicit value',
    description:
      'An implicit member takes its position as its value, so inserting one above it renumbers ' +
      'everything below — including data already written to disk.',
  },
  {
    id: 'pedantic.prefer-import-meta-properties',
    group: 'pedantic',
    title: 'Module path derived by hand',
    description:
      '`dirname(fileURLToPath(import.meta.url))` is three calls and two imports for something ' +
      '`import.meta.dirname` states directly.',
  },
  {
    id: 'pedantic.prefer-includes',
    group: 'pedantic',
    title: 'Membership tested through an index',
    description:
      '`indexOf(x) !== -1` states the answer through a position, and the off-by-one that turns it into ' +
      '`> 0` silently stops matching the first element.',
  },
  {
    id: 'pedantic.prefer-math-min-max',
    group: 'pedantic',
    title: 'Clamp written as a conditional',
    description:
      'A ternary picking the larger or smaller value repeats both operands, so a change has to be made ' +
      'twice and the two can disagree.',
  },
  {
    id: 'pedantic.prefer-native-coercion-functions',
    group: 'pedantic',
    title: 'Wrapper around a conversion the platform provides',
    description:
      'An arrow that only calls `String` or `Number` on its argument adds a frame and a place for the ' +
      'argument list to drift.',
  },
  {
    id: 'pedantic.prefer-number-coercion',
    group: 'pedantic',
    title: 'Number produced by an operator rather than a conversion',
    description:
      'Unary plus and the double bitwise negation convert, but they also truncate and read as ' +
      'arithmetic, so the intent has to be inferred.',
  },
  {
    id: 'pedantic.prefer-promise-reject-errors',
    group: 'pedantic',
    title: 'Promise rejected with something that is not an error',
    description:
      'The rejection reaches its handler with no stack, so the failure is reported at the point it was ' +
      'caught and not the point it happened.',
  },
  {
    id: 'pedantic.prefer-prototype-methods',
    group: 'pedantic',
    title: 'Prototype method reached through a literal',
    description:
      '`[].slice.call(x)` allocates an array to borrow a method from it, where the prototype can be ' +
      'named directly.',
  },
  {
    id: 'pedantic.prefer-query-selector',
    group: 'pedantic',
    title: 'Element found through a specialised lookup',
    description:
      '`getElementById` and its relatives each take a different kind of string, so a codebase using ' +
      'them mixes several selector dialects.',
  },
  {
    id: 'pedantic.prefer-regexp-test',
    group: 'pedantic',
    title: 'Match used only as a condition',
    description:
      '`match` and `exec` build a result object to answer yes or no, and with a global flag `exec` also ' +
      'advances the pattern’s own index between calls.',
  },
  {
    id: 'pedantic.prefer-string-replace-all',
    group: 'pedantic',
    title: 'Global replacement written as a pattern',
    description:
      'Reaching for a regular expression to replace every occurrence means escaping the needle, and ' +
      'forgetting the `g` flag replaces only the first.',
  },
  {
    id: 'pedantic.prefer-string-slice',
    group: 'pedantic',
    title: 'Substring taken with the older method',
    description:
      '`substr` is a legacy annex of the specification, and `substring` reorders its arguments when ' +
      'they are the wrong way round rather than returning nothing.',
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
    id: 'pedantic.prefer-type-error',
    group: 'pedantic',
    title: 'Type check that throws the wrong error',
    description:
      'A failed type check reported as a generic error cannot be told from any other failure by a ' +
      'handler that catches by class.',
  },
  {
    id: 'pedantic.radix',
    group: 'pedantic',
    title: '`parseInt` called without a radix',
    description:
      'The base is inferred from the text, so a leading zero or an `0x` prefix in user input changes ' +
      'the number the same string produces.',
  },
  {
    id: 'pedantic.related-getter-setter-pairs',
    group: 'pedantic',
    title: 'Getter and setter that disagree about the type',
    description:
      'When the setter accepts a type the getter cannot return, a value written through one comes back ' +
      'as something else through the other.',
  },
  {
    id: 'pedantic.require-number-to-fixed-digits-argument',
    group: 'pedantic',
    title: '`toFixed` called with no digits',
    description:
      'The default is zero digits, so the call rounds to an integer where a reader almost always ' +
      'expects the value unchanged.',
  },
  {
    id: 'pedantic.switch-exhaustiveness-check',
    group: 'pedantic',
    title: 'Switch that does not cover its union',
    description:
      'A member added to the union later falls through every case, and without the check nothing ' +
      'reports that the new one is unhandled.',
  },
  {
    id: 'pedantic.symbol-description',
    group: 'pedantic',
    title: 'Symbol created without a description',
    description:
      'A symbol with no description prints as `Symbol()`, so a key collision or a wrong lookup cannot ' +
      'be told apart in a log.',
  },
  {
    id: 'perf.jsx-no-constructed-context-values',
    group: 'perf',
    title: 'Context value rebuilt on every render',
    description:
      'A fresh object as the provider’s value has a new identity each render, so every consumer ' +
      're-renders whether or not anything it reads has changed.',
  },
  {
    id: 'perf.no-accumulating-spread',
    group: 'perf',
    title: 'Spread into an accumulator inside a loop',
    description:
      'Copying the accumulator on every iteration makes the loop quadratic, so it is fast on a test ' +
      'fixture and hangs on real input.',
  },
  {
    id: 'perf.no-object-type-as-default-prop',
    group: 'perf',
    title: 'Object literal as a default prop',
    description:
      'A default evaluated on each render has a new identity every time, which defeats memoisation in ' +
      'everything that receives it.',
  },
  {
    id: 'perf.no-useless-call',
    group: 'perf',
    title: '`call` or `apply` where a plain call would do',
    description:
      'Passing the receiver the function already has adds a dynamic dispatch and hides an ordinary call ' +
      'behind a reflective one.',
  },
  {
    id: 'perf.prefer-array-find',
    group: 'perf',
    title: 'Whole array filtered to take one element',
    description:
      'Filtering allocates and scans everything to reach a result that stops at the first match.',
  },
  {
    id: 'perf.prefer-array-flat-map',
    group: 'perf',
    title: 'Map followed by a flatten',
    description:
      'Mapping and then flattening builds an intermediate array of arrays that the second pass ' +
      'immediately discards.',
  },
  {
    id: 'perf.prefer-set-has',
    group: 'perf',
    title: 'Array searched repeatedly for membership',
    description:
      '`includes` scans, so a lookup inside a loop is quadratic where a set is not.',
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
    id: 'restriction.anchor-ambiguous-text',
    group: 'restriction',
    title: 'Link whose text says nothing',
    description:
      'Screen readers offer a list of a page’s links out of context, so text such as “click here” or ' +
      '“read more” describes none of the destinations it appears on.',
  },
  {
    id: 'restriction.bad-bitwise-operator',
    group: 'restriction',
    title: 'Bitwise operator where a logical one was meant',
    description:
      '`&` and `|` evaluate both sides and produce a number, so a condition written with them neither ' +
      'short-circuits nor yields a boolean.',
  },
  {
    id: 'restriction.button-has-type',
    group: 'restriction',
    title: 'Button with no explicit type',
    description:
      'A `<button>` inside a form defaults to `submit`, so a control meant to do something local ' +
      'submits the form and navigates away.',
  },
  {
    id: 'restriction.catch-or-return',
    group: 'restriction',
    title: 'Promise chain that ends without a handler',
    description:
      'A chain with no terminal `catch` or `return` leaves a rejection to surface as an unhandled one, ' +
      'detached from the call that caused it.',
  },
  {
    id: 'restriction.handle-callback-err',
    group: 'restriction',
    title: 'Error argument the callback never reads',
    description:
      'A node-style callback whose error parameter is ignored proceeds as though the operation ' +
      'succeeded, using data that was never produced.',
  },
  {
    id: 'restriction.no-abusive-eslint-disable',
    group: 'restriction',
    title: 'Blanket suppression with no rule named',
    description:
      'A disable comment naming nothing switches off every rule for that line, including the ones ' +
      'written after it, and records nothing about which finding was being refused.',
  },
  {
    id: 'restriction.no-alert',
    group: 'restriction',
    title: 'Blocking browser dialog',
    description:
      '`alert`, `confirm` and `prompt` stop the event loop and cannot be styled or tested, so they ' +
      'survive into production as the one interaction nothing else in the application looks like.',
  },
  {
    id: 'restriction.no-amd',
    group: 'restriction',
    title: 'AMD module syntax',
    description:
      '`define` and the AMD form of `require` are a module system this toolchain does not load; the ' +
      'file is neither bundled nor executed as its author expected.',
  },
  {
    id: 'restriction.no-anonymous-default-export',
    group: 'restriction',
    title: 'Default export with no name',
    description:
      'The binding has no name in a stack trace, in the module graph or in hot reloading, so the one ' +
      'thing the file exports is the hardest thing in it to identify.',
  },
  {
    id: 'restriction.no-clone-element',
    group: 'restriction',
    title: '`cloneElement` used to inject props',
    description:
      'Cloning overrides props invisibly at a distance, so the element a reader sees written is not the ' +
      'one that renders.',
  },
  {
    id: 'restriction.no-commonjs',
    group: 'restriction',
    title: 'CommonJS module syntax',
    description:
      '`require` and `module.exports` in a package declared as ESM are either rewritten by a bundler or ' +
      'fail outright, and which one depends on the toolchain rather than the code.',
  },
  {
    id: 'restriction.no-const-enum',
    group: 'restriction',
    title: '`const enum` declared',
    description:
      'The values are inlined at compile time, which no isolated-module transpiler can do, so the enum ' +
      'resolves to nothing under a bundler that compiles file by file.',
  },
  {
    id: 'restriction.no-cycle',
    group: 'restriction',
    title: 'Modules that import each other',
    description:
      'A cycle between modules is resolved by whichever one the loader enters first: the other sees a ' +
      'half-initialised namespace, so a binding read during evaluation is `undefined` rather than an error. ' +
      'Type-only cycles are erased and are not reported.',
  },
  {
    id: 'restriction.no-document-cookie',
    group: 'restriction',
    title: 'Cookie written by string assignment',
    description:
      'The API takes one serialised attribute string, so an escaping mistake sets a different cookie or ' +
      'silently sets none, with no error either way.',
  },
  {
    id: 'restriction.no-dynamic-require',
    group: 'restriction',
    title: '`require` with a computed specifier',
    description:
      'A specifier built at run time cannot be resolved by a bundler, so the dependency is missing from ' +
      'the output and fails only when that branch is reached.',
  },
  {
    id: 'restriction.no-empty-object-type',
    group: 'restriction',
    title: '`{}` used as a type',
    description:
      '`{}` means anything that is not null or undefined, so it accepts a string, a number and a ' +
      'function — which is the opposite of the empty object it reads as.',
  },
  {
    id: 'restriction.no-implicit-globals',
    group: 'restriction',
    title: 'Declaration that lands on the global object',
    description:
      'A top-level `var` or function in a script becomes a property of the global object, where any ' +
      'other script can read or replace it.',
  },
  {
    id: 'restriction.no-import-compiler-macros',
    group: 'restriction',
    title: 'Compiler macro imported explicitly',
    description:
      'The macros are compiled away, so importing them adds a specifier the build has to strip and that ' +
      'fails wherever it does not.',
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
    id: 'restriction.no-length-as-slice-end',
    group: 'restriction',
    title: '`slice` given the length as its end',
    description:
      'Passing the length is what omitting the argument already does, and it becomes wrong the moment ' +
      'the expression before it is changed to a different array.',
  },
  {
    id: 'restriction.no-magic-array-flat-depth',
    group: 'restriction',
    title: '`flat` given a depth nobody can read',
    description:
      'A numeric depth beyond 1 depends on a nesting the call site cannot show, so the value stops ' +
      'matching the data without any error.',
  },
  {
    id: 'restriction.no-multiple-slot-args',
    group: 'restriction',
    title: 'Slot invoked with more than one argument',
    description:
      'Only the first argument reaches the slot’s props; the rest are dropped without a warning.',
  },
  {
    id: 'restriction.no-namespace',
    group: 'restriction',
    title: 'TypeScript namespace declared',
    description:
      'Namespaces predate modules and merge across files, so what a name refers to depends on which ' +
      'files were included in the compilation.',
  },
  {
    id: 'restriction.no-new-require',
    group: 'restriction',
    title: '`new` applied to the result of `require`',
    description:
      'The precedence means `new require(’x’)` constructs the module function rather than something it ' +
      'exports, which is almost never what was meant.',
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
    id: 'restriction.no-path-concat',
    group: 'restriction',
    title: 'Path built by joining strings',
    description:
      'Concatenating a directory and a name assumes one separator and no trailing slash, so the result ' +
      'is wrong on some platforms and some inputs.',
  },
  {
    id: 'restriction.no-proto',
    group: 'restriction',
    title: '`__proto__` used to reach the prototype',
    description:
      'The property is deprecated, is slower than the accessor that replaced it, and is the vector ' +
      'prototype pollution travels through when the key comes from data.',
  },
  {
    id: 'restriction.no-react-children',
    group: 'restriction',
    title: '`Children` helpers used to inspect children',
    description:
      'The helpers flatten and renumber, so keys change and state moves between siblings when the shape ' +
      'of the children changes.',
  },
  {
    id: 'restriction.no-regex-spaces',
    group: 'restriction',
    title: 'Run of spaces inside a pattern',
    description:
      'Two or more literal spaces are indistinguishable from one when read, so the pattern matches ' +
      'something other than what the author counted.',
  },
  {
    id: 'restriction.no-require-imports',
    group: 'restriction',
    title: '`require` used in a TypeScript module',
    description:
      'Mixing the call form with `import` gives one module two loading semantics, and only one of them ' +
      'participates in the bundler’s graph.',
  },
  {
    id: 'restriction.no-sequences',
    group: 'restriction',
    title: 'Comma operator used as an expression',
    description:
      'The comma evaluates both sides and yields the last, which reads as an argument list or a mistake ' +
      'far more often than as the intent.',
  },
  {
    id: 'restriction.no-useless-error-capture-stack-trace',
    group: 'restriction',
    title: 'Stack capture the constructor already did',
    description:
      '`Error` records its stack when it is constructed, so capturing again replaces a correct trace ' +
      'with one rooted at the capture.',
  },
  {
    id: 'restriction.no-var-requires',
    group: 'restriction',
    title: 'Module assigned from a `require` call',
    description:
      'The binding has no type and no static edge, so nothing checks what the module exports or notices ' +
      'when it stops existing.',
  },
  {
    id: 'restriction.no-webpack-loader-syntax',
    group: 'restriction',
    title: 'Loader written into an import specifier',
    description:
      'An inline `loader!` prefix binds the source to one bundler, and every other tool reads it as a ' +
      'module path that does not exist.',
  },
  {
    id: 'restriction.prefer-literal-enum-member',
    group: 'restriction',
    title: 'Enum member computed rather than written',
    description:
      'A member whose value is an expression is not inlined and cannot be checked for collisions, so ' +
      'two members can silently share a value.',
  },
  {
    id: 'restriction.prefer-modern-math-apis',
    group: 'restriction',
    title: 'Formula written out where the platform has it',
    description:
      'Hand-written `Math.log(x) / Math.LN2` and its relatives lose precision the dedicated function ' +
      'keeps, and the loss is invisible until the numbers matter.',
  },
  {
    id: 'restriction.prefer-node-protocol',
    group: 'restriction',
    title: 'Built-in imported without the `node:` prefix',
    description:
      'Without the prefix the specifier can be shadowed by a package of the same name, so which module ' +
      'is loaded depends on what is installed.',
  },
  {
    id: 'restriction.prefer-number-properties',
    group: 'restriction',
    title: 'Global numeric function used',
    description:
      'Global `isNaN` and `parseInt` coerce their argument first, so `isNaN(’’)` is false and ' +
      '`parseInt(0.0000005)` is 5. The `Number` versions do not coerce.',
  },
  {
    id: 'restriction.spec-only',
    group: 'restriction',
    title: 'Non-standard promise method called',
    description:
      'A method outside the specification comes from one library’s implementation, so the code stops ' +
      'working the moment the promise is produced by something else.',
  },
  {
    id: 'restriction.unicode-bom',
    group: 'restriction',
    title: 'Byte order mark at the start of a file',
    description:
      'The mark is content: it appears in the first token, breaks a shebang, and turns an otherwise ' +
      'identical file into a different one for every tool that hashes it.',
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
    id: 'security.function-constructor',
    group: 'security',
    title: 'Function built from a string',
    description:
      '`new Function(body)` compiles source at run time exactly as `eval` does, so anything that reaches ' +
      'the string is executed with the privileges of the page.',
  },
  {
    id: 'security.jsx-script-url',
    group: 'security',
    title: '`javascript:` URL in JSX',
    description:
      'The JSX form of a `javascript:` href, which React has warned about since 16.9 and refuses to render ' +
      'at all from 19.',
  },
  {
    id: 'security.script-url',
    group: 'security',
    title: '`javascript:` URL in an attribute',
    description:
      'A `javascript:` href is a script the document runs on click, in a position nothing escapes — so any ' +
      'part of the URL that came from outside the program executes. React 19 refuses to render one at all.',
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
    id: 'style.adjacent-overload-signatures',
    group: 'style',
    title: 'Overloads separated by other members',
    description:
      'The compiler groups overloads by adjacency, so a member between them starts a new group and the ' +
      'signatures stop applying to one another.',
  },
  {
    id: 'style.consistent-date-clone',
    group: 'style',
    title: 'Date copied through its own number',
    description:
      '`new Date(date.getTime())` takes two calls to do what passing the date does, and loses the ' +
      'intent the moment either half is edited.',
  },
  {
    id: 'style.consistent-existence-index-check',
    group: 'style',
    title: 'Index compared inconsistently for existence',
    description:
      '`!== -1` and `>= 0` say the same thing, and `> 0` — one character away — silently stops matching ' +
      'the first element.',
  },
  {
    id: 'style.default-case-last',
    group: 'style',
    title: 'Default clause placed before a case',
    description:
      'A `default` that is not last still matches last, so the order in the source is not the order the ' +
      'switch evaluates.',
  },
  {
    id: 'style.default-param-last',
    group: 'style',
    title: 'Parameter with a default before a required one',
    description:
      'A default that cannot be skipped is not optional: every caller has to pass it to reach the ' +
      'parameters after it.',
  },
  {
    id: 'style.error-message',
    group: 'style',
    title: 'Error constructed with no message',
    description:
      'An error with nothing in it reports only its class, so the log says something failed and not ' +
      'what.',
  },
  {
    id: 'style.eslint-prefer-spread',
    group: 'style',
    title: 'Arguments passed through `apply`',
    description:
      '`f.apply(null, args)` also rebinds the receiver, so the call changes two things where the spread ' +
      'changes one.',
  },
  {
    id: 'style.explicit-timer-delay',
    group: 'style',
    title: 'Timer scheduled with no delay stated',
    description:
      'An omitted delay is zero, which is not immediate but next-tick, and the difference is exactly ' +
      'what a reader needs to know.',
  },
  {
    id: 'style.guard-for-in',
    group: 'style',
    title: '`for…in` that does not filter inherited keys',
    description:
      'The loop walks the prototype chain, so anything added to a shared prototype joins the iteration ' +
      'of every object of that shape.',
  },
  {
    id: 'style.jest-no-alias-methods',
    group: 'style',
    title: 'Matcher called by a deprecated alias',
    description:
      'The aliases are scheduled for removal and do not appear in the documentation, so the assertion ' +
      'is harder to look up and breaks on a major upgrade.',
  },
  {
    id: 'style.jest-no-duplicate-hooks',
    group: 'style',
    title: 'Hook declared twice in one block',
    description:
      'Two `beforeEach` in the same block both run in source order, which reads as one having replaced ' +
      'the other.',
  },
  {
    id: 'style.jest-no-identical-title',
    group: 'style',
    title: 'Two tests with the same name',
    description:
      'Both run, and the report names them identically — so a failure cannot be traced to one of them ' +
      'without counting.',
  },
  {
    id: 'style.jest-no-mocks-import',
    group: 'style',
    title: 'Manual mock imported directly',
    description:
      'The mock directory is loaded by the runner, so importing from it by hand bypasses the mechanism ' +
      'and gets a second, unregistered copy.',
  },
  {
    id: 'style.jest-no-test-return-statement',
    group: 'style',
    title: 'Test that returns instead of awaiting',
    description:
      'Returning a value that is not a promise tells the runner nothing, and returning one alongside a ' +
      'done callback makes the completion ambiguous.',
  },
  {
    id: 'style.logical-assignment-operators',
    group: 'style',
    title: 'Conditional assignment written the long way',
    description:
      '`x = x || y` reassigns even when nothing changed, which matters for a setter, a proxy or ' +
      'anything watching the property.',
  },
  {
    id: 'style.no-array-method-this-argument',
    group: 'style',
    title: 'Array method given a `this` argument',
    description:
      'The extra argument only binds an old-style callback; with an arrow it is silently ignored, so ' +
      'the receiver a reader sees is not the one in effect.',
  },
  {
    id: 'style.no-confusing-set-timeout',
    group: 'style',
    title: 'Timer helper called outside the scope it affects',
    description:
      'Fake timers configured in the wrong hook apply to tests other than the one that asked for them, ' +
      'so a failure appears in a test that did not change.',
  },
  {
    id: 'style.no-deprecated-functions',
    group: 'style',
    title: 'Deprecated test API used',
    description:
      'The function is scheduled for removal, so the suite compiles today and stops running on the next ' +
      'major version.',
  },
  {
    id: 'style.no-empty-interface',
    group: 'style',
    title: 'Interface that declares nothing',
    description:
      'An empty interface extending one type is an alias written the long way; extending nothing ' +
      'accepts any non-nullable value.',
  },
  {
    id: 'style.no-exports-assign',
    group: 'style',
    title: '`exports` replaced rather than extended',
    description:
      'Assigning to `exports` rebinds the local variable and leaves `module.exports` as it was, so the ' +
      'module exports nothing that was written.',
  },
  {
    id: 'style.no-import-node-test',
    group: 'style',
    title: 'Node’s test runner imported inside another one',
    description:
      'Two runners in one file register two sets of globals, and which set a call reaches depends on ' +
      'import order.',
  },
  {
    id: 'style.no-jasmine-globals',
    group: 'style',
    title: 'Jasmine global used inside a modern runner',
    description:
      'The compatibility shims are not part of the runner’s API and are removed without notice, so the ' +
      'suite depends on something nothing documents.',
  },
  {
    id: 'style.no-multi-str',
    group: 'style',
    title: 'String continued across lines with a backslash',
    description:
      'The continuation swallows the newline and any trailing whitespace after the backslash silently ' +
      'breaks it, with no error to say so.',
  },
  {
    id: 'style.no-mutable-exports',
    group: 'style',
    title: 'Exported binding that can be reassigned',
    description:
      'An exported `let` or `var` is a live binding: its value changes under every importer, at a ' +
      'moment none of them can see.',
  },
  {
    id: 'style.no-return-assign',
    group: 'style',
    title: 'Assignment returned from a function',
    description:
      '`return a = b` assigns and returns, which is one character away from the comparison it reads as.',
  },
  {
    id: 'style.no-return-wrap',
    group: 'style',
    title: 'Value wrapped in a promise inside a handler',
    description:
      'A `then` handler already wraps what it returns, so resolving explicitly adds a layer and ' +
      'rejecting explicitly hides what a `throw` would have shown.',
  },
  {
    id: 'style.no-unreadable-array-destructuring',
    group: 'style',
    title: 'Destructuring with a run of holes',
    description:
      'Consecutive commas encode a position by counting, so a reader has to count them and an inserted ' +
      'element moves every binding after it.',
  },
  {
    id: 'style.no-untyped-mock-factory',
    group: 'style',
    title: 'Mock factory with no type parameter',
    description:
      'Without the parameter the mock is unchecked against the module it replaces, so it keeps ' +
      'compiling after that module’s shape changes.',
  },
  {
    id: 'style.no-zero-fractions',
    group: 'style',
    title: 'Number written with a redundant fraction',
    description:
      '`1.0` and `1.` are the same value as `1`, and the fraction suggests a precision the type does ' +
      'not have.',
  },
  {
    id: 'style.operator-assignment',
    group: 'style',
    title: 'Assignment that repeats its own target',
    description:
      '`x = x + 1` names the target twice, so a rename has to change both and can change one.',
  },
  {
    id: 'style.prefer-array-index-of',
    group: 'style',
    title: 'Position found with a predicate that only compares',
    description:
      '`findIndex` takes a callback to do what `indexOf` does with a value, which is a function ' +
      'allocation and a place for the comparison to drift.',
  },
  {
    id: 'style.prefer-arrow-callback',
    group: 'style',
    title: 'Callback written as a function expression',
    description:
      'A function expression brings its own `this` and `arguments`, so a callback that reads either ' +
      'gets the wrong one without any error.',
  },
  {
    id: 'style.prefer-bigint-literals',
    group: 'style',
    title: 'BigInt built from a constructor call',
    description:
      '`BigInt(1)` converts at run time what `1n` states in the source, and the call accepts a value ' +
      'that cannot be represented.',
  },
  {
    id: 'style.prefer-class-fields',
    group: 'style',
    title: 'Field assigned in the constructor rather than declared',
    description:
      'A field only visible inside the constructor is not part of the class’s written shape, so a ' +
      'reader has to execute the constructor to know what the instance holds.',
  },
  {
    id: 'style.prefer-classlist-toggle',
    group: 'style',
    title: 'Class added or removed by branching',
    description:
      'An `if` around `add` and `remove` states the same class name twice, so the two can be edited ' +
      'apart.',
  },
  {
    id: 'style.prefer-const',
    group: 'style',
    title: 'Binding declared `let` and never reassigned',
    description:
      'A `let` tells a reader the value changes somewhere, so they look for the place it does.',
  },
  {
    id: 'style.prefer-default-parameters',
    group: 'style',
    title: 'Default applied inside the body',
    description:
      'Reassigning a parameter when it is undefined hides the default from the signature, which is the ' +
      'only place a caller looks.',
  },
  {
    id: 'style.prefer-dom-node-text-content',
    group: 'style',
    title: 'Text read through `innerText`',
    description:
      '`innerText` reflects layout: it triggers a reflow to read, and returns different text depending ' +
      'on what is hidden by CSS.',
  },
  {
    id: 'style.prefer-exponentiation-operator',
    group: 'style',
    title: 'Power written as a call',
    description:
      '`Math.pow(a, b)` and `a ** b` are the same operation, and only one of them reads as arithmetic.',
  },
  {
    id: 'style.prefer-for-of',
    group: 'style',
    title: 'Index loop that only reads the element',
    description:
      'A counted loop states three things to do one, and each of the three is a place to put the ' +
      'off-by-one.',
  },
  {
    id: 'style.prefer-function-type',
    group: 'style',
    title: 'Call signature wrapped in an interface',
    description:
      'An interface holding a single call signature cannot be used where a function type can, and reads ' +
      'as a shape with a method.',
  },
  {
    id: 'style.prefer-global-this',
    group: 'style',
    title: 'Global object named per environment',
    description:
      '`window`, `self` and `global` each exist in some runtimes and not others, so the reference is ' +
      'undefined wherever the code is moved.',
  },
  {
    id: 'style.prefer-includes',
    group: 'style',
    title: 'Membership tested through an index',
    description:
      '`indexOf(x) !== -1` answers a yes-or-no question with a position, and the off-by-one that turns ' +
      'it into `> 0` stops matching the first element.',
  },
  {
    id: 'style.prefer-keyboard-event-key',
    group: 'style',
    title: 'Key read from a deprecated numeric property',
    description:
      '`keyCode` and `which` are deprecated and layout-dependent, so a shortcut bound through them ' +
      'lands on a different key on a different keyboard.',
  },
  {
    id: 'style.prefer-logical-operator-over-ternary',
    group: 'style',
    title: 'Ternary that repeats its own condition',
    description:
      '`a ? a : b` evaluates `a` twice, which matters as soon as it is a call or a getter.',
  },
  {
    id: 'style.prefer-modern-dom-apis',
    group: 'style',
    title: 'Node inserted with a legacy method',
    description:
      '`insertBefore` and `replaceChild` are called on the parent and take their arguments in an order ' +
      'that is easy to reverse; the modern methods are called on the node itself.',
  },
  {
    id: 'style.prefer-numeric-literals',
    group: 'style',
    title: 'Number parsed from a literal string',
    description:
      '`parseInt(’0xff’, 16)` converts a constant at run time, where the literal states it once and ' +
      'cannot be given the wrong base.',
  },
  {
    id: 'style.prefer-object-from-entries',
    group: 'style',
    title: 'Object built by reducing into an accumulator',
    description:
      'Reducing pairs into an object hides the intent behind an accumulator, and the common spread form ' +
      'of it is quadratic.',
  },
  {
    id: 'style.prefer-object-has-own',
    group: 'style',
    title: 'Ownership tested through the prototype',
    description:
      '`Object.hasOwn` answers the same question without going through an object that may have no ' +
      'prototype or a shadowed method.',
  },
  {
    id: 'style.prefer-object-spread',
    group: 'style',
    title: 'Object merged with `Object.assign`',
    description:
      'Assigning into a fresh literal mutates that literal to build a value, where the spread produces ' +
      'it in one expression.',
  },
  {
    id: 'style.prefer-promise-reject-errors',
    group: 'style',
    title: 'Promise rejected with something that is not an error',
    description:
      'The rejection arrives with no stack, so the failure is reported where it was caught rather than ' +
      'where it happened.',
  },
  {
    id: 'style.prefer-reflect-apply',
    group: 'style',
    title: '`apply` reached through the function prototype',
    description:
      '`Function.prototype.apply.call(f, …)` breaks when `f` has its own `apply`, which is exactly the ' +
      'case the indirection was written for.',
  },
  {
    id: 'style.prefer-regex-literals',
    group: 'style',
    title: 'Pattern built from a string',
    description:
      'A pattern in a string needs every backslash doubled, so an escape that is correct in the regular ' +
      'expression is wrong in the source and nothing checks it.',
  },
  {
    id: 'style.prefer-response-static-json',
    group: 'style',
    title: 'JSON response built by hand',
    description:
      'Constructing a response from a serialised body means setting the content type by hand, and ' +
      'forgetting it is not an error anywhere.',
  },
  {
    id: 'style.prefer-rest-params',
    group: 'style',
    title: '`arguments` read instead of a rest parameter',
    description:
      '`arguments` is array-like rather than an array, is absent in arrow functions, and does not ' +
      'appear in the signature a reader checks.',
  },
  {
    id: 'style.prefer-string-trim-start-end',
    group: 'style',
    title: 'Whitespace trimmed with a legacy alias',
    description:
      '`trimLeft` and `trimRight` are annex-B aliases named after visual direction, which is the ' +
      'opposite end in a right-to-left script.',
  },
  {
    id: 'style.require-array-join-separator',
    group: 'style',
    title: '`join` called with no separator',
    description:
      'The default is a comma, so an omitted argument produces `a,b,c` where the author almost always ' +
      'meant to choose.',
  },
  {
    id: 'style.text-encoding-identifier-case',
    group: 'style',
    title: 'Encoding name written in the wrong case',
    description:
      'The specification names it `utf-8`; other spellings are accepted by some APIs and rejected by ' +
      'others, so the same string works in one place and not another.',
  },
  {
    id: 'style.throw-new-error',
    group: 'style',
    title: 'Error thrown without `new`',
    description:
      'It works for the built-in constructors and not for a subclass, so the same line behaves ' +
      'differently depending on which error type is used.',
  },
  {
    id: 'style.unified-signatures',
    group: 'style',
    title: 'Overloads that differ by one optional argument',
    description:
      'Two signatures separated only by an optional or a union parameter can be written as one, and as ' +
      'two they can drift apart.',
  },
  {
    id: 'style.vitest-no-alias-methods',
    group: 'style',
    title: 'Matcher called by a deprecated alias',
    description:
      'The aliases are scheduled for removal and do not appear in the documentation, so the assertion ' +
      'is harder to look up and breaks on a major upgrade.',
  },
  {
    id: 'style.vitest-no-duplicate-hooks',
    group: 'style',
    title: 'Hook declared twice in one block',
    description:
      'Two `beforeEach` in the same block both run in source order, which reads as one having replaced ' +
      'the other.',
  },
  {
    id: 'style.vitest-no-identical-title',
    group: 'style',
    title: 'Two tests with the same name',
    description:
      'Both run, and the report names them identically — so a failure cannot be traced to one of them ' +
      'without counting.',
  },
  {
    id: 'style.vitest-no-mocks-import',
    group: 'style',
    title: 'Manual mock imported directly',
    description:
      'The mock directory is loaded by the runner, so importing from it by hand bypasses the mechanism ' +
      'and gets a second, unregistered copy.',
  },
  {
    id: 'style.vitest-no-test-return-statement',
    group: 'style',
    title: 'Test that returns instead of awaiting',
    description:
      'Returning a value that is not a promise tells the runner nothing, and returning one alongside a ' +
      'done callback makes the completion ambiguous.',
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
    id: 'suspicious.approx-constant',
    group: 'suspicious',
    title: 'Mathematical constant written out by hand',
    description:
      'A typed-out `3.14159` is less precise than the constant the platform provides, and the ' +
      'difference accumulates through every calculation that uses it.',
  },
  {
    id: 'suspicious.block-scoped-var',
    group: 'suspicious',
    title: '`var` used outside the block it was declared in',
    description:
      'A `var` is function-scoped however it looks, so a declaration inside an `if` or a loop is ' +
      'visible before it and after it — and reads `undefined` rather than failing.',
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
    id: 'suspicious.iframe-missing-sandbox',
    group: 'suspicious',
    title: 'Frame embedded without a sandbox',
    description:
      'Without the attribute the embedded document runs with the privileges of the page around it; with ' +
      'both `allow-same-origin` and `allow-scripts` it can remove the sandbox itself.',
  },
  {
    id: 'suspicious.jest-no-commented-out-tests',
    group: 'suspicious',
    title: 'Test commented out rather than removed',
    description:
      'A commented test is a check that cannot fail and cannot be counted, and nothing in the suite ' +
      'reports that it stopped running.',
  },
  {
    id: 'suspicious.jsx-no-comment-textnodes',
    group: 'suspicious',
    title: 'Comment rendered as visible text',
    description:
      'A `//` or `/* */` written where JSX expects children is a string, so the comment is painted on ' +
      'the page instead of ignored.',
  },
  {
    id: 'suspicious.misrefactored-assign-op',
    group: 'suspicious',
    title: 'Compound assignment that repeats its own target',
    description:
      '`a += a + b` adds `a` twice, which is almost never what the shorthand was meant to express.',
  },
  {
    id: 'suspicious.no-absolute-path',
    group: 'suspicious',
    title: 'Import written as an absolute path',
    description:
      'An absolute specifier resolves against the machine it was written on, so the build works there ' +
      'and nowhere else.',
  },
  {
    id: 'suspicious.no-accessor-recursion',
    group: 'suspicious',
    title: 'Getter or setter that reads its own property',
    description:
      'An accessor referring to the property it implements calls itself until the stack runs out.',
  },
  {
    id: 'suspicious.no-array-fill-with-reference-type',
    group: 'suspicious',
    title: 'Array filled with one shared object',
    description:
      '`fill` stores the same reference in every slot, so writing through one element is visible ' +
      'through all of them.',
  },
  {
    id: 'suspicious.no-async-endpoint-handlers',
    group: 'suspicious',
    title: 'Async handler on an endpoint that cannot await it',
    description:
      'Before Express 5 a rejected promise from a handler is not routed to the error middleware: it ' +
      'becomes an unhandled rejection and can take the process down.',
  },
  {
    id: 'suspicious.no-confusing-array-with',
    group: 'suspicious',
    title: '`with` given an index that does not mean what it looks like',
    description:
      '`Array#with` treats a negative index as an offset from the end, unlike `slice`, and an index ' +
      'equal to the length yields `undefined` rather than appending.',
  },
  {
    id: 'suspicious.no-confusing-non-null-assertion',
    group: 'suspicious',
    title: 'Assertion placed where it reads as an operator',
    description:
      '`a! == b` and `a !== b` differ by one space, and the first asserts then compares loosely while ' +
      'the second compares strictly.',
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
    id: 'suspicious.no-extra-bind',
    group: 'suspicious',
    title: '`bind` on a function that has no `this`',
    description:
      'Binding a function that never reads `this` allocates a wrapper and tells a reader to look for a ' +
      'receiver that is not there.',
  },
  {
    id: 'suspicious.no-extraneous-class',
    group: 'suspicious',
    title: 'Class used only as a namespace',
    description:
      'A class with nothing but static members is a module written in the wrong shape: it cannot be ' +
      'tree-shaken and it invites an instantiation that does nothing.',
  },
  {
    id: 'suspicious.no-instanceof-builtins',
    group: 'suspicious',
    title: 'Built-in checked with `instanceof`',
    description:
      'A value from another realm — a frame, a worker, a VM context — has a different constructor, so ' +
      'the check is false for something that is exactly the type asked about.',
  },
  {
    id: 'suspicious.no-multiple-resolved',
    group: 'suspicious',
    title: 'Promise settled more than once',
    description:
      'Only the first settlement counts. The second result is discarded silently, so a branch that ' +
      'looks like it reports an error reports nothing.',
  },
  {
    id: 'suspicious.no-named-as-default',
    group: 'suspicious',
    title: 'Default import named after a named export',
    description:
      'The module exports both, and the import takes the default while reading as though it took the ' +
      'named one. Nothing breaks; the line says the opposite of what it does.',
  },
  {
    id: 'suspicious.no-named-as-default-member',
    group: 'suspicious',
    title: 'Named export reached through the default import',
    description:
      'The named export is not a property of the default one, so the access is `undefined` at run time ' +
      'rather than an import error.',
  },
  {
    id: 'suspicious.no-namespace',
    group: 'suspicious',
    title: 'Namespaced element in JSX',
    description:
      'React does not support namespace syntax such as `svg:circle`, so the element is not rendered as ' +
      'the author intended.',
  },
  {
    id: 'suspicious.no-new',
    group: 'suspicious',
    title: 'Object constructed and discarded',
    description:
      'Calling `new` for its side effect alone hides the work in a position that reads as a value, and ' +
      'the instance is unreachable the moment the statement ends.',
  },
  {
    id: 'suspicious.no-promise-in-callback',
    group: 'suspicious',
    title: 'Promise created inside a node-style callback',
    description:
      'Mixing the two error conventions leaves the promise’s rejection outside the callback’s error ' +
      'argument, so a failure reaches neither.',
  },
  {
    id: 'suspicious.no-required-prop-with-default',
    group: 'suspicious',
    title: 'Required prop that also has a default',
    description:
      'The two contradict: the default can never apply, and the requirement is the only half that takes ' +
      'effect.',
  },
  {
    id: 'suspicious.no-self-import',
    group: 'suspicious',
    title: 'Module that imports itself',
    description:
      'The binding is read before the module finishes evaluating, so it is `undefined` wherever the ' +
      'cycle is entered.',
  },
  {
    id: 'suspicious.no-this-in-exported-function',
    group: 'suspicious',
    title: '`this` inside an exported function',
    description:
      'Most bundlers do not preserve the receiver for an exported function, so `this` is `undefined` at ' +
      'the call site rather than the module it was written in.',
  },
  {
    id: 'suspicious.no-unnecessary-boolean-literal-compare',
    group: 'suspicious',
    title: 'Boolean compared against a boolean literal',
    description:
      'Comparing a boolean to `true` or `false` restates the value, and the longer form suggests the ' +
      'operand might not be one.',
  },
  {
    id: 'suspicious.no-unnecessary-template-expression',
    group: 'suspicious',
    title: 'Template holding nothing but a constant',
    description:
      'An interpolation of a literal produces the literal, so the backticks say a value varies where ' +
      'none does.',
  },
  {
    id: 'suspicious.no-unnecessary-type-arguments',
    group: 'suspicious',
    title: 'Type argument that repeats the default',
    description:
      'Spelling out a parameter the declaration already defaults to means the call has to be edited ' +
      'when the default changes.',
  },
  {
    id: 'suspicious.no-unnecessary-type-assertion',
    group: 'suspicious',
    title: 'Assertion the type already guarantees',
    description:
      'An assertion the receiver does not need is dead weight, and it hides the day the underlying type ' +
      'changes and the assertion becomes load-bearing.',
  },
  {
    id: 'suspicious.no-unnecessary-type-constraint',
    group: 'suspicious',
    title: 'Type parameter constrained to everything',
    description:
      '`extends any` or `extends unknown` constrains nothing and only exists to disambiguate an arrow ' +
      'in a `.tsx` file.',
  },
  {
    id: 'suspicious.no-unnecessary-type-conversion',
    group: 'suspicious',
    title: 'Conversion applied to a value already of that type',
    description:
      'Wrapping a string in `String()` changes neither type nor value, and tells a reader the input ' +
      'might be something else.',
  },
  {
    id: 'suspicious.no-unneeded-ternary',
    group: 'suspicious',
    title: 'Conditional that returns a boolean it already has',
    description:
      '`x ? true : false` is `Boolean(x)`, and the longer form invites a reader to look for a ' +
      'difference between the branches.',
  },
  {
    id: 'suspicious.no-unsafe-enum-comparison',
    group: 'suspicious',
    title: 'Enum compared against a raw value',
    description:
      'An enum compared to a plain number or string is compared by its backing value, so the comparison ' +
      'survives a renumbering that changes what it means.',
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
    id: 'suspicious.no-useless-concat',
    group: 'suspicious',
    title: 'Two literals joined at run time',
    description:
      'Concatenating adjacent literals does at run time what the source could have done once, and ' +
      'usually marks a place where an interpolation was removed.',
  },
  {
    id: 'suspicious.no-useless-constructor',
    group: 'suspicious',
    title: 'Constructor that only calls `super`',
    description:
      'A constructor doing nothing its parent would not do is a place a reader stops to check, and the ' +
      'class behaves identically without it.',
  },
  {
    id: 'suspicious.prefer-add-event-listener',
    group: 'suspicious',
    title: 'Handler assigned to an `on*` property',
    description:
      'Assigning replaces whatever handler was there, so two pieces of code registering for the same ' +
      'event leave only the later one.',
  },
  {
    id: 'suspicious.react-in-jsx-scope',
    group: 'suspicious',
    title: 'JSX compiled to a factory that is not in scope',
    description:
      'Under the classic runtime every element becomes a call to a name the file must import, and ' +
      'without it the component throws a `ReferenceError` when it first renders.',
  },
  {
    id: 'suspicious.require-default-export',
    group: 'suspicious',
    title: 'Single-file component with no default export',
    description:
      'The compiler loads the component from the default export, so a file without one contributes ' +
      'nothing and fails at the point it is used.',
  },
  {
    id: 'suspicious.require-module-specifiers',
    group: 'suspicious',
    title: 'Empty specifier list',
    description:
      'An import or export with empty braces is either a side-effect import written the long way or ' +
      'what a removed binding left behind.',
  },
  {
    id: 'suspicious.require-post-message-target-origin',
    group: 'suspicious',
    title: '`postMessage` sent without a target origin',
    description:
      'Called without the second argument the message reaches no window at all, so the send appears to ' +
      'succeed and nothing receives it.',
  },
  {
    id: 'suspicious.style-prop-object',
    group: 'suspicious',
    title: 'Style passed as a string',
    description:
      'The style prop takes an object of properties; a string is ignored, so the styling silently does ' +
      'not apply.',
  },
  {
    id: 'suspicious.vitest-no-commented-out-tests',
    group: 'suspicious',
    title: 'Test commented out rather than removed',
    description:
      'A commented test is a check that cannot fail and cannot be counted, and nothing in the suite ' +
      'reports that it stopped running.',
  },
] as const satisfies readonly ConceptDefinition[]
