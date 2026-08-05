import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineCommand } from 'citty'
import { streamCheck, type CheckResult } from '@misaon/slop-gate-core'
import { REPORTER_NAMES, createReporter } from '@misaon/slop-gate-reporters'
import { DEFAULT_CONFIG, loadCliConfig } from '../config.ts'
import { defaultEngines } from '../engine-registry.ts'
import { EXIT_CODES, resolveExitCode } from '../exit-codes.ts'
import { validateFormat } from '../format.ts'
import { supportsColor, supportsUnicode } from '../terminal.ts'
import { readCliVersion } from '../version.ts'
import { resolveRootDir } from '../root-dir.ts'

export function parseMaxTokens(raw: string | undefined): number | undefined | 'invalid' {
  if (raw === undefined) return undefined
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : 'invalid'
}

export function parseMaxWarnings(raw: string | undefined): number | undefined | 'invalid' {
  if (raw === undefined) return undefined
  if (raw.trim() === '') return 'invalid'
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 0 ? value : 'invalid'
}

export const check = defineCommand({
  meta: { name: 'check', description: 'Analyse the repository and report findings' },
  args: {
    format: { type: 'string', default: 'pretty', description: `Output format (${REPORTER_NAMES.join(', ')})` },
    'max-warnings': { type: 'string', description: 'Fail when warnings exceed this count' },
    'max-tokens': { type: 'string', description: 'Bound the `agent` report to this many estimated tokens' },
    'max-findings': { type: 'string', description: 'Bound the `json` report to this many diagnostics' },
    cache: { type: 'boolean', default: true, negativeDescription: 'Ignore cached results' },
    baseline: { type: 'boolean', default: true, negativeDescription: 'Report every finding, including the accepted ones' },
    'require-engines': {
      type: 'boolean',
      default: false,
      description: 'Exit 3 when a registered engine is not installed here',
    },
    timing: { type: 'boolean', default: false, description: 'Show where the run spent its time' },
    cwd: { type: 'string', description: 'Directory to analyse (defaults to the current directory)' },
  },
  async run({ args }) {
    const rootDir = resolveRootDir(args.cwd)

    if (!validateFormat(args.format)) return

    const maxFindings = parseMaxTokens(args['max-findings'])
    if (maxFindings === 'invalid') {
      process.stderr.write(`--max-findings must be a positive integer, got: ${args['max-findings']}\n`)
      process.exitCode = EXIT_CODES.config
      return
    }

    const maxTokens = parseMaxTokens(args['max-tokens'])
    if (maxTokens === 'invalid') {
      process.stderr.write(`--max-tokens must be a positive integer, got: ${args['max-tokens']}\n`)
      process.exitCode = EXIT_CODES.config
      return
    }

    const maxWarnings = parseMaxWarnings(args['max-warnings'])
    if (maxWarnings === 'invalid') {
      process.stderr.write(`--max-warnings must be a non-negative integer, got: ${args['max-warnings']}\n`)
      process.exitCode = EXIT_CODES.config
      return
    }

    const timing = args.timing === true && args.format !== 'agent'
    if (args.timing === true && !timing) {
      process.stderr.write('--timing is ignored by `--format=agent`: that report is byte-identical between runs by design.\n')
    }

    const loaded = await loadCliConfig(rootDir, DEFAULT_CONFIG)
    if (loaded.kind === 'error') {
      process.exitCode = EXIT_CODES.config
      return
    }

    const controller = new AbortController()
    const onInterrupt = (): void => controller.abort()
    process.once('SIGINT', onInterrupt)
    process.once('SIGTERM', onInterrupt)

    const sources = new Map<string, string>()

    const reporter = createReporter(args.format, {
      write: (chunk) => process.stdout.write(chunk),
      color: supportsColor(),
      unicode: supportsUnicode(),
      width: process.stdout.columns ?? 80,
      version: readCliVersion(),
      ...(maxTokens === undefined ? {} : { maxTokens }),
      ...(maxFindings === undefined ? {} : { maxFindings }),
      readSource: (file) => {
        if (file === null) return null
        const held = sources.get(file)
        if (held !== undefined) return held
        try {
          const content = readFileSync(join(rootDir, file), 'utf8')
          sources.set(file, content)
          return content
        } catch {
          return null
        }
      },
    })

    let result: CheckResult | undefined
    try {
      for await (const event of streamCheck({
        rootDir,
        config: loaded.config,
        ...(loaded.kind === 'loaded' ? { configFile: loaded.configFile } : {}),
        engines: defaultEngines(rootDir, loaded.kind === 'loaded' ? loaded.configFile : undefined, loaded.config.ignore),
        useCache: args.cache,
        useBaseline: args.baseline,
        sources,
        startedAt: 0,
        timing,
        signal: controller.signal,
      })) {
        reporter.onEvent(event)
        if (event.type === 'done') result = event.result
      }
    } finally {
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onInterrupt)
    }

    const unavailableEngines = result?.unavailableEngines ?? []
    if (args['require-engines'] === true) {
      for (const engine of unavailableEngines) {
        const install = engine.install === undefined ? '' : ` Install it with \`${engine.install}\`.`
        process.stderr.write(`--require-engines: \`${engine.engine}\` is not installed — ${engine.reason}.${install}\n`)
      }
    }

    process.exitCode = resolveExitCode({
      counts: result?.counts ?? { error: 0, warn: 0, info: 0 },
      engineFailures: result?.engineFailures ?? [],
      unavailableEngines,
      requireEngines: args['require-engines'] === true,
      ...(maxWarnings === undefined ? {} : { maxWarnings }),
    })
  },
})
