import type { Severity } from '@misaon/slop-gate-core'
import type { styleText } from 'node:util'

/**
 * All three are emoji at the same display width (two columns) — the only column-aligned position
 * in `pretty.ts`'s layout. Mixing in a width-one dingbat here would shear every column beneath it.
 * One constant makes swapping the set (or adding a fourth severity) a one-line edit.
 *
 * Extracted out of `pretty.ts` (not `check`-reporter-specific) so `sgate rules list`/`why`, which
 * show a concept's configured *level* rather than a diagnostic's severity, can render the same
 * glyph for the same word instead of inventing a second severity vocabulary.
 */
export const SEVERITY_GLYPH: Readonly<Record<Severity, string>> = {
  error: '🔴',
  warn: '🟡',
  info: '🔵',
}

/** `TERM=dumb` fallback for `SEVERITY_GLYPH` — also one column each, for the same reason. */
export const SEVERITY_GLYPH_ASCII: Readonly<Record<Severity, string>> = {
  error: 'E',
  warn: 'W',
  info: 'I',
}

export const SEVERITY_STYLE: Readonly<Record<Severity, Parameters<typeof styleText>[0]>> = {
  error: 'red',
  warn: 'yellow',
  info: 'blue',
}

export const SEVERITY_NOUN: Readonly<Record<Severity, string>> = {
  error: 'error',
  warn: 'warning',
  info: 'info',
}

export const SEVERITY_ORDER: readonly Severity[] = ['error', 'warn', 'info']
