import { relative } from 'node:path'
import { defineCommand } from 'citty'
import { baselinePathFor, compareStrings, readBaseline } from '@misaon/slop-gate-core'
import { writeBreakdown } from './shared.ts'

const MAX_LISTED_FILES = 10

/**
 * Reads the file and nothing else — no engine is spawned.
 *
 * Which means it cannot report staleness: whether an entry still matches is a property of a *run*, and
 * `sgate check` is what reports it. Keeping this offline is what makes it usable as "what did we agree
 * to carry?" without waiting for a full analysis, and it is the same boundary `sgate rules why` draws.
 *
 * No baseline is an answer, not an error, so exit 0 — this command is asked what the state is.
 */
export const show = defineCommand({
  meta: { name: 'show', description: 'Summarise the accepted findings recorded in the baseline' },
  args: {
    cwd: { type: 'string', description: 'Directory to read (defaults to the current directory)' },
  },
  async run({ args }) {
    const rootDir = args.cwd ?? process.cwd()
    const path = baselinePathFor(rootDir)
    const shown = relative(rootDir, path).replaceAll('\\', '/')

    const baseline = await readBaseline(path)
    if (baseline === null) {
      process.stdout.write(`no baseline at ${shown}. \`sgate baseline create\` writes one.\n`)
      return
    }

    const files = new Map<string, number>()
    for (const entry of baseline.accepted) {
      const key = entry.file ?? '(no file)'
      files.set(key, (files.get(key) ?? 0) + 1)
    }

    process.stdout.write(`  ${shown}: ${baseline.accepted.length} accepted finding(s) in ${files.size} file(s)\n\n`)
    writeBreakdown(baseline.accepted)

    const top = [...files].sort((a, b) => b[1] - a[1] || compareStrings(a[0], b[0])).slice(0, MAX_LISTED_FILES)
    if (top.length > 0) {
      process.stdout.write('\n  Most accepted\n')
      for (const [file, count] of top) process.stdout.write(`  ${String(count).padStart(5)}  ${file}\n`)
    }

    process.stdout.write('\n`sgate check` reports which of these are now fixed; `sgate baseline update` drops them.\n')
  },
})
