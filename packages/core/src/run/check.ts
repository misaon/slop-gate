import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deriveResultKey, hashJson, type ResultKeyInput } from '../cache/keys.ts'
import { openResultStore } from '../cache/result-store.ts'
import { openStatIndex } from '../cache/stat-index.ts'
import { createRuleSetResolver } from '../config/resolve.ts'
import type { SlopGateConfig } from '../config/types.ts'
import type { Diagnostic, Severity } from '../diagnostics/types.ts'
import { buildInventory, type FileSource } from '../discovery/inventory.ts'
import type { InventoryFile } from '../discovery/types.ts'
import { LEVEL_TO_SEVERITY, normalizeDiagnostics } from '../engine/normalize.ts'
import type { Engine, RawDiagnostic } from '../engine/types.ts'
import { compareStrings } from '../ordering.ts'
import { buildPlan } from '../planner/plan.ts'
import { electOwners } from '../registry/elect.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import { ruleRefKey, type RuleEntry } from '../registry/types.ts'

export type CheckOptions = {
  rootDir: string
  config: SlopGateConfig
  configFile?: string
  engines: readonly Engine[]
  entries?: readonly RuleEntry[]
  fileSource?: FileSource
  cacheDir?: string
  useCache?: boolean
  batchSize?: number
  signal?: AbortSignal
}

export type CheckResult = {
  diagnostics: Diagnostic[]
  counts: Record<Severity, number>
  engineFailures: Array<{ engine: string; message: string }>
  stats: {
    filesScanned: number
    /** Files assigned to at least one engine by the plan — the denominator `filesFromCache` is a count of. */
    filesAnalysed: number
    filesFromCache: number
    enginesRun: number
    durationMs: number
  }
  ruleset: {
    enabledConcepts: number
    suppressed: number
    uncovered: readonly string[]
    unknownKeys: readonly string[]
  }
}

export type CheckEvent =
  | { type: 'diagnostic'; diagnostic: Diagnostic }
  | { type: 'engine-failed'; engine: string; message: string }
  | { type: 'done'; result: CheckResult }

const DEFAULT_BATCH_SIZE = 500

// A suppressed diagnostic (`Diagnostic.suppressed` set — today only `by: 'inline'`, from a source
// comment; see `suppressions/apply.ts`) is still a real object in the per-file cache entry
// `normalizeDiagnostics` returns — that is what lets it survive a warm cache hit and is what a
// future `--show-suppressed` flag would read instead of restructuring anything upstream of it. This
// is the one seam that decides whether the *default* result and severity counts see it: applied
// identically to a fresh normalize and a cache hit below, so which path served a file never changes
// what the user sees. Module-level rather than declared inside `streamCheck`: it captures nothing
// from that generator's scope, so nesting it there would recreate an identical closure on every run.
const isVisible = (diagnostic: Diagnostic): boolean => diagnostic.suppressed === undefined

export async function runCheck(options: CheckOptions): Promise<CheckResult> {
  for await (const event of streamCheck(options)) {
    if (event.type === 'done') return event.result
  }
  throw new Error('streamCheck completed without a done event')
}

