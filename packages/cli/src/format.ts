import { isOneOf } from '@misaon/slop-gate-core'
import { REPORTER_NAMES, type ReporterName } from '@misaon/slop-gate-reporters'
import { EXIT_CODES } from './exit-codes.ts'

/**
 * Validates `--format` for every command that takes one, writing to stderr and setting the config exit
 * code on a bad value. `true` means the caller may proceed, and narrows the value it was given.
 *
 * **One function rather than one per command.** `check` and the three `rules` subcommands all accept
 * the same flag with the same accepted values, and a second copy is a second message to keep in step.
 */
export function validateFormat(format: string): format is ReporterName {
  if (isOneOf(format, REPORTER_NAMES)) return true
  process.stderr.write(`unknown format: ${format}. Expected one of ${REPORTER_NAMES.join(', ')}.\n`)
  process.exitCode = EXIT_CODES.config
  return false
}
