import { buildRulesList, ENGINE_PREFERENCE, isOneOf, type RulesListOptions } from '@misaon/slop-gate-core'
import { renderRulesListJson, renderRulesListPretty, REPORTER_NAMES } from '@misaon/slop-gate-reporters'
import { defineCommand } from 'citty'
import { EXIT_CODES } from '../../exit-codes.ts'
import { validateFormat } from '../../format.ts'
import { supportsColor, supportsUnicode } from '../../terminal.ts'
import { readCliVersion } from '../../version.ts'
import { prepareRulesRun } from './shared.ts'

export const list = defineCommand({
  meta: { name: 'list', description: 'List the effective ruleset: concept, level, owner and why it is enabled' },
  args: {
    format: { type: 'string', default: 'pretty', description: `Output format (${REPORTER_NAMES.join(', ')})` },
    only: { type: 'string', description: 'Show only concepts matching this glob, e.g. `dead-code.*`' },
    engine: { type: 'string', description: 'Show only concepts this run currently elects the given engine to own' },
    uncovered: { type: 'boolean', default: false, description: 'Show only concepts with no capable engine in this run' },
    cwd: { type: 'string', description: 'Directory to analyse (defaults to the current directory)' },
  },
  async run({ args }) {
    const rootDir = args.cwd ?? process.cwd()
    if (!validateFormat(args.format)) return

    if (args.engine !== undefined && !isOneOf(args.engine, ENGINE_PREFERENCE)) {
      process.stderr.write(`unknown engine: ${args.engine}. Expected one of ${ENGINE_PREFERENCE.join(', ')}.\n`)
      process.exitCode = EXIT_CODES.config
      return
    }

    const resolved = await prepareRulesRun(rootDir)
    if (resolved === null) return

    const options: RulesListOptions = {
      ...(args.only === undefined ? {} : { only: args.only }),
      ...(args.engine === undefined ? {} : { engine: args.engine }),
      ...(args.uncovered ? { uncoveredOnly: true } : {}),
    }
    const entries = buildRulesList(resolved, options)

    const context = {
      write: (chunk: string) => process.stdout.write(chunk),
      color: supportsColor(),
      unicode: supportsUnicode(),
      width: process.stdout.columns ?? 80,
      version: readCliVersion(),
    }
    if (args.format === 'json') renderRulesListJson(entries, context)
    else renderRulesListPretty(entries, context)
  },
})
