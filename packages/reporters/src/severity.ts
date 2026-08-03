import type { Severity } from '@misaon/slop-gate-core'
import type { styleText } from 'node:util'

/** All three are emoji at the same display width (two columns), this being the only column-aligned position in
 *  `pretty.ts`'s layout — **mixing in a width-one dingbat here would shear every column beneath it**. Shared
 *  with `sgate rules list`/`why`, which render the same glyph for a concept's configured *level*. */
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
