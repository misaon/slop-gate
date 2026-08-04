import type { RawDiagnostic } from '@misaon/slop-gate-core'
import { toPosix } from '@misaon/slop-gate-core'

export const UNFORMATTED_RULE_ID = 'unformatted'

const MESSAGE = 'This file is not formatted.'
const HELP = 'Run `sgate fix` to format it, or turn `format.unformatted` off to keep your own formatter.'

/**
 * Turns `oxfmt --list-different`'s output into one diagnostic per file.
 *
 * **Verified against oxfmt 0.62.0, because two of its properties are easy to get wrong.** The list is one path
 * per line with **no trailing newline**, so a naive `split('\n')` on a terminated stream would be fine and on
 * this one yields no empty tail — filtering blanks rather than assuming either shape. And `--list-different`
 * really does list only the files that differ: an earlier reading of it as "every file considered" was wrong,
 * caused by a test file that genuinely differed (oxfmt's default adds semicolons, so `export const y = 1` is
 * not formatted).
 *
 * `--check` would work as a gate too — it exits 1 on a difference, contrary to a first reading of mine that
 * measured `head`'s exit code through a pipe rather than oxfmt's — but it prints prose for a human. This one
 * prints paths, which is data.
 */
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
      /**
       * The whole file, deliberately, rather than the first byte that differs.
       *
       * Reformatting rewrites the file; there is no line at which it "went wrong". Anchoring on the first
       * difference would put a code frame around a correct line and invite someone to fix that one spot, and
       * anchoring on byte 0 would claim the problem is at the top. An empty range at 0 is the honest statement
       * that this finding is about the file and not about a position in it, and it is what the reporters
       * already render as a file-level finding.
       */
      range: { start: 0, end: 0 },
      help: HELP,
      docsUrl: 'https://oxc.rs/docs/guide/usage/formatter.html',
    }))
}