export async function* streamCheck(options: CheckOptions): AsyncIterable<CheckEvent> {
  const startedAt = performance.now()
  const signal = options.signal ?? new AbortController().signal
  const entries = options.entries ?? RULE_ENTRIES
  const cacheDir = options.cacheDir ?? join(options.rootDir, '.slop-gate', 'cache')
  const useCache = options.useCache ?? true
  // Deliberately not defaulted to a literal filename: when no config file was found, `configFile`
  // stays `undefined` all the way through to `configDiagnostics`, which attributes those
  // diagnostics to `file: null` rather than a path the user does not have on disk.
  const configFile = options.configFile

  const resolver = createRuleSetResolver({
    config: options.config,
    ...(configFile === undefined ? {} : { configFile }),
  })
  const inventory = await buildInventory({
    rootDir: options.rootDir,
    ...(options.config.ignore === undefined ? {} : { ignore: options.config.ignore }),
    ...(options.fileSource === undefined ? {} : { source: options.fileSource }),
    signal,
  })

  const election = electOwners({
    entries,
    enabledConcepts: resolver.anyEnabledConcepts,
    capabilities: new Set(options.engines.flatMap((engine) => engine.capabilities.provides)),
    languages: inventory.languages,
    // A registry entry can exist for an engine this run never instantiated — the shipped registry
    // deliberately carries one (see entries.test.ts) so a real overlap is provable in isolation.
    // Without this, arbitration would suppress that entry on every run and report a rule-overlap
    // diagnostic about a suppression that never happened, because no such engine ever competed.
    participatingEngines: new Set(options.engines.map((engine) => engine.id)),
    pinnedOwners: resolver.base.pinnedOwners,
  })

  // Hashes the full entries, not just their ids: normalization bakes `concepts`, `classify`,
  // `severityDefault` and `docsUrl` into every cached diagnostic, so an upgrade that changes any of
  // them without adding or removing a rule would otherwise serve stale attribution forever.
  const configHash = hashJson({ config: options.config, entries })
  const statIndex = await openStatIndex(cacheDir)
  const resultStore = openResultStore(cacheDir)
  const engineById = new Map(options.engines.map((engine) => [engine.id, engine]))
  const sources = new Map<string, string>()

  const readSource = async (file: string): Promise<string> => {
    const cached = sources.get(file)
    if (cached !== undefined) return cached
    const content = await readFile(join(options.rootDir, file), 'utf8')
    sources.set(file, content)
    return content
  }

  const collected: Diagnostic[] = []
  const engineFailures: Array<{ engine: string; message: string }> = []
  let filesFromCache = 0
  let enginesRun = 0

  for (const diagnostic of configDiagnostics({ resolver, election, configFile })) {
    collected.push(diagnostic)
    yield { type: 'diagnostic', diagnostic }
  }

  const plan = buildPlan({ engines: options.engines, inventory, election, resolver })
  // The plan already knows exactly which files each engine was assigned (buildPlan filters by the
  // engine's supported languages); the union of those assignments — not a second pass re-filtering
  // languages here — is the honest count of "files something actually looked at". A file with no
  // engine assignment (a `.json`, a `.md`, a lockfile — nothing in the registry claims those
  // languages) was never a caching candidate in the first place, which is the distinction `stats`
  // needs to stop reading a merely-uncovered file as a cache miss.
  const filesAnalysed = new Set(plan.flatMap((assignment) => assignment.files.map((file) => file.path))).size

  // Wrapped so a consumer that stops iterating early (breaking out of a `for await`) still
  // triggers this `finally` via the generator's implicit `return()` — otherwise every hash
  // `statIndex.hashOf` computed so far this run would be lost, not just deferred.
  try {
    for (const assignment of plan) {
      const engine = engineById.get(assignment.engineId)
      if (engine === undefined) continue

      try {
        const version = await engine.version()
        const handle = await engine.materializeConfig(assignment.selection, {
          rootDir: options.rootDir,
          tmpDir: join(options.rootDir, '.slop-gate', 'tmp'),
        })
        enginesRun += 1

        try {
          const pending: InventoryFile[] = []
          const keys = new Map<string, string>()
          const keyInputs = new Map<string, ResultKeyInput>()

          for (const file of assignment.files) {
            const components = {
              engineId: engine.id,
              engineVersion: version,
              engineRulesetHash: handle.rulesetHash,
              filePath: file.path,
              fileHash: await statIndex.hashOf(options.rootDir, file),
              configHash,
            }
            const key = deriveResultKey(components)
            keys.set(file.path, key)
            keyInputs.set(file.path, components)

            const hit = useCache ? await resultStore.get(key) : null
            if (hit === null) {
              pending.push(file)
              continue
            }
            filesFromCache += 1
            for (const diagnostic of hit) {
              if (!isVisible(diagnostic)) continue
              collected.push(diagnostic)
              yield { type: 'diagnostic', diagnostic }
            }
          }

          const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
          for (let index = 0; index < pending.length; index += batchSize) {
            const batch = pending.slice(index, index + batchSize)
            const raws: RawDiagnostic[] = []
            for await (const raw of engine.run(
              { files: batch },
              handle,
              { rootDir: options.rootDir, tmpDir: join(options.rootDir, '.slop-gate', 'tmp') },
              signal,
            )) {
              raws.push(raw)
            }

            const byFile = new Map<string, RawDiagnostic[]>(batch.map((file) => [file.path, []]))
            for (const raw of raws) byFile.get(raw.file)?.push(raw)

            for (const [path, fileRaws] of byFile) {
              // No shortcut for `fileRaws.length === 0` here (there used to be one, storing `[]`
              // straight into the cache without ever reading the file): a clean file — the engine
              // reports nothing for it — is exactly where a *stale* inline suppression comment
              // survives, code that used to need it long since fixed, comment never removed. That
              // is the modal case `config.unused-suppression` exists to catch, so this file's
              // source has to be read and scanned for directives regardless of whether it produced
              // any raw findings this run — `suppressionScanFiles` below is what makes
              // `normalizeDiagnostics` do that even with an empty `raws`.
              const source = await readSource(path)
              const normalized = normalizeDiagnostics({
                engine: engine.id,
                raws: fileRaws,
                entries,
                owners: election.owners,
                sourceOf: () => source,
                // Defaults to 'off', not undefined: `normalizeDiagnostics` treats an undefined
                // level as "use the rule's default severity", which is right for a rule that is
                // simply unconfigured. But a concept only ever reaches here because some layer
                // (base or an override) enabled it — `isOwned` already filtered out everything
                // else — so if *this file's* resolution has no opinion, the layer that enabled it
                // must be an override that doesn't match this file. Falling back to undefined
                // there would let an override scoped to one glob fire at default severity on every
                // other file the engine touches, which defeats the point of scoping it.
                levelOf: (concept) => resolver.forFile(path).rules.get(concept as never)?.level ?? 'off',
                suppressionScanFiles: [path],
              })

              // `normalized` — the *complete* per-file array, suppressed findings included — is what
              // gets cached: `config.unused-suppression` is computed once, right here, from
              // knowledge of every diagnostic this file produced, and a warm run must replay that
              // same array rather than silently losing it (see `NormalizeInput.suppressionScanFiles`
              // and this file's own module doc comment). Only `collected`/the stream below decide
              // what the user actually sees.
              if (useCache) await resultStore.set(keys.get(path)!, normalized, keyInputs.get(path)!)
              for (const diagnostic of normalized) {
                if (!isVisible(diagnostic)) continue
                collected.push(diagnostic)
                yield { type: 'diagnostic', diagnostic }
              }
            }
          }
        } finally {
          await handle.dispose()
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        engineFailures.push({ engine: assignment.engineId, message })
        yield { type: 'engine-failed', engine: assignment.engineId, message }
      }
    }
  } finally {
    await statIndex.persist()
  }

  collected.sort(
    // A `null` file (an orchestrator-level diagnostic with nothing to attribute) sorts before any
    // real path — `''` is less than every non-empty string — surfacing configuration-level notices
    // ahead of per-file findings rather than placing them arbitrarily among the files by chance.
    (a, b) =>
      compareStrings(a.file ?? '', b.file ?? '') ||
      a.range.start - b.range.start ||
      compareStrings(a.concept, b.concept),
  )

  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 }
  for (const diagnostic of collected) counts[diagnostic.severity] += 1

  yield {
    type: 'done',
    result: {
      diagnostics: collected,
      counts,
      engineFailures,
      stats: {
        filesScanned: inventory.files.length,
        filesAnalysed,
        filesFromCache,
        enginesRun,
        durationMs: Math.round(performance.now() - startedAt),
      },
      ruleset: {
        // `anyEnabledConcepts`, not `base`: a concept enabled only by an override is still checked
        // on the files it matches, so reporting the base count would undercount the run.
        enabledConcepts: resolver.anyEnabledConcepts.size,
        suppressed: election.suppressed.length,
        uncovered: election.uncovered,
        unknownKeys: resolver.base.unknownKeys,
      },
    },
  }
}

