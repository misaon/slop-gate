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
  ruleRefKey: string
  engine: string
  severity: Severity
  message: string
  /**
   * Repo-relative POSIX path, or `null` for an orchestrator-level diagnostic with no file to point at — e.g.
   * `config.rule-overlap` when no config file was found. `null` rather than a placeholder path: naming a file that
   * does not exist on disk is the specific bug this type exists to make impossible, and reporters must treat it as
   * "no location" rather than an error.
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
   * Set when something silenced this finding rather than the run never producing it — "quiet because a human said
   * so" as against "quiet because nothing is wrong". `'inline'` (source comment, see `suppressions/parse.ts`) and
   * `'generated'` (the file is machine-written, see `discovery/detect-generated.ts`) are the producers today;
   * `'baseline'` (spec §12.2) and `'config'` are carried in the union so this shape does not need to change when
   * those land. Suppressed diagnostics stay in the array `normalizeDiagnostics` returns, and so in the per-file
   * cache entry, rather than being dropped — `run/check.ts` is what hides them from the default result and the
   * severity counts.
   */
  suppressed?: { by: 'inline' | 'baseline' | 'config' | 'generated'; reason?: string }
}
