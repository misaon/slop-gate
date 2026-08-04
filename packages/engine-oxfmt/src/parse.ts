import type { RawDiagnostic } from '@misaon/slop-gate-core'
import { toPosix } from '@misaon/slop-gate-core'

export const UNFORMATTED_RULE_ID = 'unformatted'

const MESSAGE = 'This file is not formatted.'
const HELP = 'Run `sgate fix` to format it, or turn `format.unformatted` off to keep your own formatter.'

export function parseUnformattedFiles(stdout: string): RawDiagnostic[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((path) => ({
      engineRuleId: UNFORMATTED_RULE_ID,
      message: MESSAGE,
      severity: 'warning' as const,
      file: toPosix(path),
      range: { start: 0, end: 0 },
      help: HELP,
      docsUrl: 'https://oxc.rs/docs/guide/usage/formatter.html',
    }))
}