type ConfigDiagnosticInput = {
  resolver: ReturnType<typeof createRuleSetResolver>
  election: ReturnType<typeof electOwners>
  /** The repo-relative config file path, or `undefined` when none was found. */
  configFile: string | undefined
}

function configDiagnostics(input: ConfigDiagnosticInput): Diagnostic[] {
  const emit = (concept: string, message: string): Diagnostic | null => {
    const level = input.resolver.base.rules.get(concept as never)?.level
    if (level === undefined || level === 'off') return null
    return {
      concept,
      ruleId: `slop-gate/${concept}`,
      engine: 'slop-gate',
      severity: LEVEL_TO_SEVERITY[level],
      message,
      file: input.configFile ?? null,
      range: { start: 0, end: 0 },
      position: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
      docsUrl: `https://slop-gate.dev/concepts/${concept}`,
      fingerprint: hashJson({ concept, message }).slice(0, 32),
    }
  }

  const diagnostics: Diagnostic[] = []

  for (const key of input.resolver.base.unknownKeys) {
    const diagnostic = emit(
      'config.dead-override',
      `\`${key}\` does not name a known concept or a rule any engine provides.`,
    )
    if (diagnostic) diagnostics.push(diagnostic)
  }

  for (const record of input.election.suppressed) {
    const diagnostic = emit(
      'config.rule-overlap',
      `${ruleRefKey(record.winner)} and ${ruleRefKey(record.suppressed)} both detect ` +
        `\`${record.concept}\`; ${ruleRefKey(record.suppressed)} was suppressed (${record.reason}).`,
    )
    if (diagnostic) diagnostics.push(diagnostic)
  }

  return diagnostics
}
