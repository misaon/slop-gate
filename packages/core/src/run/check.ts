import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deriveProjectResultKey, deriveResultKey, hashJson, type ProjectResultKeyInput, type ResultKeyInput } from '../cache/keys.ts'
import { openProjectResultStore, openResultStore, type ProjectResultStore } from '../cache/result-store.ts'
import { openStatIndex, type StatIndex } from '../cache/stat-index.ts'
import type { RuleSetResolver } from '../config/resolve.ts'
import type { SlopGateConfig } from '../config/types.ts'
import type { Diagnostic, Severity } from '../diagnostics/types.ts'
import type { FileSource } from '../discovery/inventory.ts'
import type { InventoryFile } from '../discovery/types.ts'
import { LEVEL_TO_SEVERITY, normalizeDiagnostics } from '../engine/normalize.ts'
import type { Engine, EngineConfigHandle, RawDiagnostic, RunContext } from '../engine/types.ts'
import { engineAdjustmentsFor } from '../frameworks/adjustments.ts'
import { compareStrings } from '../ordering.ts'
import { buildPlan, type EngineAssignment } from '../planner/plan.ts'
import type { ElectionResult } from '../registry/elect.ts'
import { ruleRefKey, type RuleEntry } from '../registry/types.ts'
import { resolveRun } from './resolve-run.ts'

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
  const cacheDir = options.cacheDir ?? join(options.rootDir, '.slop-gate', 'cache')
  const useCache = options.useCache ?? true
  // Deliberately not defaulted to a literal filename: when no config file was found, `configFile`
  // stays `undefined` all the way through to `configDiagnostics`, which attributes those
  // diagnostics to `file: null` rather than a path the user does not have on disk.
  const configFile = options.configFile

  // Config resolution, rule-registry arbitration and discovery (spec §4.1 stages 1-3) — no engine
  // invoked yet. Shared verbatim with `sgate rules`'s governance commands via `resolveRun`; see
  // that module's own doc comment for why this is the extraction boundary rather than the full
  // prepare/plan/schedule split M2 needs.
  const { resolver, election, inventory, entries, frameworks } = await resolveRun({
    rootDir: options.rootDir,
    config: options.config,
    ...(configFile === undefined ? {} : { configFile }),
    engines: options.engines,
    ...(options.entries === undefined ? {} : { entries: options.entries }),
    ...(options.fileSource === undefined ? {} : { fileSource: options.fileSource }),
    signal,
  })

  // Hashes the full entries, not just their ids: normalization bakes `concepts`, `classify`,
  // `severityDefault` and `docsUrl` into every cached diagnostic, so an upgrade that changes any of
  // them without adding or removing a rule would otherwise serve stale attribution forever.
  //
  // `frameworks` is in here for the same class of reason, and it is load-bearing rather than tidy
  // (spec §23.4): adding `@nestjs/core` to a `package.json` changes the effective ruleset without
  // changing any file oxlint was assigned, so without it a warm run keeps serving diagnostics from a
  // ruleset that no longer applies. Same silent-stale-warm-run shape as the stat index trusting
  // `(size, mtimeMs)`, one layer up. `frameworks.applied` alone would do, but the whole detection is
  // hashed so a profile moving between applied and inapplicable also invalidates.
  const configHash = hashJson({ config: options.config, entries, frameworks })
  const statIndex = await openStatIndex(cacheDir)
  const resultStore = openResultStore(cacheDir)
  // Project-granularity engines (spec §8.1: `tsc`, `knip`) cache one whole-program result per
  // engine against an aggregate input hash, never per file — a different shape from `resultStore`
  // above, not a special case of it. See `runProjectAssignment` below.
  const projectResultStore = openProjectResultStore(cacheDir)
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

  // `config.unused-suppression` and `config.suppression-missing-reason` are synthesised inside
  // `normalizeDiagnostics`, which runs once per **(engine, file)** — so a file assigned to two
  // file-granularity engines produces each of them twice. That was unreachable while oxlint was the
  // only one (`tsc` and knip are project-granularity); adding ast-grep made it real and doubled both
  // counts on this repository, 41 -> 55 and 4 -> 8, before this collapse existed.
  //
  // Keyed on the directive's own identity — concept, file, byte range and message — rather than on
  // `fingerprint`, which looks like the obvious choice and is the wrong one. A fingerprint folds in
  // an `occurrenceIndex` counted within a single `normalizeDiagnostics` call (spec 10.1), and the
  // two engines no longer judge the same *subset* of a file's directives (see `judgedBy` there), so
  // the same directive can be occurrence 3 for one engine and occurrence 1 for the other. The
  // message is part of the key because it names the directive's targets, which is what keeps two
  // different directives written on one line — a real shape in this repository's own test fixtures
  // — from collapsing into each other.
  //
  // Restricted to the orchestrator's own diagnostics because only those can be produced twice:
  // arbitration already guarantees one owning engine per concept for everything else.
  const seenSynthetic = new Set<string>()
  const isDuplicateSynthetic = (diagnostic: Diagnostic): boolean => {
    if (diagnostic.engine !== 'slop-gate') return false
    const key = [diagnostic.concept, diagnostic.file, diagnostic.range.start, diagnostic.range.end, diagnostic.message].join('\0')
    if (seenSynthetic.has(key)) return true
    seenSynthetic.add(key)
    return false
  }

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
        // One context per assignment, reused for `materializeConfig` and every `run` below: the
        // framework adjustments are narrowed to this engine, so building it twice would mean
        // narrowing twice and risking the two disagreeing.
        const runContext: RunContext = {
          rootDir: options.rootDir,
          tmpDir: join(options.rootDir, '.slop-gate', 'tmp'),
          adjustments: engineAdjustmentsFor(engine.id, frameworks),
        }
        const handle = await engine.materializeConfig(assignment.selection, runContext)
        enginesRun += 1

        // The one branch project-granularity forces (see `runProjectAssignment`'s own doc comment
        // below for why the rest of this loop is untouched): a project engine has no per-file cache
        // entries and must see every assigned file in one `run()` call, never chunked into
        // `batchSize` pages — chunking would ask `tsc` about a subset of a program, which spec §8.1
        // is explicit produces wrong answers, not just slower ones. Its own `try`/`finally` (matching
        // the file-granularity one just below) so a thrown `EngineError` still disposes the handle
        // before propagating to the `catch` below that turns it into an `engine-failed` event.
        if (engine.capabilities.granularity === 'project') {
          try {
            const projectStats = { cacheHit: false }
            for await (const diagnostic of runProjectAssignment(
              engine,
              assignment,
              handle,
              version,
              {
                rootDir: options.rootDir,
                runContext,
                useCache,
                configHash,
                entries,
                election,
                resolver,
                statIndex,
                projectResultStore,
                readSource,
                signal,
              },
              projectStats,
            )) {
              if (!isVisible(diagnostic) || isDuplicateSynthetic(diagnostic)) continue
              collected.push(diagnostic)
              yield { type: 'diagnostic', diagnostic }
            }
            // All-or-nothing, matching the cache entry itself: either every assigned file was
            // covered by one aggregate hit, or none were (a miss re-checks the whole program, not a
            // subset of it).
            if (projectStats.cacheHit) filesFromCache += assignment.files.length
          } finally {
            await handle.dispose()
          }
          continue
        }

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
              if (!isVisible(diagnostic) || isDuplicateSynthetic(diagnostic)) continue
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
              runContext,
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
                if (!isVisible(diagnostic) || isDuplicateSynthetic(diagnostic)) continue
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

