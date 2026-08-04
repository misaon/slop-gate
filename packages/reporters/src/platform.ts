import type { Severity } from '@misaon/slop-gate-core'

export const PLATFORM_SEVERITY = {
  sarif: { error: 'error', warn: 'warning', info: 'note' },
  github: { error: 'error', warn: 'warning', info: 'notice' },
  gitlab: { error: 'major', warn: 'minor', info: 'info' },
} as const satisfies Record<string, Readonly<Record<Severity, string>>>

export const PLATFORM_LIMITS = {
  githubAnnotationsPerLevel: 10,
  sarifResultsPerRun: 25_000,
} as const

export const escapeCommandData = (value: string): string =>
  value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')

export const escapeCommandProperty = (value: string): string =>
  escapeCommandData(value).replaceAll(':', '%3A').replaceAll(',', '%2C')
