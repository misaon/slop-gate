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

type RelatedLocation = { file: string; range: ByteRange; message: string }

export type Diagnostic = {
  concept: string
  ruleRefKey: string
  engine: string
  severity: Severity
  message: string
  file: string | null
  range: ByteRange
  position: Position
  related?: RelatedLocation[]
  fix?: Fix
  help?: string
  docsUrl?: string
  fingerprint: string
  suppressed?: { by: 'inline' | 'baseline' | 'config' | 'generated'; reason?: string }
}