type ProjectAssignmentContext = {
  rootDir: string
  runContext: RunContext
  useCache: boolean
  configHash: string
  entries: readonly RuleEntry[]
  election: ElectionResult
  resolver: RuleSetResolver
  statIndex: StatIndex
  projectResultStore: ProjectResultStore
  readSource: (file: string) => Promise<string>
  signal: AbortSignal
}

/**
 * Runs one `'project'`-granularity assignment (spec §8.1: `tsc`, `knip` today) — the counterpart to
 * the per-file `pending`/batch loop in `streamCheck` above, which stays exactly as it was for `'file'`
 * engines. A project engine type-checks (or otherwise whole-program-analyses) a *program*, not a list
 * of files, so asking it about a subset gives wrong answers, not just faster ones (§8.1) — everything
 * here follows from that one constraint:
 *
 * - **One cache entry, not one per file.** `deriveProjectResultKey` folds every assigned file's own
 *   content hash into a single aggregate hash; a hit or miss is all-or-nothing for the whole
 *   assignment, mirrored by `ProjectResultStore`'s own `results/project/<engineId>/<hash>.json`
 *   layout (spec §9) rather than `ResultStore`'s per-file sharded one.
 * - **One `run()` call, not a batch loop.** `assignment.files` still matters — it is what the
 *   aggregate hash is built from, and it is what gets scanned for stale inline suppressions below —
 *   but it is never chunked or turned into explicit CLI file arguments the way the file-granularity
 *   loop does: a project engine decides its own file set from its own project configuration (a
 *   tsconfig's `include`/`files`), which is why `Engine.run`'s `batch` parameter is close to
 *   vestigial for a project engine (see `@misaon/slop-gate-engine-tsc`'s own `run()` for the concrete
 *   case: it ignores `batch.files` entirely and passes no file arguments to `tsc -p` at all).
 * - **Every assigned file still gets scanned for suppressions**, matching the file-granularity loop's
 *   own "no `fileRaws.length === 0` shortcut" rule (see that loop's comment): a stale
 *   `sgate-disable-next-line` on a file the engine now reports nothing for is exactly the case
 *   `config.unused-suppression` exists to catch, project engines included.
 * - **A raw diagnostic for a file outside `assignment.files` is kept, not dropped** — e.g. a project
 *   engine reporting against its own config file (`tsconfig.json` itself, for a malformed-option
 *   diagnostic) or a file the tsconfig's `include` matches that slop-gate's own inventory does not.
 *   Second-guessing the engine's own program scope by discarding those would be exactly the silent
 *   wrongness spec §18/§22 warns against; grouping by whatever `raw.file` the engine actually reports
 *   costs nothing extra here since there is already no fixed per-file batch to reconcile against.
 *
 * `stats` is a small out-parameter (mutated, not returned) rather than a second return channel,
 * matching how the rest of `streamCheck` already tracks `filesFromCache`/`enginesRun` as plain outer
 * variables — an async generator's own return value is awkward to read from a `for await` consumer,
 * and a project assignment has exactly one hit/miss decision to report, not per-diagnostic ones.
 *
 * @yields Every diagnostic for this assignment — a cache hit's full stored array, or a cache miss's
 * freshly normalized one — for the caller to filter by `isVisible` and collect/stream itself.
 */
