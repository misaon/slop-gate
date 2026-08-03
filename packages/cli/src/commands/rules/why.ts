import { explainConcept } from '@misaon/slop-gate-core'
import { renderRulesWhyJson, renderRulesWhyPretty, REPORTER_NAMES } from '@misaon/slop-gate-reporters'
import { defineCommand } from 'citty'
import { EXIT_CODES } from '../../exit-codes.ts'
import { validateFormat } from '../../format.ts'
import { supportsColor, supportsUnicode } from '../../terminal.ts'
import { readCliVersion } from '../../version.ts'
import { prepareRulesRun } from './shared.ts'

export const why = defineCommand({
  meta: { name: 'why', description: 'Explain why a concept is (or is not) enabled, and who owns it' },
  args: {
    concept: { type: 'positional', required: true, description: 'Concept id to explain, e.g. `dead-code.unused-variable`' },
    format: { type: 'string', default: 'pretty', description: `Output format (${REPORTER_NAMES.join(', ')})` },
    cwd: { type: 'string', description: 'Directory to analyse (defaults to the current directory)' },
  },
  async run({ args }) {
    const rootDir = args.cwd ?? process.cwd()
    if (!validateFormat(args.format)) return

    const resolved = await prepareRulesRun(rootDir)
    if (resolved === null) return

    const explanation = explainConcept(args.concept, resolved)

    const context = {
      write: (chunk: string) => process.stdout.write(chunk),
      color: supportsColor(),
      unicode: supportsUnicode(),
      width: process.stdout.columns ?? 80,
      version: readCliVersion(),
    }
    if (args.format === 'json') renderRulesWhyJson(explanation, context)
    else renderRulesWhyPretty(explanation, context)

    // A concept id this catalogue has never heard of is a usage error (the same class as an
    // unknown `--format`), not "the concept exists but is quiet" — those two must not share an
    // exit code, or a typo silently reads as "correctly explained: not enabled".
    if (!explanation.isKnownConcept) process.exitCode = EXIT_CODES.config
  },
})
