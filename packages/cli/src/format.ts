import { isOneOf } from '@misaon/slop-gate-core'
import { REPORTER_NAMES, type ReporterName } from '@misaon/slop-gate-reporters'
import { EXIT_CODES } from './exit-codes.ts'

export function validateFormat(format: string): format is ReporterName {
  if (isOneOf(format, REPORTER_NAMES)) return true
  process.stderr.write(`unknown format: ${format}. Expected one of ${REPORTER_NAMES.join(', ')}.\n`)
  process.exitCode = EXIT_CODES.config
  return false
}
