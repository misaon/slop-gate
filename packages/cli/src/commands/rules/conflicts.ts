import { buildRulesConflicts } from '@misaon/slop-gate-core'
import { renderRulesConflictsJson, renderRulesConflictsPretty, REPORTER_NAMES } from '@misaon/slop-gate-reporters'
import { defineCommand } from 'citty'
import { supportsColor, supportsUnicode } from '../../terminal.ts'
import { readCliVersion } from '../../version.ts'
import { prepareRulesRun, validateFormat } from './shared.ts'

export const conflicts = defineCommand({
  meta: { name: 'conflicts', description: 'Show overlapping rules, shadowed candidates and dead overrides' },
  args: {
    format: { type: 'string', default: 'pretty', description: `Output format (${REPORTER_NAMES.join(', ')})` },
    cwd: { type: 'string', description: 'Directory to analyse (defaults to the current directory)' },
  },
  async run({ args }) {
    const rootDir = args.cwd ?? process.cwd()
    if (!validateFormat(args.format)) return

    const resolved = await prepareRulesRun(rootDir)
    if (resolved === null) return

    const data = buildRulesConflicts(resolved)

    const context = {
      write: (chunk: string) => process.stdout.write(chunk),
      color: supportsColor(),
      unicode: supportsUnicode(),
      width: process.stdout.columns ?? 80,
      version: readCliVersion(),
    }
    if (args.format === 'json') renderRulesConflictsJson(data, context)
    else renderRulesConflictsPretty(data, context)
  },
})
