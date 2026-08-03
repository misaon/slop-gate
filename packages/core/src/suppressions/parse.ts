/**
 * Inline suppression directives (design spec §6.3). Three kinds, all in the `sgate-disable-*` family:
 * `-next-line` silences a finding on the line after the comment, `-line` on the line the comment itself sits on,
 * `-file` anywhere in the file. Each takes zero or more targets and a `-- reason`.
 *
 * **The worked examples live in the spec (§6.3) and in `docs/rules/*.md`, not here**, and the reason is this
 * file's own behaviour: the token is matched anywhere in a line, so source that spells a directive out in full
 * *is* carrying that directive. Three example lines in this header were three real `config.unused-suppression`
 * findings against this file on every run. Markdown is not scanned; source is, and there is no escape marker.
 *
 * The token is matched anywhere in a line rather than by parsing each language's own comment syntax: M0 only
 * analyses script files, but `#`-commented languages (shell, Docker, YAML) arrive in M2, and a token scan keeps
 * working then without per-language grammar. The known cost is that a string literal containing the token
 * verbatim reads as a real directive too — deliberate, the same trade-off ESLint and oxlint accept, because
 * distinguishing "inside a comment" from "inside a string" is a per-language parser.
 */
export type SuppressionKind = 'disable-next-line' | 'disable-line' | 'disable-file'

export type SuppressionDirective = {
  /** Block `disable`/`enable` pairs are deliberately not supported — they are the form most often opened and
   *  never closed. */
  readonly kind: SuppressionKind
  /** 1-based line the directive comment itself is written on. */
  readonly line: number
  /** 1-based line this directive silences findings on. `null` for `disable-file`, which applies anywhere in the
   *  file rather than to one line. */
  readonly appliesToLine: number | null
  /**
   * Concept ids or `<engine>/<engineRuleId>` keys — the same `RuleKey` shape `config.rules` accepts (§6.1), so an
   * engine rule id works as an escape hatch exactly where it already does in config. Empty means the directive
   * named no target, which silences every concept at this location. Matched as opaque strings, not validated
   * against the concept catalogue or registry here: a typo'd target never matches anything and is reported as
   * `config.unused-suppression` (see `apply.ts`) — that diagnostic *is* the validation.
   */
  readonly targets: readonly string[]
  /**
   * Text after `--`, trimmed. `null` when no `--` was found or what follows it is empty. A missing reason still
   * lets the directive apply — the caller drops the diagnostic it matches regardless and only additionally
   * reports `config.suppression-missing-reason`, which is the caller's decision and not this parser's.
   */
  readonly reason: string | null
}

// `\b` on both ends stops `sgate-disable-next-lines` (a typo) or `xsgate-disable-file` (embedded in a longer
// identifier) from matching.
const DIRECTIVE_PATTERN = /\bsgate-(disable-next-line|disable-line|disable-file)\b/g

/**
 * Parses every inline suppression directive out of a file's source. Deliberately knows nothing about which
 * diagnostics exist: `apply.ts` composes matching and unused-detection on top of this, and `normalizeDiagnostics`
 * (`engine/normalize.ts`) is the only caller holding both a diagnostic list and a `LineIndex`.
 */
export function parseSuppressions(source: string): SuppressionDirective[] {
  const directives: SuppressionDirective[] = []

  source.split('\n').forEach((rawLine, index) => {
    // A trailing `\r` (CRLF source) would otherwise become part of the reason text on the last match of the
    // line, or of the targets text when there is no `--` at all.
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const lineNumber = index + 1
    const matches = [...line.matchAll(DIRECTIVE_PATTERN)]
    if (matches.length === 0) return

    // Two directives on one line is not a pattern anyone is expected to write, but it must not corrupt parsing:
    // each match's own targets/reason text stops at the *next* match's start rather than at the end of the line,
    // so the second directive's tokens are never swallowed into the first directive's reason.
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
 * Splits "<targets> -- <reason>" on the first literal `--`. Safe as a delimiter because no valid target ever
 * contains one: concept ids and engine rule ids are single-hyphen kebab-case segments joined by `.` or `/`
 * (`slop.as-any-cast`, `oxlint/no-shadow`).
 */
function parseRest(rest: string): { targets: string[]; reason: string | null } {
  const dashIndex = rest.indexOf('--')
  const targetsText = (dashIndex === -1 ? rest : rest.slice(0, dashIndex)).trim()
  const reasonText = dashIndex === -1 ? null : rest.slice(dashIndex + 2).trim()

  return {
    targets: targetsText.length === 0 ? [] : targetsText.split(/[\s,]+/).filter((token) => token.length > 0),
    reason: reasonText === null || reasonText.length === 0 ? null : reasonText,
  }
}
