import { relative } from 'node:path'
import { EngineError, type RawDiagnostic, type RawSeverity } from '@misaon/slop-gate-core'

type AstGrepMatch = {
  ruleId?: string
  message?: string
  /** ast-grep emits `null`, not an absent key, for a rule document that declares no `note`. */
  note?: string | null
  severity?: string
  file?: string
  range?: { byteOffset?: { start?: number; end?: number } }
  /** The rewritten text, present only when the rule document declares a `fix:`. */
  replacement?: string
  /** The span `replacement` replaces. Not always the match's own range — a `fix` may be scoped narrower. */
  replacementOffsets?: { start?: number; end?: number }
}

/**
 * ast-grep's `hint` has no counterpart in `RawSeverity`; `advice` is the closest existing member and
 * already carries the same "below info" meaning for oxlint. Unmapped values fall back to `warning`
 * rather than throwing: the severity a rule document asked for is not information a diagnostic needs
 * (`normalizeDiagnostics` recomputes it from the resolved level), so a new ast-grep severity name is
 * not a reason to drop a real finding.
 */
const SEVERITIES: Readonly<Record<string, RawSeverity>> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  hint: 'advice',
}

/**
 * Parses `ast-grep scan --json` output.
 *
 * The shape is a flat array of matches, one per finding, each already carrying the rule id that
 * produced it — no per-file nesting and no summary object, so unlike oxlint's payload there is
 * nothing here to cross-check the loaded ruleset against. That check lives in `run` instead, against
 * `--inspect summary` on stderr (see `index.ts`).
 *
 * Byte offsets come straight from `range.byteOffset`; ast-grep is Rust and speaks bytes, which is
 * exactly what `RawDiagnostic.range` wants (spec §10). The per-match `start`/`end` line and column
 * fields are deliberately ignored — they are 0-based, and core's normaliser derives 1-based UTF-16
 * positions from the byte range itself.
 */
export function parseAstGrepOutput(stdout: string, rootDir: string): RawDiagnostic[] {
  const trimmed = stdout.trim()
  if (trimmed === '') return []

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (cause) {
    throw new EngineError('astgrep', `could not parse ast-grep json output: ${trimmed.slice(0, 200)}`, { cause })
  }
  if (!Array.isArray(parsed)) {
    throw new EngineError('astgrep', `ast-grep json output is not an array: ${trimmed.slice(0, 200)}`)
  }

  const results: RawDiagnostic[] = []
  for (const match of parsed as AstGrepMatch[]) {
    const start = match.range?.byteOffset?.start
    const end = match.range?.byteOffset?.end
    if (match.ruleId === undefined || match.file === undefined || start === undefined || end === undefined) continue

    results.push({
      engineRuleId: match.ruleId,
      message: match.message ?? match.ruleId,
      severity: SEVERITIES[match.severity ?? ''] ?? 'warning',
      file: toRepoRelative(match.file, rootDir),
      range: { start, end },
      // `note` is where each rule's documented escape lives (spec §14 requires one per rule), so it
      // travels with the finding rather than only existing on a documentation page.
      ...(match.note === undefined || match.note === null ? {} : { help: match.note }),
      ...fixOf(match),
    })
  }
  return results
}

/**
 * ast-grep's own rewrite for a rule that declares a `fix:` — verified against ast-grep 0.45.0, which
 * emits `replacement` and `replacementOffsets` on every match of such a rule and neither key at all
 * otherwise. Both are needed: `replacementOffsets` is a span in its own right and is **not**
 * guaranteed to equal the match's `range.byteOffset`, so deriving one from the other would silently
 * mis-place a fix the moment a rule scopes its rewrite to part of what it matched.
 *
 * No tier is attached here; `normalizeDiagnostics` stamps it from `RuleEntry.fixKind` (see
 * `RawFix`). **No rule this package ships declares a `fix:` today** — spec §14 records why for each,
 * and the short version is that every current `slop.*` finding is a judgement about intent that a
 * mechanical rewrite cannot make. This function is what a rule that does declare one will need, and
 * it is covered by tests against real ast-grep output rather than left to be written later against a
 * format nobody re-checked.
 */
function fixOf(match: AstGrepMatch): { fix: { edits: Array<{ range: { start: number; end: number }; replacement: string }> } } | Record<string, never> {
  const start = match.replacementOffsets?.start
  const end = match.replacementOffsets?.end
  if (match.replacement === undefined || start === undefined || end === undefined) return {}
  return { fix: { edits: [{ range: { start, end }, replacement: match.replacement }] } }
}

/**
 * ast-grep echoes back the path exactly as it was given on the command line, so a run whose `cwd` is
 * `rootDir` and whose arguments are repo-relative already produces repo-relative output. The
 * absolute branch exists for the case where it does not — a caller passing absolute paths — and is
 * the same normalisation `engine-oxlint` and `engine-tsc` apply.
 */
function toRepoRelative(file: string, rootDir: string): string {
  const normalized = file.replaceAll('\\', '/')
  const root = rootDir.replaceAll('\\', '/')
  if (!normalized.startsWith('/') && !/^[a-z]:\//i.test(normalized)) return normalized
  return relative(root, normalized).replaceAll('\\', '/')
}
