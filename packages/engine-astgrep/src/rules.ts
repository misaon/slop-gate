import type { LanguageId } from '@misaon/slop-gate-core'

export type AstGrepLanguage = 'TypeScript' | 'Tsx' | 'JavaScript'

export const LANGUAGE_COVERAGE: Readonly<Record<AstGrepLanguage, readonly LanguageId[]>> = {
  TypeScript: ['ts'],
  Tsx: ['tsx'],
  JavaScript: ['js', 'jsx'],
}

const SCRIPT: readonly AstGrepLanguage[] = ['TypeScript', 'Tsx', 'JavaScript']
const TYPESCRIPT_ONLY: readonly AstGrepLanguage[] = ['TypeScript', 'Tsx']

export type AstGrepRule = {
  readonly engineRuleId: string
  readonly languages: readonly AstGrepLanguage[]
  readonly message: string
  readonly note: string
  readonly body: string
}

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
