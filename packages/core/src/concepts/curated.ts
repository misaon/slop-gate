import type { ConceptDefinition } from './catalogue.ts'

export const CURATED_CONCEPTS = [
  {
    id: 'config.dockerfile-absolute-workdir',
    group: 'config',
    title: 'Relative WORKDIR',
    description:
      'A relative `WORKDIR` resolves against whatever the previous one left, so the directory a later ' +
      'instruction runs in depends on every stage above it.',
  },
  {
    id: 'config.dockerfile-add-archive',
    group: 'config',
    title: 'Archive copied then extracted',
    description:
      'Copying an archive and unpacking it leaves both the archive and its contents in the layer. `ADD` ' +
      'extracts without keeping the archive.',
  },
  {
    id: 'config.dockerfile-apt-get-yes',
    group: 'config',
    title: 'apt-get install without -y',
    description:
      'Without `-y` the install waits for a confirmation no build can give, so the step hangs until the builder ' +
      'times out.',
  },
  {
    id: 'config.dockerfile-apt-not-apt-get',
    group: 'config',
    title: 'apt instead of apt-get',
    description:
      '`apt` prints "does not have a stable CLI interface" and is documented as interactive-only; its output ' +
      'and its flags change between releases in ways a script cannot rely on.',
  },
  {
    id: 'config.dockerfile-copy-from-self',
    group: 'config',
    title: 'COPY --from names its own stage',
    description:
      'A stage cannot copy from itself; the instruction refers to a filesystem that does not exist yet.',
  },
  {
    id: 'config.dockerfile-copy-from-unknown-stage',
    group: 'config',
    title: 'COPY --from names no such stage',
    description:
      'A `--from` naming a stage that does not exist is read as an image name, so the build silently pulls ' +
      'something instead of failing.',
  },
  {
    id: 'config.dockerfile-copy-multiple-targets',
    group: 'config',
    title: 'COPY with several sources and no trailing slash',
    description:
      'With more than one source the destination must be a directory. Without the trailing slash Docker treats ' +
      'it as a file and the build fails.',
  },
  {
    id: 'config.dockerfile-copy-whole-filesystem',
    group: 'config',
    title: 'Entire filesystem copied from another stage',
    description:
      'Copying `/` from another stage brings its whole root filesystem into the layer, which is the multi-stage ' +
      'build doing exactly what it exists to avoid.',
  },
  {
    id: 'config.dockerfile-dnf-yes',
    group: 'config',
    title: 'dnf install without -y',
    description:
      'Without `-y` the install waits for a confirmation no build can give.',
  },
  {
    id: 'config.dockerfile-duplicate-stage-name',
    group: 'config',
    title: 'Two stages with one name',
    description:
      'When two stages share a name every `--from` referring to it resolves to one of them, and which one is ' +
      'not stated anywhere.',
  },
  {
    id: 'config.dockerfile-env-self-reference',
    group: 'config',
    title: 'ENV referring to a variable it defines',
    description:
      'Variables in one `ENV` are not visible to each other, so the reference expands to whatever the name held ' +
      'before — usually nothing.',
  },
  {
    id: 'config.dockerfile-instruction-order',
    group: 'config',
    title: 'Instruction before the first FROM',
    description:
      'A Dockerfile must open with `FROM`, `ARG` or a comment. Anything else is a parse error at build time.',
  },
  {
    id: 'config.dockerfile-invalid-label-key',
    group: 'config',
    title: 'Malformed label key',
    description:
      'A label key outside the reverse-DNS convention is accepted by the builder and then not found by the ' +
      'tooling that reads labels by their documented names.',
  },
  {
    id: 'config.dockerfile-invalid-port',
    group: 'config',
    title: 'Port outside the valid range',
    description:
      'A port above 65535 cannot be bound, so the `EXPOSE` documents a mapping that will never work.',
  },
  {
    id: 'config.dockerfile-last-user-root',
    group: 'config',
    title: 'Image ends as root',
    description:
      'A container whose final `USER` is root runs every process with full privileges, so a compromise inside ' +
      'it is a compromise of the host mount points it was given.',
  },
  {
    id: 'config.dockerfile-maintainer-deprecated',
    group: 'config',
    title: 'MAINTAINER instruction',
    description:
      '`MAINTAINER` was deprecated in Docker 1.13; the value it sets is not where any current tooling looks for ' +
      'an owner.',
  },
  {
    id: 'config.dockerfile-missing-healthcheck',
    group: 'config',
    title: 'No HEALTHCHECK',
    description:
      'Without a `HEALTHCHECK` an orchestrator can only see whether the process is running, not whether it is ' +
      'serving, so a wedged container is never restarted.',
  },
  {
    id: 'config.dockerfile-multiple-cmd',
    group: 'config',
    title: 'More than one CMD',
    description:
      'Only the last `CMD` in a stage takes effect, so every earlier one is a default command nothing will ever ' +
      'run.',
  },
  {
    id: 'config.dockerfile-multiple-entrypoint',
    group: 'config',
    title: 'More than one ENTRYPOINT',
    description:
      'Only the last `ENTRYPOINT` in a stage takes effect, so every earlier one is silently discarded.',
  },
  {
    id: 'config.dockerfile-multiple-healthcheck',
    group: 'config',
    title: 'More than one HEALTHCHECK',
    description:
      'Only the last `HEALTHCHECK` in a stage takes effect, so every earlier one is a check somebody wrote and ' +
      'nothing runs.',
  },
  {
    id: 'config.dockerfile-onbuild-onbuild',
    group: 'config',
    title: 'ONBUILD applied to ONBUILD',
    description:
      '`ONBUILD ONBUILD` is rejected by the builder, as are `ONBUILD FROM` and `ONBUILD MAINTAINER`.',
  },
  {
    id: 'config.dockerfile-pin-gem',
    group: 'config',
    title: 'Unpinned gem install',
    description:
      'RubyGems keeps every published version, so pinning is achievable and an unpinned install changes what ' +
      'the image contains between two builds of the same Dockerfile.',
  },
  {
    id: 'config.dockerfile-pin-go',
    group: 'config',
    title: 'Unpinned go install',
    description:
      'Go modules are immutable and every version stays fetchable, so `@version` is available and its absence ' +
      'means the build takes whatever is latest.',
  },
  {
    id: 'config.dockerfile-pin-npm',
    group: 'config',
    title: 'Unpinned npm install',
    description:
      'npm keeps every published version forever, so an unpinned install is reproducible only until the next ' +
      'release — and unlike a distribution archive, the pin does not expire.',
  },
  {
    id: 'config.dockerfile-pointless-command',
    group: 'config',
    title: 'Command that cannot work in a container',
    description:
      '`ssh`, `vim`, `shutdown` and their kin need a session, a terminal or an init system that a build step ' +
      'does not have, so the instruction cannot do what it says.',
  },
  {
    id: 'config.dockerfile-redundant-platform',
    group: 'config',
    title: 'FROM --platform set to the default',
    description:
      '`$TARGETPLATFORM` is already what `FROM` resolves to, so the flag pins nothing and hides the cases where ' +
      'a platform really was forced.',
  },
  {
    id: 'config.dockerfile-reserved-stage-name',
    group: 'config',
    title: 'Stage named after a reserved word',
    description:
      'A stage called `scratch` or `context` shadows a name the builder defines, so a later reference resolves ' +
      'to the stage rather than to what it meant.',
  },
  {
    id: 'config.dockerfile-shell-via-symlink',
    group: 'config',
    title: 'Default shell changed with a symlink',
    description:
      'Relinking `/bin/sh` changes the shell for every later `RUN` in a way no instruction records; `SHELL` ' +
      'states it where a reader will find it.',
  },
  {
    id: 'config.dockerfile-sudo',
    group: 'config',
    title: 'sudo in a build step',
    description:
      'There is no TTY and no password prompt in a build, so `sudo` either fails or is redundant — the build ' +
      'already runs as root unless a `USER` says otherwise.',
  },
  {
    id: 'config.dockerfile-yum-yes',
    group: 'config',
    title: 'yum install without -y',
    description:
      'Without `-y` the install waits for a confirmation no build can give.',
  },
  {
    id: 'config.dockerfile-zypper-dist-upgrade',
    group: 'config',
    title: 'zypper dist-upgrade',
    description:
      'A distribution upgrade replaces the base image with whatever the repository holds that day, so the image ' +
      'no longer matches the tag it was built `FROM`.',
  },
  {
    id: 'config.dockerfile-zypper-yes',
    group: 'config',
    title: 'zypper without a non-interactive flag',
    description:
      'Without `-n` zypper prompts, and a build has nothing to answer with.',
  },
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
    id: 'correctness.vitest-valid-expect',
    group: 'correctness',
    title: 'Malformed expect call',
    description:
      'An `expect` that is never given a matcher, or is given arguments it has no signature for, asserts ' +
      'nothing. The test passes on any input, including the one it was written to reject.',
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
    id: 'dead-code.unused-catalog-entry',
    group: 'dead-code',
    title: 'Catalog entry nothing references',
    description:
      'A version pinned in the workspace catalog that no package resolves through `catalog:` is a dependency ' +
      'the repository still declares, still updates and never installs.',
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
    id: 'deps.unresolved-catalog-reference',
    group: 'deps',
    title: 'catalog: reference with no catalog entry',
    description:
      'A dependency written as `catalog:` with no matching entry in the workspace catalog has no version to ' +
      'resolve to, so the install fails rather than picking one.',
  },
  {
    id: 'nursery.react-compiler',
    group: 'nursery',
    title: 'Code the compiler cannot optimise',
    description:
      'The compiler memoises only components whose rules it can verify. Where it bails out, the component keeps ' +
      're-rendering — and the reason is not visible without the diagnostic.',
  },
  {
    id: 'pedantic.accessor-pairs',
    group: 'pedantic',
    title: 'Setter without a getter',
    description:
      'A property with a setter and no getter accepts a value and gives nothing back, so reading what was just ' +
      'written returns `undefined`.',
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
    id: 'pedantic.consistent-assert',
    group: 'pedantic',
    title: 'Mixed assertion helpers',
    description:
      'Different assertion functions in one codebase fail differently — some throw, some only narrow — so what ' +
      'happens when one fails depends on which was used.',
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
    id: 'pedantic.css-max-lines',
    group: 'pedantic',
    title: 'Oversized stylesheet',
    description:
      'A stylesheet longer than the configured limit is edited a section at a time, so a selector duplicated in ' +
      'two of its parts survives every review that reads only one.',
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
    id: 'pedantic.escape-case',
    group: 'pedantic',
    title: 'Mixed escape case',
    description:
      '`\\u00FF` and `\\u00ff` are the same character written two ways, so a search for one misses the other.',
  },
  {
    id: 'pedantic.eslint-no-lonely-if',
    group: 'pedantic',
    title: 'if alone inside an else',
    description:
      'An `if` as the only statement of an `else` is an `else if` written with an extra level of nesting, which ' +
      'hides that the two conditions are alternatives.',
  },
  {
    id: 'pedantic.eslint-no-negated-condition',
    group: 'pedantic',
    title: 'Negated condition with an else',
    description:
      '`if (!x) … else …` makes the reader invert the condition to find the positive branch, and the inversion ' +
      'is where the mistake is made.',
  },
  {
    id: 'pedantic.eslint-require-await',
    group: 'pedantic',
    title: 'async function that never awaits',
    description:
      'An `async` function with no `await` returns a promise that is already resolved, so the marker tells ' +
      'callers to wait for something that never suspends.',
  },
  {
    id: 'pedantic.explicit-length-check',
    group: 'pedantic',
    title: 'Length used as a boolean',
    description:
      '`if (x.length)` is false for an empty array and for `undefined` alike, so a missing value and an empty ' +
      'one take the same branch.',
  },
  {
    id: 'pedantic.jest-no-conditional-in-test',
    group: 'pedantic',
    title: 'Branch inside a test',
    description:
      'A test containing an `if` asserts different things depending on its input. When it passes, which branch ' +
      'ran — and therefore what was actually verified — is not recorded anywhere.',
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
    id: 'pedantic.max-classes-per-file',
    group: 'pedantic',
    title: 'Several classes in one file',
    description:
      'Classes sharing a file share its import graph and its rebuild, so touching one invalidates the others ' +
      'and a reader looking for one has to establish which of several this file is about.',
  },
  {
    id: 'pedantic.max-dependencies',
    group: 'pedantic',
    title: 'Too many imports in one module',
    description:
      'A module that imports from many others is coupled to all of them: it cannot be tested, moved or ' +
      'understood without them, and every one is a way for a change elsewhere to reach it.',
  },
  {
    id: 'pedantic.max-depth',
    group: 'pedantic',
    title: 'Deeply nested blocks',
    description:
      'Each level of nesting is another condition that has to hold, and past a few the reader is tracking more ' +
      'state than they can keep — which is where the wrong branch gets edited.',
  },
  {
    id: 'pedantic.max-lines',
    group: 'pedantic',
    title: 'Oversized file',
    description:
      'A file too long to hold in view is edited a section at a time, so contradictions between its parts ' +
      'survive review.',
  },
  {
    id: 'pedantic.max-lines-per-function',
    group: 'pedantic',
    title: 'Oversized function',
    description:
      'A function longer than a screen cannot be checked against its own name: whether it still does one thing ' +
      'is not answerable without reading all of it.',
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
    id: 'pedantic.no-array-callback-reference',
    group: 'pedantic',
    title: 'Function passed directly to an array method',
    description:
      'Array methods pass the index and the array as extra arguments, so a function with optional parameters ' +
      'receives them — which is how `[\'1\',\'2\',\'3\'].map(Number.parseInt)` returns `[1, NaN, NaN]`.',
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
    id: 'pedantic.no-confusing-void-expression',
    group: 'pedantic',
    title: 'void expression used as a value',
    description:
      'Using the result of something that returns nothing yields `undefined` while reading as though a value ' +
      'was produced.',
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
    id: 'pedantic.no-else-return',
    group: 'pedantic',
    title: 'else after return',
    description:
      'An `else` after a `return` adds a level of indentation for a branch that is already unreachable, which ' +
      'hides the function\'s actual exit points.',
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
    id: 'pedantic.no-immediate-mutation',
    group: 'pedantic',
    title: 'Array built by pushing into an empty literal',
    description:
      'An array declared empty and immediately filled leaves it in an incomplete state between the two, and ' +
      'nothing prevents something reading it there.',
  },
  {
    id: 'pedantic.no-inline-comments',
    group: 'pedantic',
    title: 'Comment on the code line',
    description:
      'A trailing comment is cut off by the next reformat and pushes the line past where anyone reads, so the ' +
      'note that mattered ends up out of view.',
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
    id: 'pedantic.no-loop-func',
    group: 'pedantic',
    title: 'Function created in a loop that captures the loop',
    description:
      'A closure made per iteration referencing a binding the loop mutates sees the value at call time, ' +
      'not at creation, so every one of them reads the last.',
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
    id: 'pedantic.no-promise-executor-return',
    group: 'pedantic',
    title: 'Value returned from a promise executor',
    description:
      'The executor\'s return value is discarded. Returning from it usually means a `resolve` call was meant, ' +
      'and the promise then never settles.',
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
    id: 'pedantic.no-unsafe-argument',
    group: 'pedantic',
    title: 'any passed as an argument',
    description:
      'An `any` handed to a typed parameter enters the callee with its declared type asserted rather than ' +
      'checked, so the callee\'s own guarantees no longer hold.',
  },
  {
    id: 'pedantic.no-unsafe-assignment',
    group: 'pedantic',
    title: 'any assigned without a check',
    description:
      'A value typed `any` assigned into a typed slot makes every later read a guess the compiler has agreed ' +
      'not to check. The failure surfaces wherever the shape is first relied on, not here.',
  },
  {
    id: 'pedantic.no-unsafe-call',
    group: 'pedantic',
    title: 'any invoked as a function',
    description:
      'Calling a value typed `any` passes whatever arguments the call site supplies to whatever the value turns ' +
      'out to be — including `undefined`, which fails as "not a function" at run time.',
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
    id: 'pedantic.no-unsafe-member-access',
    group: 'pedantic',
    title: 'Property read off an any',
    description:
      'Reading a property from `any` yields `any` and reports nothing when the property is absent, so a renamed ' +
      'or missing field reads as `undefined` and travels on.',
  },
  {
    id: 'pedantic.no-unsafe-return',
    group: 'pedantic',
    title: 'any returned as a typed value',
    description:
      'Returning `any` from a function with a declared return type publishes a contract nothing verified, so ' +
      'every caller trusts a shape that was never established.',
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
    id: 'pedantic.no-useless-undefined',
    group: 'pedantic',
    title: 'undefined passed or returned explicitly',
    description:
      'Writing `undefined` where it is the default distinguishes "not supplied" from "supplied as absent" ' +
      'nowhere, while making the two look different in the source.',
  },
  {
    id: 'pedantic.no-warning-comments',
    group: 'pedantic',
    title: 'TODO or FIXME comment',
    description:
      'A note left in the source is not tracked anywhere: nothing schedules it, nothing assigns it, and nothing ' +
      'reports that it has been there for two years.',
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
    id: 'pedantic.prefer-event-target',
    group: 'pedantic',
    title: 'Node EventEmitter instead of EventTarget',
    description:
      '`EventEmitter` exists only in Node, so a module using it cannot run in a browser, a worker or an edge ' +
      'runtime without a shim.',
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
    id: 'pedantic.prefer-readonly-parameter-types',
    group: 'pedantic',
    title: 'Parameter the callee may mutate',
    description:
      'A parameter whose type permits mutation lets a function change a value its caller still holds. Nothing ' +
      'at the call site says whether it does.',
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
    id: 'pedantic.prefer-single-call',
    group: 'pedantic',
    title: 'Repeated calls that one call covers',
    description:
      'Calling the same method once per item does the surrounding work once per item too, where the single-call ' +
      'form does it once.',
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
    id: 'pedantic.prefer-top-level-await',
    group: 'pedantic',
    title: 'Async IIFE at module scope',
    description:
      'An immediately-invoked async function at module top level detaches its work from the module\'s ' +
      'evaluation, so importers proceed before it finishes and its rejection is unhandled.',
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
    id: 'pedantic.require-param',
    group: 'pedantic',
    title: 'Undocumented parameter',
    description:
      'A documented function that omits a parameter leaves that argument\'s meaning unstated in exactly the ' +
      'place a reader was told to look.',
  },
  {
    id: 'pedantic.require-param-description',
    group: 'pedantic',
    title: 'Parameter documented by name only',
    description:
      'A parameter tag with no description restates the signature and adds nothing the reader could not already ' +
      'see.',
  },
  {
    id: 'pedantic.require-param-name',
    group: 'pedantic',
    title: 'Parameter tag without a name',
    description:
      'A parameter tag that names no parameter cannot be matched to one, so the tooling silently attaches it to ' +
      'whichever position it happens to fall in.',
  },
  {
    id: 'pedantic.require-param-type',
    group: 'pedantic',
    title: 'Parameter tag without a type',
    description:
      'In a documented signature an untyped parameter tag is the only one whose type the reader has to infer, ' +
      'which is where a wrong assumption gets made.',
  },
  {
    id: 'pedantic.require-returns',
    group: 'pedantic',
    title: 'Undocumented return value',
    description:
      'A documented function that says nothing about what it returns leaves the caller to guess whether the ' +
      'value is the result, a status, or nothing at all.',
  },
  {
    id: 'pedantic.require-returns-description',
    group: 'pedantic',
    title: 'Return documented by type only',
    description:
      'A return tag naming a type but not a meaning tells the caller the shape of the value and nothing about ' +
      'which of several possible values it is.',
  },
  {
    id: 'pedantic.require-returns-type',
    group: 'pedantic',
    title: 'Return tag without a type',
    description:
      'A return tag with no type documents that something comes back without saying what, which is less than ' +
      'the signature already said.',
  },
  {
    id: 'pedantic.require-throws-type',
    group: 'pedantic',
    title: 'Throws tag without a type',
    description:
      'Without an error type the caller cannot tell which errors to catch and which to let through, so the ' +
      'handler ends up catching everything.',
  },
  {
    id: 'pedantic.require-unicode-regexp',
    group: 'pedantic',
    title: 'Regular expression without the u flag',
    description:
      'Without `u` a pattern matches UTF-16 code units, so a character outside the basic plane — an emoji, much ' +
      'of CJK — is two units and `.` matches half of it.',
  },
  {
    id: 'pedantic.require-yields-type',
    group: 'pedantic',
    title: 'Yields tag without a type',
    description:
      'A generator documented without the type it yields leaves every consumer of the iterator to infer the ' +
      'element type from a call site.',
  },
  {
    id: 'pedantic.restrict-plus-operands',
    group: 'pedantic',
    title: 'Addition between different types',
    description:
      '`+` is addition for numbers and concatenation for strings, and picks by the operands\' runtime types, so ' +
      'one unexpected string turns arithmetic into text without any diagnostic.',
  },
  {
    id: 'pedantic.return-await',
    group: 'pedantic',
    title: 'return without await inside try',
    description:
      '`return somePromise` inside a `try` settles after the block has exited, so the `catch` never sees the ' +
      'rejection and the stack trace loses the frame that produced it.',
  },
  {
    id: 'pedantic.sort-vars',
    group: 'pedantic',
    title: 'Unsorted declarations',
    description:
      'Several variables declared in one statement in no order make a duplicate declaration invisible.',
  },
  {
    id: 'pedantic.strict-boolean-expressions',
    group: 'pedantic',
    title: 'Non-boolean used as a condition',
    description:
      'Implicit truthiness collapses distinct values into one branch: `\'\'`, `0`, `NaN`, `null` and `undefined` ' +
      'all take the false path, so an empty result and a missing one are indistinguishable.',
  },
  {
    id: 'pedantic.strict-void-return',
    group: 'pedantic',
    title: 'Value returned where void is expected',
    description:
      'A callback typed `void` that returns a promise has its rejection discarded — the shape behind an async ' +
      'function passed to `useEffect` or to an event handler.',
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
    id: 'pedantic.unicorn-no-lonely-if',
    group: 'pedantic',
    title: 'if alone inside an if',
    description:
      'An `if` as the only statement of another is a single condition written as two, and the reader has to ' +
      'combine them to see what actually has to hold.',
  },
  {
    id: 'pedantic.unicorn-no-negated-condition',
    group: 'pedantic',
    title: 'Negated condition with an else',
    description:
      'Leading with the negative branch makes the reader invert the condition to find the ordinary case.',
  },
  {
    id: 'pedantic.vitest-no-conditional-in-test',
    group: 'pedantic',
    title: 'Branch inside a test',
    description:
      'A test with an `if` asserts different things depending on its input, and a pass records nothing about ' +
      'which branch ran — so what was verified is unknown.',
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
    id: 'perf.jsx-no-jsx-as-prop',
    group: 'perf',
    title: 'JSX element passed as a prop',
    description:
      'An element constructed inline is a new object on every render, so the child sees a changed prop each ' +
      'time and memoisation never holds.',
  },
  {
    id: 'perf.jsx-no-new-array-as-prop',
    group: 'perf',
    title: 'Array literal passed as a prop',
    description:
      'A fresh array every render is never equal to the previous one, so any child comparing props re-renders ' +
      'unconditionally.',
  },
  {
    id: 'perf.jsx-no-new-function-as-prop',
    group: 'perf',
    title: 'Function created in a prop',
    description:
      'An inline function is a new value on every render, which defeats the memoisation the child was wrapped ' +
      'in and re-runs any effect that lists it as a dependency.',
  },
  {
    id: 'perf.jsx-no-new-object-as-prop',
    group: 'perf',
    title: 'Object literal passed as a prop',
    description:
      'A new object each render compares unequal to the last, so the child re-renders whether or not anything ' +
      'in it changed.',
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
    id: 'perf.no-await-in-loop',
    group: 'perf',
    title: 'Serialised awaits',
    description:
      'Awaiting inside a loop runs independent operations one after another, so total time is their sum rather ' +
      'than their maximum.',
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
    id: 'restriction.check-access',
    group: 'restriction',
    title: 'Invalid access tag',
    description:
      'An `@access` tag with a value the documentation tooling does not recognise is dropped, so the member ' +
      'documents itself as public whatever the tag says.',
  },
  {
    id: 'restriction.class-methods-use-this',
    group: 'restriction',
    title: 'Method that ignores its instance',
    description:
      'A method that never touches `this` does not need an instance. Calling it through one implies a ' +
      'dependency on object state that does not exist.',
  },
  {
    id: 'restriction.complexity',
    group: 'restriction',
    title: 'Too many branches in one function',
    description:
      'Independent branches multiply the paths through a function, and past a point no test suite covers them ' +
      'all. The uncovered ones are where behaviour nobody intended lives.',
  },
  {
    id: 'restriction.default-case',
    group: 'restriction',
    title: 'switch without a default',
    description:
      'A `switch` with no `default` falls through silently when the value matches nothing, so an unhandled case ' +
      'is indistinguishable from a handled one that does nothing.',
  },
  {
    id: 'restriction.empty-tags',
    group: 'restriction',
    title: 'Documentation tag with no content',
    description:
      'A tag written without its content documents nothing while making the member look documented, so it never ' +
      'appears in a search for what is missing.',
  },
  {
    id: 'restriction.explicit-function-return-type',
    group: 'restriction',
    title: 'Inferred return type',
    description:
      'An inferred return type changes when the body changes, so a refactor can widen a function\'s contract ' +
      'without anything in the diff saying so.',
  },
  {
    id: 'restriction.explicit-member-accessibility',
    group: 'restriction',
    title: 'Class member without an accessibility keyword',
    description:
      'Members default to public, so nothing distinguishes "deliberately part of the API" from "never thought ' +
      'about".',
  },
  {
    id: 'restriction.explicit-module-boundary-types',
    group: 'restriction',
    title: 'Inferred type on an exported function',
    description:
      'At a module boundary the inferred type is the published contract, and it changes silently whenever the ' +
      'implementation does.',
  },
  {
    id: 'restriction.forbid-component-props',
    group: 'restriction',
    title: 'Styling prop on a component',
    description:
      '`className` and `style` passed to a component reach into markup the component owns, so its internals ' +
      'become part of the caller\'s contract.',
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
    id: 'restriction.import-style',
    group: 'restriction',
    title: 'Wrong import style for the module',
    description:
      'Some modules export a namespace and some a default, and importing one as the other yields `undefined` at ' +
      'the first use rather than an error at the import.',
  },
  {
    id: 'restriction.jsx-filename-extension',
    group: 'restriction',
    title: 'JSX in a non-JSX file',
    description:
      'A file containing JSX under a plain extension is parsed differently by editors, bundlers and type- ' +
      'checkers, and `<T>` is read as a cast in one and as an element in another.',
  },
  {
    id: 'restriction.jsx-no-literals',
    group: 'restriction',
    title: 'Untranslatable string in markup',
    description:
      'Text written directly into markup is invisible to extraction, so it is the one string that stays in the ' +
      'original language after everything else is translated.',
  },
  {
    id: 'restriction.max-props',
    group: 'restriction',
    title: 'Too many props on one component',
    description:
      'A component with many props has many combinations, most of them never rendered and none of them tested, ' +
      'and the ones that do not work are found by users.',
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
    id: 'restriction.no-array-for-each',
    group: 'restriction',
    title: 'forEach instead of a loop',
    description:
      '`forEach` cannot be stopped, cannot `await`, and cannot `return` from the enclosing function, so any of ' +
      'those needs the loop it replaced.',
  },
  {
    id: 'restriction.no-array-reduce',
    group: 'restriction',
    title: 'reduce',
    description:
      '`reduce` hides the accumulator\'s shape in a callback signature, and reading what it builds means ' +
      'simulating every iteration.',
  },
  {
    id: 'restriction.no-barrel-file',
    group: 'restriction',
    title: 'Barrel file',
    description:
      'A file re-exporting a whole directory makes every consumer depend on all of it, which defeats tree- ' +
      'shaking and turns one changed module into a rebuild of everything downstream.',
  },
  {
    id: 'restriction.no-bitwise',
    group: 'restriction',
    title: 'Bitwise operator',
    description:
      '`&` and `|` next to `&&` and `||` are a one-character typo apart with entirely different semantics, and ' +
      'JavaScript\'s bitwise operators truncate to 32 bits without warning.',
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
    id: 'restriction.no-console',
    group: 'restriction',
    title: 'Console call',
    description:
      '`console` output goes to a stream nothing structured reads, survives into production logs, and in a CLI ' +
      'mixes with the output a caller is parsing.',
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
    id: 'restriction.no-div-regex',
    group: 'restriction',
    title: 'Pattern beginning with an equals sign',
    description:
      '`/=/` opens ambiguously: a reader and some parsers see the start of a division-assignment before ' +
      'they see a regular expression.',
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
    id: 'restriction.no-dynamic-delete',
    group: 'restriction',
    title: 'delete with a computed key',
    description:
      'Deleting a computed key changes an object\'s shape at runtime in a way the type still describes, so every ' +
      'later read is typed as present and is not.',
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
    id: 'restriction.no-empty',
    group: 'restriction',
    title: 'Empty block',
    description:
      'An empty block is indistinguishable from an unfinished one: nothing records whether the case was handled ' +
      'by doing nothing or simply never written.',
  },
  {
    id: 'restriction.no-empty-function',
    group: 'restriction',
    title: 'Empty function',
    description:
      'A function that does nothing satisfies its callers\' type checks while performing none of the work its ' +
      'name promises.',
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
    id: 'restriction.no-eq-null',
    group: 'restriction',
    title: 'Loose null comparison',
    description:
      '`== null` matches both `null` and `undefined`. Where the two mean different things — absent versus not ' +
      'yet set — the comparison silently merges them.',
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
    id: 'restriction.no-invalid-void-type',
    group: 'restriction',
    title: 'void used as a value type',
    description:
      '`void` means "ignore whatever comes back", not "nothing comes back". Used as a parameter or property ' +
      'type it accepts any value while reading as though it accepts none.',
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
    id: 'restriction.no-multi-comp',
    group: 'restriction',
    title: 'Several components in one file',
    description:
      'Components sharing a file cannot be imported, tested or lazily loaded separately, and the file\'s name ' +
      'answers for only one of them.',
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
    id: 'restriction.no-non-null-assertion',
    group: 'restriction',
    title: 'Non-null assertion',
    description:
      '`!` removes the check without removing the possibility, so the value the compiler warned about still ' +
      'arrives — now as a runtime error at the first property access.',
  },
  {
    id: 'restriction.no-param-reassign',
    group: 'restriction',
    title: 'Parameter reassigned',
    description:
      'Reassigning a parameter means its name no longer refers to what the caller passed, so a reader reaching ' +
      'the bottom of the function has the wrong value in mind.',
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
    id: 'restriction.no-plusplus',
    group: 'restriction',
    title: 'Increment operator',
    description:
      '`++` both reads and writes, and whether the value used is before or after the change depends on which ' +
      'side of the operand it sits.',
  },
  {
    id: 'restriction.no-process-env',
    group: 'restriction',
    title: 'Direct process.env access',
    description:
      'Reading the environment where it is used spreads configuration across the codebase, and every read is an ' +
      'untyped `string | undefined` with no record of what it should have been.',
  },
  {
    id: 'restriction.no-process-exit',
    group: 'restriction',
    title: 'process.exit',
    description:
      '`process.exit` terminates immediately: buffered stdout is truncated, pending writes are lost and no ' +
      'cleanup handler runs.',
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
    id: 'restriction.no-relative-parent-imports',
    group: 'restriction',
    title: 'Import reaching out of its directory',
    description:
      '`../../..` encodes a path that breaks the moment a file moves, and it lets a module depend on parts of ' +
      'the tree its own directory says nothing about.',
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
    id: 'restriction.no-top-level-await',
    group: 'restriction',
    title: 'Top-level await',
    description:
      'Top-level `await` delays the module\'s evaluation, and everything importing it — directly or not — waits ' +
      'too. In a CommonJS consumer it fails outright.',
  },
  {
    id: 'restriction.no-use-before-define',
    group: 'restriction',
    title: 'Use before definition',
    description:
      'Hoisting makes this legal for declarations and a runtime error for `const` and `let`, so whether the ' +
      'line works depends on a keyword further down the file.',
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
    id: 'restriction.no-void',
    group: 'restriction',
    title: 'void operator',
    description:
      '`void` evaluates its operand and discards the result, which reads as deletion rather than as the ' +
      'deliberate ignoring of a value it actually is.',
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
    id: 'restriction.only-export-components',
    group: 'restriction',
    title: 'Module exporting both a component and other values',
    description:
      'Fast refresh replaces a module whose exports are all components and reloads the rest, so a mixed module ' +
      'loses state on every edit.',
  },
  {
    id: 'restriction.prefer-function-component',
    group: 'restriction',
    title: 'Class component',
    description:
      'A class component cannot use hooks, so any shared logic written as one is unavailable to it and has to ' +
      'be duplicated as lifecycle methods.',
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
    id: 'restriction.prefer-module',
    group: 'restriction',
    title: 'CommonJS construct',
    description:
      '`require`, `__dirname` and `module.exports` do not exist in an ES module, so code using them is pinned ' +
      'to a module system the rest of the ecosystem has left.',
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
    id: 'restriction.promise-function-async',
    group: 'restriction',
    title: 'Promise-returning function not declared async',
    description:
      'A function that returns a promise without being `async` throws synchronously when it fails before the ' +
      'first `await`, so the caller\'s `.catch` never runs and the error escapes the chain.',
  },
  {
    id: 'restriction.require-test-timeout',
    group: 'restriction',
    title: 'Test without a timeout',
    description:
      'A test with no timeout of its own inherits the runner\'s, so work that hangs is reported as a suite-wide ' +
      'stall rather than as the one test that never finished.',
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
    id: 'restriction.unambiguous',
    group: 'restriction',
    title: 'File that is neither script nor module',
    description:
      'A file with no import or export is parsed as a script by some tools and as a module by others, and the ' +
      'two differ on `this`, on strict mode and on top-level scope.',
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
    id: 'style.array-type',
    group: 'style',
    title: 'Mixed array type syntax',
    description:
      '`T[]` and `Array<T>` are the same type. Using both suggests a distinction, and readers look for it.',
  },
  {
    id: 'style.arrow-body-style',
    group: 'style',
    title: 'Inconsistent arrow body',
    description:
      'An arrow function written sometimes with a block and sometimes with an expression body makes the ' +
      'difference between returning a value and returning `undefined` a matter of two invisible characters.',
  },
  {
    id: 'style.avoid-new',
    group: 'style',
    title: 'Promise constructor around existing promises',
    description:
      'Wrapping already-async work in `new Promise` re-implements what `async` gives for free, and any throw ' +
      'between the constructor and `resolve` is swallowed rather than rejecting.',
  },
  {
    id: 'style.ban-tslint-comment',
    group: 'style',
    title: 'TSLint directive left in the source',
    description:
      'TSLint is discontinued and nothing reads the comment, so the suppression it looks like it ' +
      'applies does not.',
  },
  {
    id: 'style.capitalized-comments',
    group: 'style',
    title: 'Uncapitalised comment',
    description:
      'Comments that start inconsistently read as two different registers in one file — sentences and fragments ' +
      '— which makes it harder to tell prose from commented-out code.',
  },
  {
    id: 'style.class-literal-property-style',
    group: 'style',
    title: 'Constant exposed inconsistently',
    description:
      'A value that never changes can be a getter or a readonly field, and the two differ in whether ' +
      'every instance carries a copy.',
  },
  {
    id: 'style.component-definition-name-casing',
    group: 'style',
    title: 'Component registered with an inconsistent name',
    description:
      'The template matches the registered name, so a file that registers one casing and uses another ' +
      'silently renders nothing.',
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
    id: 'style.consistent-each-for',
    group: 'style',
    title: 'Table-driven test written with the other helper',
    description:
      '`each` and `for` differ in whether the row is spread into the arguments, so mixing them means ' +
      'reading the signature to know which.',
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
    id: 'style.consistent-generic-constructors',
    group: 'style',
    title: 'Type argument stated on the wrong side',
    description:
      '`const x: Foo<T> = new Foo()` and `const x = new Foo<T>()` differ in which side infers, so ' +
      'mixing them hides where a type actually comes from.',
  },
  {
    id: 'style.consistent-indexed-object-style',
    group: 'style',
    title: 'Mixed index signature syntax',
    description:
      'An index signature and a `Record` describe the same thing, so writing both makes the reader check ' +
      'whether one of them is doing something extra.',
  },
  {
    id: 'style.consistent-template-literal-escape',
    group: 'style',
    title: 'Escape written inconsistently inside a template',
    description:
      'A backtick and a `${` need escaping in a template and nothing else does; escaping more makes a ' +
      'reader check which characters were meant literally.',
  },
  {
    id: 'style.consistent-test-filename',
    group: 'style',
    title: 'Test file named against the convention',
    description:
      'The runner picks up tests by a filename pattern, so a file outside it is not run and nothing ' +
      'reports that.',
  },
  {
    id: 'style.consistent-type-assertions',
    group: 'style',
    title: 'Assertion written in the angle-bracket form',
    description:
      '`<T>value` is ambiguous with JSX and is a parse error in a `.tsx` file, so one of the two forms ' +
      'does not work everywhere.',
  },
  {
    id: 'style.consistent-type-definitions',
    group: 'style',
    title: 'Mixed interface and type alias',
    description:
      'Interfaces merge across declarations and type aliases do not. Using both for the same kind of shape ' +
      'means whether a later declaration extends or collides depends on the spelling.',
  },
  {
    id: 'style.consistent-type-exports',
    group: 'style',
    title: 'Type re-exported as a value',
    description:
      'A type re-exported without `type` survives into the emitted JavaScript as a real export, so a type-only ' +
      'dependency becomes a runtime one.',
  },
  {
    id: 'style.consistent-type-imports',
    group: 'style',
    title: 'Type imported as a value',
    description:
      'A type imported without `type` survives into the emitted JavaScript as a real import, so a type-only ' +
      'dependency becomes a runtime one and a module loads that need not have.',
  },
  {
    id: 'style.consistent-type-specifier-style',
    group: 'style',
    title: 'Mixed type-import spelling',
    description:
      '`import type { T }` and `import { type T }` mean the same thing. Using both makes it look as though the ' +
      'distinction matters, and readers stop to work out whether it does.',
  },
  {
    id: 'style.consistent-vitest-vi',
    group: 'style',
    title: 'Test API reached through the compatibility alias',
    description:
      '`vi` is the API and `jest` is a shim for it; a file mixing them has two names for one object.',
  },
  {
    id: 'style.css-value-at-rule',
    group: 'style',
    title: '@value in CSS modules',
    description:
      '`@value` is a CSS Modules extension no browser implements, so the declaration only works where a ' +
      'specific build step is in the pipeline — and silently does nothing anywhere else.',
  },
  {
    id: 'style.curly',
    group: 'style',
    title: 'Unbraced block',
    description:
      'An `if` without braces owns exactly one statement. Adding a second line under it looks conditional and ' +
      'runs unconditionally — the shape behind Apple\'s `goto fail`.',
  },
  {
    id: 'style.custom-error-definition',
    group: 'style',
    title: 'Error subclass that does not set its name',
    description:
      '`name` comes from the prototype, so a subclass that does not assign it reports as `Error` in a ' +
      'log, in a serialised payload and in anything matching on the name.',
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
    id: 'style.define-emits-declaration',
    group: 'style',
    title: 'Emits declared in the runtime form',
    description:
      'The runtime form is not checked against the calls that raise the events; the type form is.',
  },
  {
    id: 'style.define-props-declaration',
    group: 'style',
    title: 'Props declared in the runtime form',
    description:
      'The runtime form gives every prop `any` unless a validator is supplied, which the type form does ' +
      'not need.',
  },
  {
    id: 'style.define-props-destructuring',
    group: 'style',
    title: 'Props destructured against the compiler\'s setting',
    description:
      'Whether destructured props stay reactive depends on a compiler flag, so the same code is reactive in one ' +
      'project and a one-time snapshot in another.',
  },
  {
    id: 'style.empty-brace-spaces',
    group: 'style',
    title: 'Space inside an empty block',
    description:
      '`{ }` and `{}` are the same block, and the space suggests something was removed from it.',
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
    id: 'style.eslint-no-nested-ternary',
    group: 'style',
    title: 'Nested ternary',
    description:
      'A ternary inside a ternary has no visible grouping, so which condition selects which result is read from ' +
      'operator precedence rather than from the code.',
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
    id: 'style.exports-last',
    group: 'style',
    title: 'Exports scattered through the file',
    description:
      'Exports spread among internal declarations give no single place to read a module\'s public surface, so ' +
      'the answer to "what does this file offer?" is a search rather than a glance.',
  },
  {
    id: 'style.exports-style',
    group: 'style',
    title: 'Mixed CommonJS export style',
    description:
      'Assigning to `module.exports` and to `exports` in one module means the second has no effect once the ' +
      'first has replaced the object.',
  },
  {
    id: 'style.filename-case',
    group: 'style',
    title: 'Inconsistent filename case',
    description:
      'macOS and Windows match filenames case-insensitively and Linux does not, so an import that resolves on a ' +
      'developer\'s machine can fail only in CI.',
  },
  {
    id: 'style.first',
    group: 'style',
    title: 'Import placed after other statements',
    description:
      'Imports are hoisted whatever their position, so code written above one runs after the module it ' +
      'appears to precede.',
  },
  {
    id: 'style.func-name-matching',
    group: 'style',
    title: 'Function name that disagrees with its binding',
    description:
      'A function expression named one thing and assigned to another shows the name in a stack trace ' +
      'and the binding everywhere else, so a search for either finds half the story.',
  },
  {
    id: 'style.func-names',
    group: 'style',
    title: 'Anonymous function expression',
    description:
      'An unnamed function expression appears in a stack trace as `<anonymous>`, so the frame that threw cannot ' +
      'be identified from the trace alone.',
  },
  {
    id: 'style.func-style',
    group: 'style',
    title: 'Mixed function declaration style',
    description:
      'Declarations hoist and expressions do not. Mixing both in one file means whether a function can be ' +
      'called above its definition depends on which spelling it happened to get.',
  },
  {
    id: 'style.function-component-definition',
    group: 'style',
    title: 'Mixed component definition style',
    description:
      'Components written sometimes as declarations and sometimes as arrow constants differ in hoisting and in ' +
      'how they appear in a stack trace, for no difference in behaviour.',
  },
  {
    id: 'style.global-require',
    group: 'style',
    title: 'require away from the top of the module',
    description:
      'A `require` inside a function makes the module\'s dependencies invisible to anything reading its head, ' +
      'and moves the load — and any failure — to first call.',
  },
  {
    id: 'style.group-exports',
    group: 'style',
    title: 'Exports split across several statements',
    description:
      'A module\'s public surface stated in one place can be read; the same surface spread over a dozen `export` ' +
      'keywords has to be reconstructed.',
  },
  {
    id: 'style.grouped-accessor-pairs',
    group: 'style',
    title: 'Getter and setter separated',
    description:
      'A getter and its setter describe one property; declaring them apart lets a reader change one ' +
      'without seeing the other.',
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
    id: 'style.hook-use-state',
    group: 'style',
    title: 'State pair destructured with unrelated names',
    description:
      'The setter’s name is what tells a reader which state it writes; naming it independently means ' +
      'every call site has to be traced.',
  },
  {
    id: 'style.id-length',
    group: 'style',
    title: 'Single-character name',
    description:
      'A one-character identifier carries no information about what it holds, so understanding the line ' +
      'requires finding the assignment it came from.',
  },
  {
    id: 'style.init-declarations',
    group: 'style',
    title: 'Declaration without an initialiser',
    description:
      'A variable declared without a value holds `undefined` until something assigns it, and every read between ' +
      'the two points is a bug the type system cannot see.',
  },
  {
    id: 'style.jest-consistent-test-it',
    group: 'style',
    title: 'Mixed test and it',
    description:
      '`test` and `it` are the same function. Using both in one file makes a reader look for a difference that ' +
      'does not exist.',
  },
  {
    id: 'style.jest-max-expects',
    group: 'style',
    title: 'Too many assertions in one test',
    description:
      'A test with many assertions fails on the first one, so everything after it goes unmeasured and the ' +
      'report names one problem where there may be several.',
  },
  {
    id: 'style.jest-max-nested-describe',
    group: 'style',
    title: 'Deeply nested describe blocks',
    description:
      'Deep nesting means the setup that applies to a test is spread over several enclosing blocks, and reading ' +
      'the test alone no longer tells you what state it runs in.',
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
    id: 'style.jest-no-interpolation-in-snapshots',
    group: 'style',
    title: 'Value interpolated into a snapshot',
    description:
      'A snapshot holding an interpolation cannot be rewritten by the runner’s update mode, so the ' +
      'assertion has to be maintained by hand from then on.',
  },
  {
    id: 'style.jest-no-large-snapshots',
    group: 'style',
    title: 'Oversized snapshot',
    description:
      'A snapshot too large to read is approved without being read, so it records whatever the code did rather ' +
      'than what it should do, and updates it on every change.',
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
    id: 'style.jest-no-test-prefixes',
    group: 'style',
    title: 'Focused or skipped test written as a prefix',
    description:
      '`fit` and `xit` mean the same as `it.only` and `it.skip`, and a search for one form does not ' +
      'find the other.',
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
    id: 'style.jest-no-unneeded-async-expect-function',
    group: 'style',
    title: 'Async wrapper around a synchronous assertion',
    description:
      'An `async` callback given to a matcher that does not await it returns a promise nobody reads, so ' +
      'a rejection inside it is unhandled.',
  },
  {
    id: 'style.jest-padding-around-after-all-blocks',
    group: 'style',
    title: 'No blank line around afterAll',
    description:
      'Teardown pressed against the tests around it is easy to read as part of one of them, which hides when ' +
      'cleanup actually runs.',
  },
  {
    id: 'style.jest-padding-around-test-blocks',
    group: 'style',
    title: 'No blank line between tests',
    description:
      'Adjacent test blocks with no separation read as one, and a missing closing brace produces a file that ' +
      'still parses with half the tests nested inside another.',
  },
  {
    id: 'style.jest-prefer-called-with',
    group: 'style',
    title: 'Assertion on the call, not the arguments',
    description:
      '`toHaveBeenCalled` passes for any arguments at all, so a call made with the wrong values is reported as ' +
      'correct.',
  },
  {
    id: 'style.jest-prefer-comparison-matcher',
    group: 'style',
    title: 'Comparison asserted through its boolean result',
    description:
      '`expect(a > b).toBe(true)` reports “expected false to be true” on failure; the comparison ' +
      'matcher reports both numbers.',
  },
  {
    id: 'style.jest-prefer-each',
    group: 'style',
    title: 'Table of cases written as a loop',
    description:
      'A loop around a test names every case the same, so a failure report cannot say which row failed.',
  },
  {
    id: 'style.jest-prefer-equality-matcher',
    group: 'style',
    title: 'Equality asserted through its boolean result',
    description:
      '`expect(a === b).toBe(true)` discards both values before the matcher sees them, so the failure ' +
      'says nothing about what they were.',
  },
  {
    id: 'style.jest-prefer-expect-assertions',
    group: 'style',
    title: 'No assertion count in an async test',
    description:
      'An async test that returns before its callback runs passes with zero assertions executed. ' +
      '`expect.assertions(n)` is what turns that into a failure.',
  },
  {
    id: 'style.jest-prefer-expect-resolves',
    group: 'style',
    title: 'Promise awaited before the assertion rather than by it',
    description:
      '`expect(await p)` fails with an unhandled rejection when the promise rejects; ' +
      '`expect(p).resolves` reports it as the assertion that failed.',
  },
  {
    id: 'style.jest-prefer-hooks-in-order',
    group: 'style',
    title: 'Setup hooks declared out of order',
    description:
      'Hooks run in a fixed order whatever their position, so a file that lists them differently ' +
      'describes a sequence that does not happen.',
  },
  {
    id: 'style.jest-prefer-hooks-on-top',
    group: 'style',
    title: 'Hook declared below the tests it sets up',
    description:
      'The hook still runs first, so a reader meeting the tests before it has no way to know what state ' +
      'they start in.',
  },
  {
    id: 'style.jest-prefer-lowercase-title',
    group: 'style',
    title: 'Capitalised test title',
    description:
      'A test title is read as a sentence completing "it …". Capitalising it breaks the sentence in the report ' +
      'output.',
  },
  {
    id: 'style.jest-prefer-mock-promise-shorthand',
    group: 'style',
    title: 'Mock resolution written as an implementation',
    description:
      '`mockImplementation(() => Promise.resolve(x))` and `mockResolvedValue(x)` do the same thing, and ' +
      'only one says which.',
  },
  {
    id: 'style.jest-prefer-mock-return-shorthand',
    group: 'style',
    title: 'Mock return written as an implementation',
    description:
      'An implementation that only returns a constant hides that the mock has no behaviour.',
  },
  {
    id: 'style.jest-prefer-spy-on',
    group: 'style',
    title: 'Method replaced rather than spied on',
    description:
      'Assigning a mock over a method loses the original, so nothing restores it and every later test ' +
      'in the file inherits the replacement.',
  },
  {
    id: 'style.jest-prefer-strict-equal',
    group: 'style',
    title: 'Loose deep equality',
    description:
      '`toEqual` ignores `undefined` properties and class identity, so an object missing a field it should ' +
      'have, or of the wrong class entirely, still passes.',
  },
  {
    id: 'style.jest-prefer-to-be',
    group: 'style',
    title: 'Deep equality on a primitive',
    description:
      '`toEqual` on a primitive does a structural comparison where an identity check is what is meant, and its ' +
      'failure output is less precise about which value differed.',
  },
  {
    id: 'style.jest-prefer-to-contain',
    group: 'style',
    title: 'Membership asserted through an index',
    description:
      '`expect(xs.indexOf(x)).not.toBe(-1)` reports a number on failure; `toContain` reports the ' +
      'collection and the value.',
  },
  {
    id: 'style.jest-prefer-to-have-been-called-times',
    group: 'style',
    title: 'Call count asserted the long way',
    description:
      'Comparing `mock.calls.length` reports two integers on failure where the matcher reports which ' +
      'calls happened.',
  },
  {
    id: 'style.jest-prefer-to-have-length',
    group: 'style',
    title: 'Length compared by hand',
    description:
      'Asserting on `.length` reports "expected 3, got 2" without saying what was in the array; `toHaveLength` ' +
      'prints the contents on failure.',
  },
  {
    id: 'style.jest-prefer-todo',
    group: 'style',
    title: 'Empty test left as a passing one',
    description:
      'A test with no body passes, so a placeholder counts towards the suite as though it checked ' +
      'something. `todo` counts separately.',
  },
  {
    id: 'style.jest-require-top-level-describe',
    group: 'style',
    title: 'Tests with no enclosing describe',
    description:
      'Without an enclosing block the test\'s name is its whole context, so a failure in the report says nothing ' +
      'about which unit it belongs to.',
  },
  {
    id: 'style.jsx-boolean-value',
    group: 'style',
    title: 'Boolean prop passed inconsistently',
    description:
      '`prop` and `prop={true}` are the same, and mixing them makes a search for how a prop is set miss ' +
      'half its uses.',
  },
  {
    id: 'style.jsx-curly-brace-presence',
    group: 'style',
    title: 'String literal wrapped in braces',
    description:
      '`prop={"a"}` is `prop="a"` with an expression container that does nothing.',
  },
  {
    id: 'style.jsx-fragments',
    group: 'style',
    title: 'Fragment written in the long form',
    description:
      '`<React.Fragment>` and `<>` are the same node, and only the long form needs the import.',
  },
  {
    id: 'style.jsx-handler-names',
    group: 'style',
    title: 'Handler prop named unlike its handler',
    description:
      'A prop called `onX` bound to a function called something unrelated hides which event reaches ' +
      'which code.',
  },
  {
    id: 'style.jsx-max-depth',
    group: 'style',
    title: 'Deeply nested markup',
    description:
      'Markup nested past a few levels cannot be matched to its closing tags by eye, so an element moved one ' +
      'level out of place looks identical in the source.',
  },
  {
    id: 'style.jsx-pascal-case',
    group: 'style',
    title: 'Component used with a lower-case name',
    description:
      'JSX treats a lower-case tag as a DOM element, so a component named that way is rendered as an ' +
      'unknown HTML tag rather than called.',
  },
  {
    id: 'style.jsx-props-no-spreading',
    group: 'style',
    title: 'Props spread into an element',
    description:
      'Spreading hides which props a component actually receives, so a typo passes through silently and an ' +
      'unexpected key reaches the DOM.',
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
    id: 'style.max-nested-calls',
    group: 'style',
    title: 'Deeply nested calls',
    description:
      'Calls nested inside calls are evaluated inside-out while being read outside-in, so the order in which ' +
      'they run is the reverse of the order they appear.',
  },
  {
    id: 'style.max-params',
    group: 'style',
    title: 'Too many parameters',
    description:
      'A long positional parameter list is called correctly only by counting, and two adjacent arguments of the ' +
      'same type can be swapped without any diagnostic at all.',
  },
  {
    id: 'style.max-statements',
    group: 'style',
    title: 'Too many statements in one function',
    description:
      'A function accumulating statements accumulates reasons to change, and the sequence stops being checkable ' +
      'against what the function claims to do.',
  },
  {
    id: 'style.method-signature-style',
    group: 'style',
    title: 'Method shorthand in a type',
    description:
      'Method shorthand is checked bivariantly and a property with a function type is checked contravariantly, ' +
      'so the shorthand accepts arguments the other spelling rejects.',
  },
  {
    id: 'style.new-cap',
    group: 'style',
    title: 'Constructor case mismatch',
    description:
      'Capitalisation is how a reader tells a constructor from a plain call. When it disagrees with the `new`, ' +
      'the value\'s type is not readable from the call site.',
  },
  {
    id: 'style.newline-after-import',
    group: 'style',
    title: 'No blank line after imports',
    description:
      'Without a break, the first statement of a module reads as part of the import block, which is where side- ' +
      'effecting setup code hides.',
  },
  {
    id: 'style.next-tick-style',
    group: 'style',
    title: '`nextTick` used with a callback',
    description:
      'The callback and the promise forms both exist, and only one of them lets an error reach the ' +
      'caller.',
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
    id: 'style.no-await-expression-member',
    group: 'style',
    title: 'Property read off an await expression',
    description:
      '`(await x).y` puts the await and the access on one line, so which part is asynchronous is decided by ' +
      'parentheses that are easy to misplace.',
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
    id: 'style.no-console-spaces',
    group: 'style',
    title: 'Console argument padded with a space',
    description:
      'The console inserts a space between arguments, so a trailing one in the string is doubled in the ' +
      'output.',
  },
  {
    id: 'style.no-continue',
    group: 'style',
    title: 'continue statement',
    description:
      '`continue` moves the loop\'s exit condition away from the top, so what is skipped and what is processed ' +
      'is no longer readable from the loop header.',
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
    id: 'style.no-duplicate-imports',
    group: 'style',
    title: 'Module imported twice',
    description:
      'Two import statements for one module split its bindings across the file, so the answer to "what do we ' +
      'use from this?" needs both.',
  },
  {
    id: 'style.no-duplicates',
    group: 'style',
    title: 'Same module imported twice',
    description:
      'Two import statements from one module bind the same evaluation twice, so a reader has to check ' +
      'both to know what the file takes from it.',
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
    id: 'style.no-extra-label',
    group: 'style',
    title: 'Label on a loop that has only one',
    description:
      'A label is only needed to break out of an outer loop; on the innermost one it names something ' +
      '`break` already reaches.',
  },
  {
    id: 'style.no-implicit-coercion',
    group: 'style',
    title: 'Coercion by operator trick',
    description:
      '`!!x`, `+x` and `\'\' + x` convert types through punctuation, so the conversion is invisible to a reader ' +
      'scanning for one.',
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
    id: 'style.no-inferrable-types',
    group: 'style',
    title: 'Annotation the initialiser already states',
    description:
      '`const n: number = 1` restates what the literal says and stops the type narrowing to it.',
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
    id: 'style.no-label-var',
    group: 'style',
    title: 'Label sharing a name with a variable',
    description:
      'The two live in different namespaces, so the code is legal and reads as though `break x` had ' +
      'something to do with the value `x`.',
  },
  {
    id: 'style.no-labels',
    group: 'style',
    title: 'Labelled statement',
    description:
      'A label lets control jump out of arbitrary nesting, which is the one construct that makes a ' +
      'function unreadable top to bottom.',
  },
  {
    id: 'style.no-lone-blocks',
    group: 'style',
    title: 'Block that scopes nothing',
    description:
      'A bare block only creates a scope for `let`, `const` and `class`; without one of those it is a ' +
      'pair of braces that suggests a control structure was removed.',
  },
  {
    id: 'style.no-magic-numbers',
    group: 'style',
    title: 'Unexplained numeric literal',
    description:
      'A bare number states a value without its meaning, so nothing connects the two places that must change ' +
      'together when it changes.',
  },
  {
    id: 'style.no-mixed-requires',
    group: 'style',
    title: 'Mixed require and plain declarations',
    description:
      'Grouping imports with ordinary variables in one declaration hides which names come from outside the ' +
      'module.',
  },
  {
    id: 'style.no-multi-assign',
    group: 'style',
    title: 'One value assigned to several names at once',
    description:
      'Chained assignment binds right to left and, with `var`, can leave the leftmost implicitly ' +
      'global.',
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
    id: 'style.no-named-default',
    group: 'style',
    title: 'Default import written as a named one',
    description:
      '`import { default as x }` is the default export in a syntax that reads as a named one.',
  },
  {
    id: 'style.no-namespace',
    group: 'style',
    title: 'Namespace import',
    description:
      '`import * as x` pulls in every export, so a bundler cannot tell which are used and tree-shaking keeps ' +
      'all of them.',
  },
  {
    id: 'style.no-nesting',
    group: 'style',
    title: 'Promise chain nested inside a handler',
    description:
      'A chain started inside `then` is not joined to the outer one, so the outer promise settles ' +
      'before the inner work finishes and its rejection escapes.',
  },
  {
    id: 'style.no-nodejs-modules',
    group: 'style',
    title: 'Node built-in in shared code',
    description:
      'A module importing `node:fs` or `node:path` cannot run in a browser, a worker or an edge runtime. The ' +
      'failure appears at deploy time, not at build time.',
  },
  {
    id: 'style.no-null',
    group: 'style',
    title: 'null used alongside undefined',
    description:
      'A codebase using both has two spellings of absence, and every check has to handle both or silently miss ' +
      'one.',
  },
  {
    id: 'style.no-redundant-should-component-update',
    group: 'style',
    title: 'Update check on a pure component',
    description:
      '`PureComponent` already implements the comparison, and defining it again silently replaces the ' +
      'one the base class provides.',
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
    id: 'style.no-set-state',
    group: 'style',
    title: 'State written outside the constructor of a class component',
    description:
      'Direct `setState` in a class component is the pattern hooks replaced, and it is the one the ' +
      'concurrent renderer does not schedule.',
  },
  {
    id: 'style.no-sync',
    group: 'style',
    title: 'Synchronous file system call',
    description:
      'A `…Sync` call blocks the event loop for the whole operation, so every other request, timer and callback ' +
      'waits on this one file.',
  },
  {
    id: 'style.no-unnecessary-qualifier',
    group: 'style',
    title: 'Redundant namespace qualifier',
    description:
      'Naming the enclosing namespace from inside it adds a prefix that changes nothing, and hides which ' +
      'references genuinely cross a namespace boundary.',
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
    id: 'style.no-useless-collection-argument',
    group: 'style',
    title: 'Empty collection passed to a constructor',
    description:
      '`new Set([])` and `new Set()` build the same value, and the argument suggests the contents ' +
      'varied.',
  },
  {
    id: 'style.no-useless-computed-key',
    group: 'style',
    title: 'Computed key that is a literal',
    description:
      '`{ [’a’]: 1 }` is `{ a: 1 }` written so the reader has to check whether the key varies.',
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
    id: 'style.number-literal-case',
    group: 'style',
    title: 'Mixed numeric literal case',
    description:
      '`0xFF` and `0xff` are the same number spelled two ways, so a search for a constant finds only some of ' +
      'its uses.',
  },
  {
    id: 'style.numeric-separators-style',
    group: 'style',
    title: 'Inconsistent numeric separators',
    description:
      'Digit separators placed inconsistently are worse than none: `1_00_000` reads as a different magnitude at ' +
      'a glance than the number it is.',
  },
  {
    id: 'style.object-shorthand',
    group: 'style',
    title: 'Longhand object property',
    description:
      '`{ x: x }` and `{ x }` differ only in noise, and mixing them makes a genuine rename from `{ a: b }` ' +
      'harder to spot among them.',
  },
  {
    id: 'style.operator-assignment',
    group: 'style',
    title: 'Assignment that repeats its own target',
    description:
      '`x = x + 1` names the target twice, so a rename has to change both and can change one.',
  },
  {
    id: 'style.param-names',
    group: 'style',
    title: 'Promise executor parameters misnamed',
    description:
      'When the executor\'s parameters are not `resolve` and `reject`, which one settles and which one fails has ' +
      'to be worked out from the body.',
  },
  {
    id: 'style.parameter-properties',
    group: 'style',
    title: 'Constructor parameter property',
    description:
      'A parameter that also declares a field puts the class\'s state in its constructor signature, so reading ' +
      'the class\'s fields means reading its parameter list.',
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
    id: 'style.prefer-await-to-callbacks',
    group: 'style',
    title: 'Callback-style asynchrony',
    description:
      'A callback\'s errors arrive as a first argument that nothing forces anyone to read, and nesting them ' +
      'makes the order of operations a matter of indentation.',
  },
  {
    id: 'style.prefer-await-to-then',
    group: 'style',
    title: 'then chain instead of await',
    description:
      'A `.then` chain keeps its results in closures, so a value from one step is not in scope for a later one ' +
      'without threading it through, and a missing `return` breaks the chain silently.',
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
    id: 'style.prefer-called-exactly-once-with',
    group: 'style',
    title: 'Single call asserted in two steps',
    description:
      'Asserting the count and the arguments separately passes when a second call happened with ' +
      'different ones.',
  },
  {
    id: 'style.prefer-called-once',
    group: 'style',
    title: 'Call count asserted by hand',
    description:
      'Comparing a call count to one reports "expected 1, got 2" without saying what the extra call was; the ' +
      'dedicated matcher prints the arguments of every call.',
  },
  {
    id: 'style.prefer-called-times',
    group: 'style',
    title: 'Call count asserted through a comparison',
    description:
      'The dedicated matcher names the calls it saw; a comparison reports only that two numbers ' +
      'differed.',
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
    id: 'style.prefer-destructuring',
    group: 'style',
    title: 'Property read into a same-named variable',
    description:
      'Repeating the name on both sides of the assignment gives two places to change on a rename and one of ' +
      'them to miss.',
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
    id: 'style.prefer-ending-with-an-expect',
    group: 'style',
    title: 'Test that ends without asserting',
    description:
      'A test whose last statement is an action rather than an assertion often measures nothing after that ' +
      'point: an async action that rejects later fails no test.',
  },
  {
    id: 'style.prefer-es6-class',
    group: 'style',
    title: 'Component defined with the factory API',
    description:
      '`createClass` predates ES2015 classes, is not in any current React release, and its autobinding ' +
      'does not exist on a class.',
  },
  {
    id: 'style.prefer-expect-type-of',
    group: 'style',
    title: 'Type asserted through a runtime check',
    description:
      'A runtime assertion about a type passes on `any`, which is the case a type-level assertion ' +
      'exists to catch.',
  },
  {
    id: 'style.prefer-exponentiation-operator',
    group: 'style',
    title: 'Power written as a call',
    description:
      '`Math.pow(a, b)` and `a ** b` are the same operation, and only one of them reads as arithmetic.',
  },
  {
    id: 'style.prefer-export-from',
    group: 'style',
    title: 'Re-export written as an import and an export',
    description:
      'Importing a binding only to export it again introduces a local name that shadows nothing and means the ' +
      'value is read into this module\'s scope for no reason.',
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
    id: 'style.prefer-import-in-mock',
    group: 'style',
    title: 'Module reached inside a factory by requiring it',
    description:
      'A mock factory is hoisted above the imports, so a `require` inside it loads a second copy of the ' +
      'module the test then does not control.',
  },
  {
    id: 'style.prefer-importing-jest-globals',
    group: 'style',
    title: 'Test globals used without importing them',
    description:
      'Relying on injected globals ties the file to one runner\'s configuration; imported explicitly, the same ' +
      'file runs anywhere and type-checks on its own.',
  },
  {
    id: 'style.prefer-importing-vitest-globals',
    group: 'style',
    title: 'Test globals used without importing them',
    description:
      'Relying on injected globals ties the file to one runner configuration; imported explicitly it runs ' +
      'anywhere and type-checks on its own.',
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
    id: 'style.prefer-jest-mocked',
    group: 'style',
    title: 'Mock reached through a cast',
    description:
      'Asserting a module is a mock hides whether it was ever mocked; the helper checks it and keeps ' +
      'the original signature.',
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
    id: 'style.prefer-named-capture-group',
    group: 'style',
    title: 'Unnamed capture group',
    description:
      'A numbered group is read by position, so inserting a group anywhere earlier in the pattern silently ' +
      'renumbers every use of the ones after it.',
  },
  {
    id: 'style.prefer-negative-index',
    group: 'style',
    title: 'Index counted back from the length by hand',
    description:
      '`slice(0, x.length - 2)` names the receiver twice to say “two from the end”, and the arithmetic ' +
      'has to be revisited whenever the expression before it changes. A negative index says it once.',
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
    id: 'style.prefer-optional-catch-binding',
    group: 'style',
    title: 'Catch binding that is never read',
    description:
      'A named binding says the error matters somewhere; leaving it out says it does not.',
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
    id: 'style.prefer-readonly',
    group: 'style',
    title: 'Private field that is never reassigned',
    description:
      'A private field assigned only in the constructor and never again is `readonly` in fact but not in type, ' +
      'so nothing stops a later edit from reassigning it.',
  },
  {
    id: 'style.prefer-reduce-type-parameter',
    group: 'style',
    title: 'Reduce accumulator typed by assertion',
    description:
      'Asserting the accumulator\'s type inside the callback puts the claim where nothing checks it; the type ' +
      'parameter puts it where the compiler does.',
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
    id: 'style.prefer-regexp-exec',
    group: 'style',
    title: 'match used where exec is meant',
    description:
      '`String#match` and `RegExp#exec` return the same thing for a non-global pattern, but `match` reads as ' +
      'though it might return all matches — which it only does when the pattern is global.',
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
    id: 'style.prefer-return-this-type',
    group: 'style',
    title: 'Fluent method returning the class name',
    description:
      'A chainable method typed as its own class breaks in a subclass: the chain\'s type reverts to the base, so ' +
      'the subclass\'s own methods are not available after the first call.',
  },
  {
    id: 'style.prefer-string-raw',
    group: 'style',
    title: 'String with more backslashes than characters',
    description:
      'Every escape has to be counted twice — once in the source and once in the value — and ' +
      '`String.raw` removes the first count.',
  },
  {
    id: 'style.prefer-string-starts-ends-with',
    group: 'style',
    title: 'Prefix test written the long way',
    description:
      '`indexOf(x) === 0` and an anchored regular expression both answer "does it start with", but state it in ' +
      'a form the reader has to decode, and the regular expression allocates.',
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
    id: 'style.prefer-template',
    group: 'style',
    title: 'String built by concatenation',
    description:
      'Concatenation puts the quoting, the `+` and the spacing in the reader\'s way, and a missing space between ' +
      'two joined fragments is invisible in the source.',
  },
  {
    id: 'style.prefer-ternary',
    group: 'style',
    title: 'Branching that only picks a value',
    description:
      'An `if`/`else` whose branches differ only in one assigned value states the branching twice — once in the ' +
      'condition and once in the duplicated assignment.',
  },
  {
    id: 'style.prefer-to-be-object',
    group: 'style',
    title: 'Object-ness asserted through its constructor',
    description:
      '`instanceof Object` is false across realms and for a null-prototype object; the matcher checks ' +
      'the shape.',
  },
  {
    id: 'style.prefer-to-have-been-called',
    group: 'style',
    title: 'Call count asserted through the mock’s internals',
    description:
      'Reading `mock.calls.length` bypasses the matcher, so the failure names a number rather than the ' +
      'call that was expected.',
  },
  {
    id: 'style.prop-name-casing',
    group: 'style',
    title: 'Prop declared in a casing the template cannot use',
    description:
      'Attributes are matched case-insensitively in DOM templates, so a prop declared in the wrong ' +
      'casing is never bound.',
  },
  {
    id: 'style.relative-url-style',
    group: 'style',
    title: 'Relative URL written without an explicit prefix',
    description:
      '`new URL(’x’, base)` and `new URL(’./x’, base)` resolve differently when the base has no ' +
      'trailing slash.',
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
    id: 'style.require-default-prop',
    group: 'style',
    title: 'Optional prop with no default',
    description:
      'An optional prop with no default is `undefined` when omitted, so the template renders whatever ' +
      '`undefined` produces rather than a stated fallback.',
  },
  {
    id: 'style.require-direct-export',
    group: 'style',
    title: 'Component exported through a variable',
    description:
      'The compiler infers a component’s name from a direct default export; through a variable it has ' +
      'none, and every stack trace says `Anonymous`.',
  },
  {
    id: 'style.require-module-attributes',
    group: 'style',
    title: 'Empty import attribute block',
    description:
      '`with {}` states no attribute at all, so it is syntax the loader parses and then discards.',
  },
  {
    id: 'style.require-prop-types',
    group: 'style',
    title: 'Prop declared with no type',
    description:
      'A prop with no type is validated against nothing, so a wrong value reaches the template rather ' +
      'than a warning.',
  },
  {
    id: 'style.require-throws-description',
    group: 'style',
    title: 'Throws tag with no description',
    description:
      'A `@throws` with no description tells a caller that failure is possible but not which condition causes ' +
      'it, so there is nothing to write a handler against.',
  },
  {
    id: 'style.require-typed-ref',
    group: 'style',
    title: 'Reactive reference with no type',
    description:
      '`ref()` with neither a type argument nor an initial value is `Ref<any>`, which passes ' +
      '`noImplicitAny` without ever being checked.',
  },
  {
    id: 'style.self-closing-comp',
    group: 'style',
    title: 'Empty element written with a closing tag',
    description:
      'A pair of tags with nothing between them looks like markup whose content was removed, which is exactly ' +
      'what a bad merge produces.',
  },
  {
    id: 'style.sort-imports',
    group: 'style',
    title: 'Unsorted imports',
    description:
      'An unordered import block gives no place to look for a given module, and two branches adding imports at ' +
      'different points conflict where an ordering would have merged.',
  },
  {
    id: 'style.sort-keys',
    group: 'style',
    title: 'Unsorted object keys',
    description:
      'Without an order there is nowhere a key belongs, so a duplicate is not adjacent to the one it duplicates ' +
      'and two branches adding keys collide.',
  },
  {
    id: 'style.state-in-constructor',
    group: 'style',
    title: 'State initialised inconsistently',
    description:
      'A class that sets state in the constructor and as a field describes its initial shape in two ' +
      'places.',
  },
  {
    id: 'style.switch-case-braces',
    group: 'style',
    title: 'switch case without braces',
    description:
      'Cases share one scope without braces, so a `let` in one case is visible to — and collides with — every ' +
      'case after it.',
  },
  {
    id: 'style.switch-case-break-position',
    group: 'style',
    title: 'Break placed inconsistently in a case',
    description:
      'Where the `break` sits is what tells a reader whether a case falls through, and a file that ' +
      'varies it makes every case a question.',
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
    id: 'style.unicorn-no-nested-ternary',
    group: 'style',
    title: 'Nested ternary',
    description:
      'Nesting conditional expressions removes the visible grouping, so which result belongs to which condition ' +
      'is read from precedence rather than from the code.',
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
    id: 'style.vars-on-top',
    group: 'style',
    title: 'var declared away from the top',
    description:
      '`var` is hoisted to the top of its function whatever line it is written on, so a declaration in the ' +
      'middle describes a scope that does not match the code.',
  },
  {
    id: 'style.vitest-consistent-test-it',
    group: 'style',
    title: 'Mixed test and it',
    description:
      '`test` and `it` are the same function; using both makes a reader look for a difference that is not ' +
      'there.',
  },
  {
    id: 'style.vitest-max-expects',
    group: 'style',
    title: 'Too many assertions in one test',
    description:
      'The test stops at the first failing assertion, so everything after it is unmeasured and the report names ' +
      'one failure where there may be several.',
  },
  {
    id: 'style.vitest-max-nested-describe',
    group: 'style',
    title: 'Deeply nested describe blocks',
    description:
      'Setup applying to a test is spread over its enclosing blocks, so reading the test alone no longer says ' +
      'what state it runs in.',
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
    id: 'style.vitest-no-interpolation-in-snapshots',
    group: 'style',
    title: 'Value interpolated into a snapshot',
    description:
      'A snapshot holding an interpolation cannot be rewritten by the runner’s update mode, so the ' +
      'assertion has to be maintained by hand from then on.',
  },
  {
    id: 'style.vitest-no-large-snapshots',
    group: 'style',
    title: 'Oversized snapshot',
    description:
      'A snapshot too large to read is approved unread, so it records what the code did rather than what it ' +
      'should do.',
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
    id: 'style.vitest-no-test-prefixes',
    group: 'style',
    title: 'Focused or skipped test written as a prefix',
    description:
      '`fit` and `xit` mean the same as `it.only` and `it.skip`, and a search for one form does not ' +
      'find the other.',
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
    id: 'style.vitest-no-unneeded-async-expect-function',
    group: 'style',
    title: 'Async wrapper around a synchronous assertion',
    description:
      'An `async` callback given to a matcher that does not await it returns a promise nobody reads, so ' +
      'a rejection inside it is unhandled.',
  },
  {
    id: 'style.vitest-padding-around-after-all-blocks',
    group: 'style',
    title: 'No blank line around afterAll',
    description:
      'Teardown pressed against the tests around it reads as part of one of them, hiding when cleanup actually ' +
      'runs.',
  },
  {
    id: 'style.vitest-padding-around-test-blocks',
    group: 'style',
    title: 'No blank line between tests',
    description:
      'Adjacent tests with no separation read as one, and a missing brace produces a file that still parses ' +
      'with half the tests nested inside another.',
  },
  {
    id: 'style.vitest-prefer-called-with',
    group: 'style',
    title: 'Assertion on the call, not the arguments',
    description:
      '`toHaveBeenCalled` passes for any arguments, so a call made with the wrong values is reported as ' +
      'correct.',
  },
  {
    id: 'style.vitest-prefer-comparison-matcher',
    group: 'style',
    title: 'Comparison asserted through its boolean result',
    description:
      '`expect(a > b).toBe(true)` reports “expected false to be true” on failure; the comparison ' +
      'matcher reports both numbers.',
  },
  {
    id: 'style.vitest-prefer-equality-matcher',
    group: 'style',
    title: 'Equality asserted through its boolean result',
    description:
      '`expect(a === b).toBe(true)` discards both values before the matcher sees them, so the failure ' +
      'says nothing about what they were.',
  },
  {
    id: 'style.vitest-prefer-expect-assertions',
    group: 'style',
    title: 'No assertion count in an async test',
    description:
      'An async test that returns before its callback runs passes having executed no assertions at all; ' +
      '`expect.assertions(n)` is what turns that into a failure.',
  },
  {
    id: 'style.vitest-prefer-expect-resolves',
    group: 'style',
    title: 'Await inside expect',
    description:
      '`expect(await p)` fails the test with the raw rejection when the promise rejects, rather than with an ' +
      'assertion message naming what was expected.',
  },
  {
    id: 'style.vitest-prefer-hooks-in-order',
    group: 'style',
    title: 'Setup hooks declared out of order',
    description:
      'Hooks run in a fixed order whatever their position, so a file that lists them differently ' +
      'describes a sequence that does not happen.',
  },
  {
    id: 'style.vitest-prefer-hooks-on-top',
    group: 'style',
    title: 'Hook declared below the tests it sets up',
    description:
      'The hook still runs first, so a reader meeting the tests before it has no way to know what state ' +
      'they start in.',
  },
  {
    id: 'style.vitest-prefer-lowercase-title',
    group: 'style',
    title: 'Capitalised test title',
    description:
      'A test title completes the sentence "it …", and capitalising it breaks that sentence in the report.',
  },
  {
    id: 'style.vitest-prefer-mock-promise-shorthand',
    group: 'style',
    title: 'Mock resolution written as an implementation',
    description:
      '`mockImplementation(() => Promise.resolve(x))` and `mockResolvedValue(x)` do the same thing, and ' +
      'only one says which.',
  },
  {
    id: 'style.vitest-prefer-mock-return-shorthand',
    group: 'style',
    title: 'Mock return written as an implementation',
    description:
      'An implementation that only returns a constant hides that the mock has no behaviour.',
  },
  {
    id: 'style.vitest-prefer-spy-on',
    group: 'style',
    title: 'Method replaced rather than spied on',
    description:
      'Assigning a mock over a method loses the original, so nothing restores it and every later test ' +
      'in the file inherits the replacement.',
  },
  {
    id: 'style.vitest-prefer-strict-equal',
    group: 'style',
    title: 'Loose deep equality',
    description:
      '`toEqual` ignores `undefined` properties and class identity, so an object missing a field or of the ' +
      'wrong class still passes.',
  },
  {
    id: 'style.vitest-prefer-to-be',
    group: 'style',
    title: 'Deep equality on a primitive',
    description:
      'A structural comparison where identity is meant, with less precise failure output about which value ' +
      'differed.',
  },
  {
    id: 'style.vitest-prefer-to-contain',
    group: 'style',
    title: 'Membership asserted through an index',
    description:
      '`expect(xs.indexOf(x)).not.toBe(-1)` reports a number on failure; `toContain` reports the ' +
      'collection and the value.',
  },
  {
    id: 'style.vitest-prefer-to-have-been-called-times',
    group: 'style',
    title: 'Call count asserted the long way',
    description:
      'Comparing `mock.calls.length` reports two integers on failure where the matcher reports which ' +
      'calls happened.',
  },
  {
    id: 'style.vitest-prefer-to-have-length',
    group: 'style',
    title: 'Length compared by hand',
    description:
      'Asserting on `.length` reports the numbers without the contents; `toHaveLength` prints what was actually ' +
      'in the collection.',
  },
  {
    id: 'style.vitest-prefer-todo',
    group: 'style',
    title: 'Empty test left as a passing one',
    description:
      'A test with no body passes, so a placeholder counts towards the suite as though it checked ' +
      'something. `todo` counts separately.',
  },
  {
    id: 'style.vitest-require-top-level-describe',
    group: 'style',
    title: 'Tests with no enclosing describe',
    description:
      'Without an enclosing block the test\'s name is its entire context, so a failure says nothing about which ' +
      'unit it belongs to.',
  },
  {
    id: 'style.yoda',
    group: 'style',
    title: 'Comparison written with the constant first',
    description:
      '`if (’a’ === x)` guards against an assignment typo that `const` and this linter both already ' +
      'catch, at the cost of reading backwards.',
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
    id: 'suspicious.css-empty-source',
    group: 'suspicious',
    title: 'Empty stylesheet',
    description:
      'A stylesheet with no rules is still fetched, still parsed and still counted as a dependency by every ' +
      'consumer that imports it.',
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
    id: 'suspicious.no-array-reverse',
    group: 'suspicious',
    title: 'reverse mutates in place',
    description:
      '`Array#reverse` reorders the array it is called on and returns that same array. Anything else holding a ' +
      'reference — a cached list, a prop, the caller\'s own variable — silently changes order too.',
  },
  {
    id: 'suspicious.no-array-sort',
    group: 'suspicious',
    title: 'sort mutates in place',
    description:
      '`Array#sort` reorders the array it is called on rather than returning a new one, so sorting a value ' +
      'someone else owns changes it for them. `toSorted` returns a copy and leaves the original alone.',
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
    id: 'suspicious.no-underscore-dangle',
    group: 'suspicious',
    title: 'Underscore-prefixed name',
    description:
      'A leading or trailing underscore is a convention for "private", and the language has no such thing. ' +
      'Readers treat the member as internal while the compiler lets anything reach it.',
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
    id: 'suspicious.no-unsafe-type-assertion',
    group: 'suspicious',
    title: 'Assertion the types cannot support',
    description:
      '`as T` on a value that is not known to be a `T` replaces a check with a claim. Where the value came from ' +
      'outside the program — a response body, a parsed file — nothing has established the claim is true.',
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
