/**
 * Inline suppression directives (design spec §6.3):
 *
 * ```ts
 * // sgate-disable-next-line slop.as-any-cast -- upstream types are wrong, see #482
 * const x = y as any                          // sgate-disable-line -- reason
 * // sgate-disable-file correctness.no-debugger -- intentional in this fixture
 * ```
 *
 * The token is matched anywhere in a line rather than by parsing each language's own comment
 * syntax — M0 only analyses script files, but `#`-commented languages (shell, Docker, YAML) arrive
 * in M2, and a token scan costs nothing now and keeps working then without per-language grammar.
 * The known cost: a string literal containing the token verbatim reads as a real directive too.
 * That is deliberate, not an oversight — the same class of tool (ESLint, oxlint itself) accepts the
 * same trade-off, and building machinery to distinguish "inside a comment" from "inside a string"
 * is a per-language parser, exactly what this design exists to avoid paying for in M0.
 */
export type SuppressionKind = 'disable-next-line' | 'disable-line' | 'disable-file'

export type SuppressionDirective = {
  /** Which of the three supported directives this is. Block `disable`/`enable` pairs are
   *  deliberately not supported — they are the form most often opened and never closed. */
  readonly kind: SuppressionKind
  /** 1-based line the directive comment itself is written on. */
  readonly line: number
  /**
   * 1-based line this directive silences findings on. `null` for `disable-file`, which applies
   * anywhere in the file rather than to one line — there is no single line to name.
   */
  readonly appliesToLine: number | null
  /**
   * Concept ids or `engine/ruleId` keys — the same `RuleKey` shape `config.rules` accepts (§6.1),
   * so an engine rule id works as an escape hatch exactly where it already does in config. Empty
   * means the directive named no target, which silences every concept at this location. Targets
   * are matched as opaque strings, not validated against the concept catalogue or registry here: a
   * typo'd target simply never matches anything and is reported as `config.unused-suppression`
   * (see `apply.ts`) — that diagnostic *is* the validation, not a separate mechanism for it.
   */
  readonly targets: readonly string[]
  /**
   * Text after `--`, trimmed. `null` when no `--` was found, or what follows it is empty — a
   * missing reason still lets the directive apply (a caller drops the diagnostic it matches
   * regardless), it only additionally reports `config.suppression-missing-reason`. Whether to
   * report that is the caller's decision, not this parser's: `null` here is purely descriptive.
   */
  readonly reason: string | null
}

// Alternation order does not matter for correctness: `disable-next-line` and `disable-line` diverge
// at the very next character after `disable-` ('n' vs 'l'), so neither can be a prefix of the other
// at the position the engine tries them. `\b` on both ends stops `sgate-disable-next-lines` (a typo)
// or `xsgate-disable-file` (embedded in a longer identifier) from matching.
const DIRECTIVE_PATTERN = /\bsgate-(disable-next-line|disable-line|disable-file)\b/g

/**
 * Parses every inline suppression directive out of a file's source. Pure and file-agnostic — it
 * knows nothing about which diagnostics exist, which is deliberate: `apply.ts` composes matching
 * and unused-detection on top of this, and `normalizeDiagnostics` (`engine/normalize.ts`) is the
 * only caller that has both a diagnostic list and a `LineIndex` to turn `line`/`appliesToLine` back
 * into a byte range when it needs to point a synthesised diagnostic at the directive itself.
 */
export function parseSuppressions(source: string): SuppressionDirective[] {
  const directives: SuppressionDirective[] = []

  source.split('\n').forEach((rawLine, index) => {
    // A trailing `\r` (CRLF source) would otherwise become part of the reason text on the last
    // match of the line, or of the targets text when there is no `--` at all.
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const lineNumber = index + 1
    const matches = [...line.matchAll(DIRECTIVE_PATTERN)]
    if (matches.length === 0) return

    // Two directives on one line is not a pattern anyone is expected to write, but it must not
    // corrupt parsing if it happens (e.g. a copy-paste mistake): each match's own targets/reason
    // text stops at the *next* match's start rather than running to the end of the line, so the
    // second directive's tokens are never swallowed into the first directive's reason.
    matches.forEach((match, matchIndex) => {
      const kind = match[1] as SuppressionKind
      const restStart = (match.index ?? 0) + match[0].length
      const restEnd = matches[matchIndex + 1]?.index ?? line.length
      const { targets, reason } = parseRest(line.slice(restStart, restEnd))

      directives.push({
        kind,
        line: lineNumber,
        appliesToLine: kind === 'disable-file' ? null : kind === 'disable-line' ? lineNumber : lineNumber + 1,
        targets,
        reason,
      })
    })
  })

  return directives
}

/**
 * Splits "<targets> -- <reason>" on the first literal `--`. A double hyphen is safe as a delimiter
 * because no valid target ever contains one: concept ids and engine rule ids are single-hyphen
 * kebab-case segments joined by `.` or `/` (`slop.as-any-cast`, `oxlint/no-shadow`) — `--` never
 * occurs inside one, so this never misreads part of a legitimate target as the delimiter.
 */
function parseRest(rest: string): { targets: string[]; reason: string | null } {
  const dashIndex = rest.indexOf('--')
  const targetsText = (dashIndex === -1 ? rest : rest.slice(0, dashIndex)).trim()
  const reasonText = dashIndex === -1 ? null : rest.slice(dashIndex + 2).trim()

  return {
    // Comma- or whitespace-separated, and forgiving of both at once ("a, b" and "a b" and "a, , b"
    // all work) — multiple targets are expected to be rare enough that being liberal about the
    // separator costs nothing and saves a user a lookup.
    targets: targetsText.length === 0 ? [] : targetsText.split(/[\s,]+/).filter((token) => token.length > 0),
    reason: reasonText === null || reasonText.length === 0 ? null : reasonText,
  }
}
