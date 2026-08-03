import { relative } from 'node:path'
import { defineCommand } from 'citty'
import { baselinePathFor, readBaseline, writeBaseline } from '@misaon/slop-gate-core'
import { EXIT_CODES } from '../../exit-codes.ts'
import { baselineRun, writeBreakdown } from './shared.ts'

/**
 * Prunes, and only prunes: an entry that no longer matches any finding is removed, and nothing is added.
 *
 * The obvious alternative — re-snapshot whatever the repository holds now — is what `create --force` does, and it
 * is a separate command on purpose. **A fingerprint cannot distinguish a finding that moved because its file was
 * renamed from one written this morning** (the path is part of the identity, §10.1), so a command that added
 * entries would sometimes accept new debt and could never say which. Splitting them means the command a team runs
 * habitually can only ever make the baseline smaller, and a rename goes through `create --force`, whose output
 * says how many findings that newly accepted.
 */
export const update = defineCommand({
  meta: { name: 'update', description: 'Drop baseline entries whose findings are fixed' },
  args: {
    cwd: { type: 'string', description: 'Directory to analyse (defaults to the current directory)' },
  },
  async run({ args }) {
    const rootDir = args.cwd ?? process.cwd()
    const path = baselinePathFor(rootDir)
    const shown = relative(rootDir, path).replaceAll('\\', '/')

    const existing = await readBaseline(path)
    if (existing === null) {
      process.stderr.write(`no baseline at ${shown}. Create one with \`sgate baseline create\`.\n`)
      process.exitCode = EXIT_CODES.config
      return
    }

    const run = await baselineRun(rootDir)
    if (run === null) return

    const found = new Set(run.entries.map((entry) => entry.fingerprint))
    const kept = existing.accepted.filter((entry) => found.has(entry.fingerprint))
    const dropped = existing.accepted.filter((entry) => !found.has(entry.fingerprint))
    const unaccepted = run.entries.filter((entry) => !existing.accepted.some((old) => old.fingerprint === entry.fingerprint))

    if (dropped.length === 0) {
      process.stdout.write(`  ${shown} is already current: ${kept.length} accepted finding(s), none fixed.\n`)
    } else {
      await writeBaseline(path, kept)
      process.stdout.write(`  dropped ${dropped.length} fixed finding(s) from ${shown}, ${kept.length} still accepted\n\n`)
      writeBreakdown(dropped)
    }

    if (unaccepted.length > 0) {
      // Named but not written: these are what `sgate check` is currently failing on, and this command does not add
      // them because it cannot tell which of them anyone agreed to.
      process.stdout.write(
        `\n  ${unaccepted.length} finding(s) are not in the baseline and still fail \`sgate check\`.\n` +
          '  Fix them, or accept them deliberately with `sgate baseline create --force`.\n',
      )
    }
  },
})
