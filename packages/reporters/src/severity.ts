import type { Severity } from '@misaon/slop-gate-core'
import type { styleText } from 'node:util'

export const SEVERITY_GLYPH: Readonly<Record<Severity, string>> = {
  error: '🔴',
  warn: '🟡',
  info: '🔵',
}

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
