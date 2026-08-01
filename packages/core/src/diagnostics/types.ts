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
}
