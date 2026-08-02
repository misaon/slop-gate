export type Severity = 'error' | 'warn' | 'info'

export type ByteRange = { start: number; end: number }

export type Position = {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export type FixKind = 'safe' | 'suggested' | 'unsafe'

export type Edit = { range: ByteRange; replacement: string }

export type Fix = { kind: FixKind; description: string; edits: Edit[] }

export type RelatedLocation = { file: string; range: ByteRange; message: string }

export type Diagnostic = {
  concept: string
  ruleId: string
  engine: string
  severity: Severity
  message: string
  /**
   * Repo-relative POSIX path, or `null` for an orchestrator-level diagnostic with no file to point
   * at — e.g. `config.rule-overlap` when no config file was found. `null` is deliberate rather than
   * a placeholder path: naming a file that does not exist on disk is the specific bug this type
   * exists to make impossible. Reporters must treat it as "no location", not as an error.
   */
  file: string | null
  range: ByteRange
  position: Position
  related?: RelatedLocation[]
  fix?: Fix
  help?: string
  docsUrl?: string
  fingerprint: string
  /**
   * Set when something silenced this finding rather than the run never producing it — the
   * distinction that lets a reporter, cache entry or future `--show-suppressed` flag tell "quiet
   * because nothing is wrong" apart from "quiet because a human said so". `'inline'` (source
   * comment, see `suppressions/parse.ts`) and `'generated'` (the file is machine-written, see
   * `discovery/generated.ts`) are the producers today; `'baseline'` (spec §12.2) and `'config'` are
   * carried in the union so this shape does not need to change when those land.
   * Suppressed diagnostics are kept in the array returned by `normalizeDiagnostics` (and so in the
   * per-file cache entry) rather than dropped — `run/check.ts` is what hides them from the default
   * result and severity counts, which is the seam a future `--show-suppressed` flag would change
   * instead of restructuring anything upstream of it.
   */
  suppressed?: { by: 'inline' | 'baseline' | 'config' | 'generated'; reason?: string }
}
