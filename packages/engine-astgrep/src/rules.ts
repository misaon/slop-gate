import type { LanguageId } from '@misaon/slop-gate-core'

/**
 * ast-grep's own language names, as they appear in a rule document's `language:` field. Only the
 * four our inventory can hand this engine are modelled; ast-grep supports twenty-odd more, and
 * adding one here is the whole change needed to reach it.
 *
 * **A rule document targets exactly one language, and the mapping is not one-to-one.** Confirmed
 * directly against 0.45.0: a `language: TypeScript` document matches `.ts`/`.mts`/`.cts` but *not*
 * `.tsx`, and a `language: JavaScript` document matches `.js`/`.jsx`/`.mjs`/`.cjs` but not `.ts`.
 * That is why every rule below declares a language list and `materializeAstGrepConfig` emits one
 * document per (rule, language) pair rather than one per rule — a single-document rule would
 * silently stop covering `.tsx` files with no warning of any kind.
 */
export type AstGrepLanguage = 'TypeScript' | 'Tsx' | 'JavaScript'

/**
 * Which of our `LanguageId`s each ast-grep language actually covers. `JavaScript` covering both
 * `js` and `jsx` is ast-grep's grammar choice, not a simplification of ours (verified: a
 * `language: JavaScript` document matches a `.jsx` file).
 */
export const LANGUAGE_COVERAGE: Readonly<Record<AstGrepLanguage, readonly LanguageId[]>> = {
  TypeScript: ['ts'],
  Tsx: ['tsx'],
  JavaScript: ['js', 'jsx'],
}

const SCRIPT: readonly AstGrepLanguage[] = ['TypeScript', 'Tsx', 'JavaScript']
const TYPESCRIPT_ONLY: readonly AstGrepLanguage[] = ['TypeScript', 'Tsx']

export type AstGrepRule = {
  /** Matches the `RuleEntry.engineRuleId` in `packages/core/src/registry/entries.manual.ts`, and the `ruleId` ast-grep echoes back on every finding. */
  readonly engineRuleId: string
  readonly languages: readonly AstGrepLanguage[]
  /** The diagnostic text. ast-grep returns it verbatim on each match, so it is written for the reader of a `sgate check`, not for a rule author. */
  readonly message: string
  /** ast-grep's `note`, surfaced as `RawDiagnostic.help`. This is where each rule's documented escape lives, so the way out travels with the finding. */
  readonly note: string
  /**
   * The rule document's body — everything below the `id`/`language`/`severity`/`message`/`note`
   * header, verbatim ast-grep YAML. Held as text rather than as a structure serialised by this
   * package on purpose: spec §14 wants these contributable without writing code, and a reviewer
   * comparing one of these against ast-grep's own documentation should be reading the same syntax
   * that documentation uses.
   */
  readonly body: string
}

/**
 * The pattern-shaped half of the `slop.*` ruleset (spec §14). Every entry here was measured against
 * two real corpora before it was given a level or a preset — this repository's own 163 JS/TS files
 * and 3,366 third-party files (~45 MB) under `node_modules` — and the numbers are recorded on the
 * matching `RuleEntry` in `packages/core/src/registry/entries.manual.ts`, not here, so a level and
 * its evidence stay in one place.
 *
 * **Three of §14's eleven concepts are deliberately absent from this list**, each because something
 * else already owns it or because ast-grep cannot express it honestly:
 *
 * - `slop.as-any-cast` is owned by oxlint's `typescript/no-explicit-any`, a tier-0 native rule that
 *   already covers `x as any`, `const x: any`, `function f(p: any)` and `<any>x` (verified against
 *   oxlint 1.76.0 on a five-case fixture: 4 reported, `code: "typescript(no-explicit-any)"`). A
 *   second entry claiming that concept would lose arbitration to it on engine preference and then
 *   contribute nothing but a `config.rule-overlap` — see `slop-double-cast` below for the one part
 *   of §14's description oxlint genuinely does not cover.
 * - `slop.redundant-comment` needs a comment's text compared against the text of the node beneath
 *   it. ast-grep's rule language relates *nodes* (`inside`, `has`, `precedes`, `follows`) and
 *   constrains a node's own text (`regex`); it has no way to test one node's text against another's.
 * - `slop.hallucinated-import` is `deps.unresolved-import`, already owned by knip and already
 *   described as "the static-analysis half of `slop.hallucinated-import`" on that concept.
 */
