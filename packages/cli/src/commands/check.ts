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

/** `'invalid'` rather than a thrown error or a silent `undefined` — see the call site. */
export function parseMaxTokens(raw: string | undefined): number | undefined | 'invalid' {
  if (raw === undefined) return undefined
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : 'invalid'
}

export const check = defineCommand({
  meta: { name: 'check', description: 'Analyse the repository and report findings' },
  args: {
    format: { type: 'string', default: 'pretty', description: `Output format (${REPORTER_NAMES.join(', ')})` },
    'max-warnings': { type: 'string', description: 'Fail when warnings exceed this count' },
    'max-tokens': { type: 'string', description: 'Bound the `agent` report to this many estimated tokens' },
    // Named `cache` (default true), not `no-cache`: citty treats any raw `--no-X` argv token as
    // "negate X", stripping the `no-` prefix before its own parser ever sees it — regardless of
    // whether an arg literally named `no-X` exists. An arg named `no-cache` can therefore never be
    // set from `--no-cache`; citty reads it as "negate `cache`", a flag that isn't defined, and
    // `no-cache` silently keeps its default forever. Naming the flag `cache` lets citty's own
    // negation convention do what the CLI surface (`--no-cache`) already promises.
    cache: { type: 'boolean', default: true, negativeDescription: 'Ignore cached results' },
    // Named for the same reason `cache` is — citty reads `--no-baseline` as "negate `baseline`".
    baseline: { type: 'boolean', default: true, negativeDescription: 'Report every finding, including the accepted ones' },
    'require-engines': {
      type: 'boolean',
      default: false,
      description: 'Exit 3 when a registered engine is not installed here',
    },
    cwd: { type: 'string', description: 'Directory to analyse (defaults to the current directory)' },
  },
  async run({ args }) {
    const rootDir = args.cwd ?? process.cwd()

    if (!validateFormat(args.format)) return

    // Rejected rather than coerced or ignored. `--max-tokens` is the one flag whose whole purpose is
    // to make the report drop findings; a typo silently falling back to "no limit" would hand an
    // agent a report far larger than its context, and a typo silently becoming `0` would hand it one
    // with no findings at all. Both are failures the caller has to be told about.
    const maxTokens = parseMaxTokens(args['max-tokens'])
    if (maxTokens === 'invalid') {
      process.stderr.write(`--max-tokens must be a positive integer, got: ${args['max-tokens']}\n`)
      process.exitCode = EXIT_CODES.config
      return
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

    // The run's source text, shared with `streamCheck` (see `CheckOptions.sources`) rather than kept
    // as a second copy here. Both directions matter: a file some engine had to examine is already in
    // here by the time its diagnostics reach the reporter, and a file every engine served from cache
    // was never read at all, so the reporter's own read below is the one that fills it. Either way
    // `pretty` reads each file once per run instead of once per code frame.
    const sources = new Map<string, string>()

    const reporter = createReporter(args.format, {
      write: (chunk) => process.stdout.write(chunk),
      color: supportsColor(),
      unicode: supportsUnicode(),
      width: process.stdout.columns ?? 80,
      version: readCliVersion(),
      ...(maxTokens === undefined ? {} : { maxTokens }),
      readSource: (file) => {
        // `file` is `null` for an orchestrator-level diagnostic with nothing to attribute (see
        // `Diagnostic.file`). Guarded explicitly rather than left to `join(rootDir, null)` throwing
        // and being swallowed by the `catch` below — that would work by accident, not by contract.
        if (file === null) return null
        const held = sources.get(file)
        if (held !== undefined) return held
        try {
          const content = readFileSync(join(rootDir, file), 'utf8')
          sources.set(file, content)
          return content
        } catch {
          // A failure is deliberately not remembered. Storing a `null` would need a second map with a
          // wider value type than the run's own, and the case is a file deleted between discovery and
          // rendering — rare, and bounded by the frame dedupe to a handful of retries.
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
        // From process start, not from the top of `streamCheck`. This process exists to run one check,
        // so node boot, the module graph and `loadCliConfig` are part of what the user waited for —
        // roughly 73 ms of a 157 ms run here, which is why the reported figure used to be about half
        // the one a stopwatch gives. See `CheckOptions.startedAt`.
        startedAt: 0,
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
    // Written to stderr, not left to the reporter. `pretty` shows an absent engine only when it
    // actually cost the run coverage, and `--require-engines` fails on absence regardless — without
    // this, the one case the flag exists for (a CI image missing a tool the repository does not yet
    // exercise) would exit 3 with nothing on screen naming the tool or the flag.
    if (args['require-engines'] === true) {
      for (const engine of unavailableEngines) {
        const install = engine.install === undefined ? '' : ` Install it with \`${engine.install}\`.`
        process.stderr.write(`--require-engines: \`${engine.engine}\` is not installed — ${engine.reason}.${install}\n`)
      }
    }

    const maxWarnings = args['max-warnings'] === undefined ? undefined : Number(args['max-warnings'])
    process.exitCode = resolveExitCode({
      counts: result?.counts ?? { error: 0, warn: 0, info: 0 },
      engineFailures: result?.engineFailures ?? [],
      unavailableEngines,
      requireEngines: args['require-engines'] === true,
      ...(maxWarnings === undefined || Number.isNaN(maxWarnings) ? {} : { maxWarnings }),
    })
  },
})
