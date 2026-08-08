import { relative } from 'node:path'
import { defineCommand } from 'citty'
import { baselinePathFor, readBaseline, writeBaseline } from '@misaon/slop-gate-core'
import { EXIT_CODES } from '../../exit-codes.ts'
import { baselineRun, warnGitignored, warnUnavailable, writeBreakdown } from './shared.ts'
import { resolveRootDir } from '../../root-dir.ts'

export const create = defineCommand({
  meta: { name: 'create', description: 'Accept every finding in this repository, so only new ones fail' },
  args: {
    cwd: { type: 'string', description: 'Directory to analyse (defaults to the current directory)' },
    force: { type: 'boolean', default: false, description: 'Replace an existing baseline, accepting anything new in it' },
  },
  async run({ args }) {
    const rootDir = resolveRootDir(args.cwd)
    const path = baselinePathFor(rootDir)
    const shown = relative(rootDir, path).replaceAll('\\', '/')

    const existing = await readBaseline(path)
    if (existing !== null && !args.force) {
      process.stderr.write(
        `${shown} already exists with ${existing.accepted.length} accepted finding(s).\n` +
          'Run `sgate baseline update` to drop the ones that are fixed, or `sgate baseline create --force` ' +
          'to replace it and accept everything found now.\n',
      )
      process.exitCode = EXIT_CODES.config
      return
    }

    const run = await baselineRun(rootDir)
    if (run === null) return
    warnUnavailable(run.result)

    await writeBaseline(path, run.entries)

    process.stdout.write(`  accepted ${run.entries.length} finding(s) into ${shown}\n\n`)
    writeBreakdown(run.entries)
    if (existing !== null) {
      const before = new Set(existing.accepted.map((entry) => entry.fingerprint))
      const after = new Set(run.entries.map((entry) => entry.fingerprint))
      const added = run.entries.filter((entry) => !before.has(entry.fingerprint)).length
      const dropped = existing.accepted.filter((entry) => !after.has(entry.fingerprint)).length
      process.stdout.write(`\n  ${added} newly accepted, ${dropped} no longer found\n`)
    }
    await warnGitignored(rootDir)
    process.stdout.write(`\nCommit ${shown}. \`sgate check\` reads it from now on; \`--no-baseline\` ignores it.\n`)
  },
})