export const ASTGREP_RULES: readonly AstGrepRule[] = [
  {
    engineRuleId: 'slop-double-cast',
    languages: TYPESCRIPT_ONLY,
    message: 'Type assertion laundered through `unknown`/`any`. The compiler rejected the direct cast; this asserts it anyway.',
    note: 'Narrow the source type, or add a runtime type guard. If the assertion is genuinely load-bearing, keep it behind an inline `sgate-disable` comment saying why it holds.',
    body: `rule:
  any:
    - pattern: $EXPR as unknown as $TYPE
    - pattern: $EXPR as any as $TYPE
`,
  },
  {
    engineRuleId: 'slop-swallowed-error',
    languages: SCRIPT,
    message: 'This `catch` discards the error and continues. Nothing downstream can tell the operation failed.',
    note: 'Handle the error, rethrow it (`throw new Error(msg, { cause: err })`), or — if ignoring it is the point, as in a feature probe or an optional read — say so in an inline `sgate-disable` comment.',
    // Deliberately only the *empty* half of §14's "empty, or only logs and continues". The
    // logging half was written, measured and dropped: `catch ($E) { console.$M($$$A) }` found 5
    // sites across the third-party corpus and every one was a CLI printing an error at the top
    // level, which is the correct handling there rather than a swallowed error. Shipping it would
    // have added noise with no measured signal.
    body: `rule:
  any:
    - pattern:
        context: 'try {} catch {}'
        selector: catch_clause
    - pattern:
        context: 'try {} catch ($ERR) {}'
        selector: catch_clause
`,
  },
  {
    engineRuleId: 'slop-stub-implementation',
    languages: SCRIPT,
    message: 'Exported function whose entire body throws "not implemented". Callers can reach it; it cannot serve them.',
    note: 'Implement it, delete it, or make the contract explicit with an `abstract` member or a declared-only overload. A deliberate must-override hook can carry an inline `sgate-disable` comment naming the overriding subclass.',
    // Two composition choices here, both forced by measurement rather than taste.
    //
    // Matching the *body's* children rather than writing a whole-function `pattern:` — a whole-
    // function pattern matches structurally, so a pattern written without a return type does not
    // match `function f(): string { ... }` at all; the annotation is a real field on the node.
    // Going via the body sidesteps every optional field a signature can carry at once (return type,
    // generics, `async`, decorators, `export default`).
    //
    // `nthChild: { position: 1, ofRule: { not: { kind: comment } } }` rather than a
    // `'{ throw ... }'` body pattern, which would require the throw to be the body's *only* child
    // and therefore missed `{ // TODO \n throw new Error('Not implemented') }` — the shape a
    // half-finished function most often actually has. Anchoring on "first statement that is not a
    // comment" keeps the guard that matters (a `throw` reached only after real work, or from inside
    // an `if`, is an error path rather than a stub) and drops the one that did not.
    body: `rule:
  all:
    - any:
        - kind: function_declaration
        - kind: function_expression
        - kind: arrow_function
        - kind: method_definition
    - has:
        field: body
        has:
          all:
            - pattern: throw new $ERROR($MESSAGE)
            - nthChild:
                position: 1
                ofRule:
                  not: { kind: comment }
          stopBy: neighbor
    - inside:
        kind: export_statement
        stopBy: end
constraints:
  MESSAGE:
    regex: '(?i)(not[ _-]?(yet[ _-]?)?impl|unimplemented|^.?(TODO|FIXME)\\b|stub|placeholder|implement (this|me))'
`,
  },
  {
    engineRuleId: 'slop-narrative-comment',
    languages: SCRIPT,
    message: 'This comment describes a hypothetical other version of the code rather than explaining the code that is here.',
    note: 'Delete it, or replace it with what the code actually does and why. A comment that explains a decision is not this; a comment that narrates an implementation nobody wrote is.',
    // Every alternation below survived a measurement; six more did not, and dropping them is the
    // whole reason this one is shippable. Measured out, with counts, on 3,366 third-party files:
    // the reader-addressing family §14 names explicitly ("note that we", "as you can see",
    // "we'll", "here we", "notice that") — 76 findings, every one a legitimate explanation;
    // `\bfor now\b` — 25; `in (production|reality)` — 2; `for testing purposes` — 2;
    // `this is a (simplified|example|mock|dummy)` — 2 ("This is a simplified version",
    // "This is an example of what *not* to do"); `you can (typically|...)` — 1 ("you can probably
    // leave this undefined"), which is why `can` is absent from the `you (would|might|could)`
    // alternation that remains.
    body: `rule:
  kind: comment
  regex: '(?i)(in a real (implementation|app|application|system|project|scenario|world|setup|codebase|service)|(this|these|it) (is|are|would be) (just |only )?(a |an )?(placeholder|stub)\\b|placeholder (implementation|until)|for (demonstration|illustration|example) purposes|(simplified|abbreviated|omitted|shortened) for brevity|you (would|might|could) (typically|normally|usually|probably)|in practice,? you|would (go|be) here|replace (this|these) with your|(actual|real|production) implementation (would|will|goes|should))'
`,
  },
  {
    engineRuleId: 'slop-emoji-in-code',
    languages: SCRIPT,
    message: 'Emoji in a string literal. Decorative output that survives into logs, diffs and terminals that cannot render it.',
    note: 'Remove it, or — if the glyph is deliberate product output (a CLI status marker, a UI label) — record that in an inline `sgate-disable` comment, or turn the concept off for that path.',
    // `\\p{Emoji_Presentation}` rather than `\\p{Emoji}`, and the difference is a trap rather than
    // a preference: the `Emoji` property is true for `#`, `*` and every ASCII digit, so
    // `\\p{Emoji}` flags `'#1 and *2 and 3'`, `'25°C'` and `'€100'` (all three reproduced).
    // `Emoji_Presentation` excludes them, and the second alternative recovers the text-default
    // pictographs that only render as emoji when followed by VS16 — `⚠️` is `U+26A0 U+FE0F`, and
    // U+26A0 alone is `Emoji_Presentation=No`. `™`, `✓`, `→` and box-drawing characters are
    // correctly left alone by both halves.
    body: `rule:
  any:
    - kind: string
    - kind: template_string
  regex: '\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\x{FE0F}'
`,
  },
]

const BY_ID = new Map(ASTGREP_RULES.map((rule) => [rule.engineRuleId, rule]))

export function astGrepRuleById(engineRuleId: string): AstGrepRule | undefined {
  return BY_ID.get(engineRuleId)
}
