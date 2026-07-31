import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineCommand } from 'citty'
import {
  ConfigError,
  loadConfig,
  streamCheck,
  toPosix,
  type CheckResult,
  type SlopGateConfig,
} from '@misaon/slop-gate-core'
import { createOxlintEngine } from '@misaon/slop-gate-engine-oxlint'
import { REPORTER_NAMES, createReporter, type ReporterName } from '@misaon/slop-gate-reporters'
import { EXIT_CODES, resolveExitCode } from '../exit-codes.ts'

const DEFAULT_CONFIG: SlopGateConfig = { extends: ['recommended'] }

export const check = defineCommand({
  meta: { name: 'check', description: 'Analyse the repository and report findings' },
  args: {
    format: { type: 'string', default: 'pretty', description: `Output format (${REPORTER_NAMES.join(', ')})` },
    'max-warnings': { type: 'string', description: 'Fail when warnings exceed this count' },
    // Named `cache` (default true), not `no-cache`: citty treats any raw `--no-X` argv token as
    // "negate X", stripping the `no-` prefix before its own parser ever sees it — regardless of
    // whether an arg literally named `no-X` exists. An arg named `no-cache` can therefore never be
    // set from `--no-cache`; citty reads it as "negate `cache`", a flag that isn't defined, and
    // `no-cache` silently keeps its default forever. Naming the flag `cache` lets citty's own
    // negation convention do what the CLI surface (`--no-cache`) already promises.
    cache: { type: 'boolean', default: true, negativeDescription: 'Ignore cached results' },
    cwd: { type: 'string', description: 'Directory to analyse (defaults to the current directory)' },
  },
  async run({ args }) {
    const rootDir = args.cwd ?? process.cwd()

    if (!REPORTER_NAMES.includes(args.format as ReporterName)) {
      process.stderr.write(`unknown format: ${args.format}. Expected one of ${REPORTER_NAMES.join(', ')}.\n`)
      process.exitCode = EXIT_CODES.config
      return
    }

    let configFailed = false
    const loaded = await loadConfig(rootDir).catch((error: unknown) => {
      if (error instanceof ConfigError) {
        process.stderr.write(`${error.message}\n`)
        configFailed = true
        return undefined
      }
      throw error
    })
    if (configFailed) {
      process.exitCode = EXIT_CODES.config
      return
    }

    const controller = new AbortController()
    const onInterrupt = (): void => controller.abort()
    process.once('SIGINT', onInterrupt)
    process.once('SIGTERM', onInterrupt)

    const reporter = createReporter(args.format as ReporterName, {
      write: (chunk) => process.stdout.write(chunk),
      color: supportsColor(),
      readSource: (file) => {
        try {
          return readFileSync(join(rootDir, file), 'utf8')
        } catch {
          return null
        }
      },
    })

    let result: CheckResult | undefined
    try {
      for await (const event of streamCheck({
        rootDir,
        config: loaded?.config ?? DEFAULT_CONFIG,
        // `loadConfig` resolves an absolute path (it walks up from `rootDir` to find the file).
        // `configFile` lands verbatim in every `config.*` diagnostic's `file` field, and paths are
        // repo-relative POSIX in every public data structure and output format — the CLI is the
        // boundary that owes `streamCheck` that contract, not `streamCheck` itself.
        ...(loaded === null || loaded === undefined
          ? {}
          : { configFile: toPosix(relative(rootDir, loaded.file)) }),
        engines: [createOxlintEngine()],
        useCache: args.cache,
        signal: controller.signal,
      })) {
        reporter.onEvent(event)
        if (event.type === 'done') result = event.result
      }
    } finally {
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onInterrupt)
    }

    const maxWarnings = args['max-warnings'] === undefined ? undefined : Number(args['max-warnings'])
    process.exitCode = resolveExitCode({
      counts: result?.counts ?? { error: 0, warn: 0, info: 0 },
      engineFailures: result?.engineFailures ?? [],
      ...(maxWarnings === undefined || Number.isNaN(maxWarnings) ? {} : { maxWarnings }),
    })
  },
})

function supportsColor(): boolean {
  if (process.env['NO_COLOR'] !== undefined && process.env['NO_COLOR'] !== '') return false
  if (process.env['FORCE_COLOR'] !== undefined && process.env['FORCE_COLOR'] !== '') return true
  return process.stdout.isTTY === true
}