async function* runProjectAssignment(
  engine: Engine,
  assignment: EngineAssignment,
  handle: EngineConfigHandle,
  version: string,
  ctx: ProjectAssignmentContext,
  stats: { cacheHit: boolean },
): AsyncGenerator<Diagnostic> {
  const files = await Promise.all(
    assignment.files.map(async (file) => ({ path: file.path, hash: await ctx.statIndex.hashOf(ctx.rootDir, file) })),
  )
  const components: ProjectResultKeyInput = {
    engineId: engine.id,
    engineVersion: version,
    engineRulesetHash: handle.rulesetHash,
    configHash: ctx.configHash,
    files,
  }
  const key = deriveProjectResultKey(components)

  const cached = ctx.useCache ? await ctx.projectResultStore.get(engine.id, key) : null
  if (cached !== null) {
    stats.cacheHit = true
    yield* cached
    return
  }
  stats.cacheHit = false

  const raws: RawDiagnostic[] = []
  for await (const raw of engine.run(
    { files: assignment.files },
    handle,
    ctx.runContext,
    ctx.signal,
  )) {
    raws.push(raw)
  }

  // Pre-seeded with every assigned file (so a clean one is still scanned for suppressions), then
  // widened to any other file the engine actually reported against — see the module doc comment.
  const byFile = new Map<string, RawDiagnostic[]>(assignment.files.map((file) => [file.path, []]))
  for (const raw of raws) {
    const existing = byFile.get(raw.file)
    if (existing) existing.push(raw)
    else byFile.set(raw.file, [raw])
  }

  const normalized: Diagnostic[] = []
  for (const [path, fileRaws] of byFile) {
    const source = await ctx.readSource(path)
    normalized.push(
      ...normalizeDiagnostics({
        engine: engine.id,
        raws: fileRaws,
        entries: ctx.entries,
        owners: ctx.election.owners,
        sourceOf: () => source,
        levelOf: (concept) => ctx.resolver.forFile(path).rules.get(concept as never)?.level ?? 'off',
        suppressionScanFiles: [path],
      }),
    )
  }

  if (ctx.useCache) await ctx.projectResultStore.set(engine.id, key, normalized, components)
  yield* normalized
}

type ConfigDiagnosticInput = {
  resolver: RuleSetResolver
  election: ElectionResult
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
