import { readFile, rmdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { createBaselineMatcher, type BaselineMatcher } from '../baseline/apply.ts'
import { baselinePathFor, readBaseline } from '../baseline/file.ts'
import type { BaselineSummary } from '../baseline/types.ts'
import { deriveProjectResultKey, deriveResultKey, hashJson, type ProjectResultKeyInput, type ResultKeyInput } from '../cache/keys.ts'
import { openProjectResultStore, openResultStore, type ProjectResultStore } from '../cache/result-store.ts'
import { openStatIndex, type StatIndex } from '../cache/stat-index.ts'
import { openToolVersionCache } from '../cache/tool-versions.ts'
import { mapWithLimit, PROBE_CONCURRENCY } from '../concurrency.ts'
import type { RuleSetResolver } from '../config/resolve.ts'
import type { GeneratedPolicy, SlopGateConfig } from '../config/types.ts'
import type { Diagnostic, Severity } from '../diagnostics/types.ts'
import type { FixTier } from '../fix/types.ts'
import type { FileSource } from '../discovery/inventory.ts'
import type { InventoryFile } from '../discovery/types.ts'
import { LEVEL_TO_SEVERITY, normalizeDiagnostics } from '../engine/normalize.ts'
import type { Engine, EngineConfigHandle, RawDiagnostic, RunContext } from '../engine/types.ts'
import { engineAdjustmentsFor } from '../frameworks/adjustments.ts'
import { compareStrings } from '../ordering.ts'
import { buildPlan, type EngineAssignment } from '../planner/plan.ts'
import type { ElectionResult } from '../registry/elect.ts'
import { ruleRefKey, type EngineId, type RuleEntry } from '../registry/types.ts'
import { resolveRun, type UnavailableEngine } from './resolve-run.ts'
import { buildTimingReport, createTiming, NO_TIMING, type Timing, type TimingReport } from './timing.ts'

export type CheckOptions = {
  rootDir: string
  config: SlopGateConfig
  configFile?: string
  engines: readonly Engine[]
  entries?: readonly RuleEntry[]
  fileSource?: FileSource
  cacheDir?: string
  useCache?: boolean
  /**
   * Reads `.slop-gate/baseline.json` and withholds the findings it accepts (spec §12.2). Defaults to
   * true, so a repository that has committed a baseline gets it without every caller remembering —
   * `sgate baseline create|update` is the one caller that turns it off, because it has to see the run
   * the baseline is derived from.
   */
  useBaseline?: boolean
  /** Absolute path to the baseline, for a caller that keeps it somewhere else. */
  baselineFile?: string
  batchSize?: number
  /**
   * The run's source text, shared with the caller, so a second engine over the same file reads it free.
   *
   * In/out rather than a field on `CheckResult` because `pretty` draws its code frames from the event
   * stream as diagnostics arrive, long before there is a result to read a map off. Without it the CLI
   * hands the reporters a second unmemoised read and `pretty` re-reads a file once per code frame. A
   * caller that also writes it (the CLI does: a cache hit means core never read the file) keeps this the
   * single copy of the run's source text.
   */
  sources?: Map<string, string>
  /**
   * A `performance.now()` reading for when the run began, reported back as `stats.durationMs`.
   *
   * `0` means "from process start" and is what a one-shot process should pass, since node boot, the
   * module graph and config loading all happened before this call. Defaults to the top of `streamCheck`,
   * which is right for a long-lived host, where `performance.now()` measures server uptime instead.
   */
  startedAt?: number
  /**
   * Collects the `--timing` breakdown onto `CheckResult.timings` (spec §12.4). Off by default, and off
   * means one indirect call through `NO_TIMING` per span — see `./timing.ts` for what that costs.
   *
   * Nothing here prints: what happens to the report is the reporter's decision.
   */
  timing?: boolean
  /**
   * Asks every engine for fix data (spec §11 step 1), capped at this tier. Absent on a plain
   * `sgate check`, which is what keeps an adapter that has to *derive* fixes by re-running itself
   * (see `@misaon/slop-gate-engine-oxlint`) from doing that work on the common path.
   */
  fixTier?: FixTier
  signal?: AbortSignal
}

/** One engine's share of the cache, reported alongside the strict per-file aggregate it can contradict. */
export type EngineCacheStats = {
  engine: EngineId
  /** Files this engine's assignments claimed. Its own denominator, never `filesAnalysed`. */
  filesAssigned: number
  /** How many of them it did not have to examine. */
  filesFromCache: number
}

export type CheckResult = {
  diagnostics: Diagnostic[]
  counts: Record<Severity, number>
  engineFailures: Array<{ engine: string; message: string }>
  /**
   * Registered engines whose tooling is absent (`Engine.availability`) — a coverage gap, not a
   * failure: nothing crashed, and the run is exit 0 by default.
   *
   * Required rather than optional, because a run that silently skipped an engine is otherwise
   * indistinguishable from a clean one, and the mistake this prevents is a reporter forgetting to look.
   */
  unavailableEngines: readonly UnavailableEngine[]
  /**
   * The baseline that was in force, or `null` when there was no baseline file to read.
   *
   * Required for the reason `unavailableEngines` is. Accepted findings are absent from `diagnostics` and
   * from `counts` — so they cannot fail a build — which is why the count of them has to travel with the
   * result.
   */
  baseline: BaselineSummary | null
  stats: {
    filesScanned: number
    /** Files assigned to at least one engine by the plan — the denominator `filesFromCache` is a count of. */
    filesAnalysed: number
    /**
     * How many of `filesAnalysed` no engine had to examine this run. **Files, not cache entries**: the
     * result cache is keyed per (engine, file), so a file five engines claim has five entries, and a
     * file counts here only when every assignment that claimed it was a hit. Bounded above by
     * `filesAnalysed` by construction, which is what a reporter printing "N analysed, M cached" needs.
     */
    filesFromCache: number
    /**
     * The same question asked per engine, because a project-granularity engine (spec §8.1: `tsc`, `knip`)
     * has one cache entry keyed on every input file's hash, so any edit anywhere misses it for the whole
     * repository — and since `filesFromCache` requires *every* assignment for a file to hit, one such
     * miss drags the aggregate to near zero while the per-file engines were served almost everything.
     *
     * Deliberately *additional* rather than a replacement: `filesFromCache` keeps its strict
     * all-or-nothing meaning, which is the only one comparable against `filesAnalysed`.
     *
     * One record per engine the plan gave work to, in `compareStrings` order so two runs over the same
     * repository produce the same document. An engine that failed reports `filesFromCache: 0`.
     */
    cacheByEngine: readonly EngineCacheStats[]
    enginesRun: number
    /**
     * Wall-clock milliseconds from `CheckOptions.startedAt` to the `done` event.
     *
     * **What it covers is the caller's choice, and getting it wrong is silent.** Left to its default it
     * spans this function only, which under-reports a one-shot CLI run by about 46% — node boot, the
     * module graph and `loadCliConfig` all precede it. A caller that owns its process passes
     * `startedAt: 0`; a long-lived host must not, since `performance.now()` there measures server uptime.
     */
    durationMs: number
  }
  /**
   * Where `stats.durationMs` went, present only when `CheckOptions.timing` asked for it (`--timing`).
   *
   * Optional rather than required-and-nullable — the opposite of the choice `baseline` and
   * `unavailableEngines` above make, for the opposite reason: those exist so a reporter cannot *forget*
   * something that changes what a clean run means. This changes nothing about the verdict, so absent
   * means only "nobody asked".
   */
  timings?: TimingReport
  ruleset: {
    enabledConcepts: number
    overlaps: number
    uncovered: readonly string[]
    unknownKeys: readonly string[]
  }
}

export type CheckEvent =
  | { type: 'diagnostic'; diagnostic: Diagnostic }
  | { type: 'engine-failed'; engine: string; message: string }
  | { type: 'done'; result: CheckResult }

const DEFAULT_BATCH_SIZE = 500

// A suppressed diagnostic (`Diagnostic.suppressed`; see `suppressions/apply.ts`) is still a real object
// in the per-file cache entry `normalizeDiagnostics` returns, which is what lets it survive a warm cache
// hit. This is the one seam deciding whether the *default* result and severity counts see it, and it is
// applied identically to a fresh normalize and to a cache hit below, so which path served a file never
// changes what the user sees.
const isVisible = (diagnostic: Diagnostic): boolean => diagnostic.suppressed === undefined

/**
 * Removes each directory in order, only while it is empty.
 *
 * `rmdir` and not `rm -r`: it fails on a non-empty directory, which is exactly the guarantee wanted here.
 * A repository that already holds a real `.slop-gate/cache` from an ordinary run keeps it, with no
 * bookkeeping about which run created what — the filesystem answers that question correctly by refusing.
 */
async function removeIfEmpty(...dirs: readonly string[]): Promise<void> {
  for (const dir of dirs) await rmdir(dir).catch(() => undefined)
}

export async function runCheck(options: CheckOptions): Promise<CheckResult> {
  for await (const event of streamCheck(options)) {
    if (event.type === 'done') return event.result
  }
  throw new Error('streamCheck completed without a done event')
}

export async function* streamCheck(options: CheckOptions): AsyncIterable<CheckEvent> {
  // Two clocks, because they answer different questions and conflating them is what made `durationMs`
  // wrong. `enteredAt` is this function's own span, which is all the measured phases can legitimately be
  // a percentage of; `startedAt` is what the *caller* considers the run's start, and is what the user is
  // told (see `CheckOptions.startedAt`). The gap between them is the `startup` row of the `--timing`
  // breakdown — the one part of the run core can price but not itemise.
  const enteredAt = performance.now()
  const startedAt = options.startedAt ?? enteredAt
  const timing = options.timing === true ? createTiming() : NO_TIMING
  const signal = options.signal ?? new AbortController().signal
  const cacheDir = options.cacheDir ?? join(options.rootDir, '.slop-gate', 'cache')
  const useCache = options.useCache ?? true
  // Read here rather than folded into `configHash`, and applied after the cache rather than inside
  // `normalizeDiagnostics`: baseline acceptance must not be baked into a per-file cache entry, or
  // editing the baseline would leave a warm run serving the acceptance decisions of the old one. The
  // consequence is that the cache never has to be invalidated when a baseline changes.
  const baseline = (options.useBaseline ?? true) ? await openBaseline(options) : null
  // Deliberately not defaulted to a literal filename: when no config file was found, `configFile`
  // stays `undefined` all the way through to `configDiagnostics`, which attributes those
  // diagnostics to `file: null` rather than a path the user does not have on disk.
  const configFile = options.configFile

  // Config resolution, rule-registry arbitration and discovery (spec §4.1 stages 1-3) — no engine
  // invoked yet. Shared verbatim with `sgate rules`'s governance commands via `resolveRun`; see
  // that module's own doc comment for why this is the extraction boundary rather than the full
  // prepare/plan/schedule split M2 needs.
  const { resolver, election, inventory, entries, frameworks, unavailableEngines } = await resolveRun({
    rootDir: options.rootDir,
    config: options.config,
    ...(configFile === undefined ? {} : { configFile }),
    engines: options.engines,
    ...(options.entries === undefined ? {} : { entries: options.entries }),
    ...(options.fileSource === undefined ? {} : { fileSource: options.fileSource }),
    timing,
    signal,
  })

  // Hashes the full entries, not just their ids: normalization bakes `concepts`, `classify`,
  // `severityDefault` and `docsUrl` into every cached diagnostic, so an upgrade that changes any of
  // them without adding or removing a rule would otherwise serve stale attribution forever.
  //
  // `frameworks` is load-bearing rather than tidy (spec §23.4): adding `@nestjs/core` to a
  // `package.json` changes the effective ruleset without changing any file oxlint was assigned, so
  // without it a warm run keeps serving diagnostics from a ruleset that no longer applies. The whole
  // detection is hashed, not just `frameworks.applied`, so a profile moving between applied and
  // inapplicable also invalidates. `fixTier` likewise: absent from the key, a `sgate check` populates the
  // cache with fix-free diagnostics and the `sgate fix` that follows is served them — a fix pipeline
  // finding nothing to do on a repository full of fixable findings. `runFix` also disables the cache, so
  // that one is guarded twice.
  //
  // `unavailableEngines` is folded in **defensively and is not currently load-bearing** — stated plainly
  // because the obvious assumption is the opposite. Availability changes ownership, which already changes
  // each affected engine's `handle.rulesetHash` and, where an engine loses every concept, removes its
  // assignment entirely; both are already in the per-file cache key. The availability test in
  // `check.test.ts` passes with this term removed.
  const configHash = hashJson({
    config: options.config,
    entries,
    frameworks,
    fixTier: options.fixTier,
    unavailableEngines,
  })
  const generatedPolicy = options.config.generated ?? 'skip'
  const statIndex = await openStatIndex(cacheDir)
  // Bypassed entirely when `useCache` is false, by handing the engines no cache below: `--no-cache`
  // means "believe nothing on disk", and a version served from disk is still a version served from
  // disk even though nothing else this run will use it for.
  const toolVersionCache = useCache ? await openToolVersionCache(cacheDir) : undefined
  const resultStore = openResultStore(cacheDir)
  // Project-granularity engines (spec §8.1: `tsc`, `knip`) cache one whole-program result per
  // engine against an aggregate input hash, never per file — a different shape from `resultStore`
  // above, not a special case of it. See `runProjectAssignment` below.
  const projectResultStore = openProjectResultStore(cacheDir)
  const engineById = new Map(options.engines.map((engine) => [engine.id, engine]))
  const sources = options.sources ?? new Map<string, string>()

  const readSource = async (file: string): Promise<string> => {
    const cached = sources.get(file)
    if (cached !== undefined) return cached
    const content = await readFile(join(options.rootDir, file), 'utf8')
    sources.set(file, content)
    return content
  }

  const collected: Diagnostic[] = []
  const engineFailures: Array<{ engine: string; message: string }> = []
  let enginesRun = 0

  // `config.unused-suppression` and `config.suppression-missing-reason` are synthesised inside
  // `normalizeDiagnostics`, which runs once per **(engine, file)** — so a file assigned to two
  // file-granularity engines produces each of them twice. Unreachable while oxlint was the only one
  // (`tsc` and knip are project-granularity); adding ast-grep made it real and doubled both counts on
  // this repository, 41 -> 55 and 4 -> 8.
  //
  // Keyed on the directive's own identity — concept, file, byte range and message — rather than on
  // `fingerprint`, which looks like the obvious choice and is the wrong one: a fingerprint folds in an
  // `occurrenceIndex` counted within a single `normalizeDiagnostics` call (spec §10.1), and the two
  // engines no longer judge the same *subset* of a file's directives (see `judgedBy` there), so one
  // directive can be occurrence 3 for one engine and occurrence 1 for the other. The message is in the
  // key because it names the directive's targets, which keeps two different directives written on one
  // line — a real shape in this repository's own fixtures — from collapsing into each other.
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
    if (baseline?.accepts(diagnostic) === true) continue
    collected.push(diagnostic)
    yield { type: 'diagnostic', diagnostic }
  }

  const plan = buildPlan({ engines: options.engines, inventory, election, resolver })
  // The plan already knows which files each engine was assigned (`buildPlan` filters by supported
  // languages); the union of those assignments is the honest count of "files something actually looked
  // at". A file no engine claims (a `.json`, a `.md`, a lockfile) was never a caching candidate, which is
  // the distinction `stats` needs to stop reading a merely-uncovered file as a cache miss.
  //
  // Counted per file with its assignment *count*, because the cache underneath is keyed per
  // **(engine, file)**: counting entries instead let `filesFromCache` exceed `filesAnalysed` outright — a
  // warm run here printed `337 analysed · 1246 cached` — and left `pretty.ts`'s "(all cached)" branch
  // unreachable on any repository where one file reaches two engines.
  const assignmentsByFile = new Map<string, number>()
  const assignedByEngine = new Map<EngineId, number>()
  for (const assignment of plan) {
    assignedByEngine.set(assignment.engineId, (assignedByEngine.get(assignment.engineId) ?? 0) + assignment.files.length)
    for (const file of assignment.files) assignmentsByFile.set(file.path, (assignmentsByFile.get(file.path) ?? 0) + 1)
  }
  const filesAnalysed = assignmentsByFile.size

  // A file counts as served from cache only when **every** assignment that claimed it was a hit. Any
  // engine that still had to examine it means something looked at the file this run, and an engine that
  // *failed* records no hit at all — so a run that fell over cannot report its files as cached, which
  // counting misses instead of hits would have allowed.
  //
  // Tallied per engine at the same time, from the same call, so the two counts cannot disagree about
  // what a hit was — see `stats.cacheByEngine` for why the per-engine view has to exist at all.
  const cacheHitsByFile = new Map<string, number>()
  const cacheHitsByEngine = new Map<EngineId, number>()
  const recordCacheHit = (engineId: EngineId, path: string): void => {
    cacheHitsByFile.set(path, (cacheHitsByFile.get(path) ?? 0) + 1)
    cacheHitsByEngine.set(engineId, (cacheHitsByEngine.get(engineId) ?? 0) + 1)
  }

  // `version()` is a cache-key component and nothing else, so nothing in the run depends on when it
  // resolves — yet four of the engines implement it as a `<tool> --version` subprocess spawn, and
  // resolving one per assignment at the top of the loop below put all six *sequentially* in front of the
  // first cache lookup. Hoisted here and resolved concurrently instead, once per distinct engine. The
  // serial sum is 65.0 ms and concurrency removes only the serialisation, so the saving is 32.2 ms of a
  // 227.9 ms warm run; `toolVersionCache` removes the rest by not spawning a probe at all.
  //
  // **Settled here, thrown in the loop.** An engine that cannot report its own version is that engine's
  // failure and has to stay one — the `catch` below turns it into an `engine-failed` event and the rest of
  // the plan still runs. A bare `Promise.all` would fail the whole run on the first rejection *and* leave
  // the other rejections unattached, which under Node's default `--unhandled-rejections=throw` is a
  // crashed process rather than a warning.
  //
  // One `versions` phase around the whole fan-out rather than one per engine: these are the only
  // concurrent spans in the run, and six overlapping 30 ms probes summed to 180 ms of a 155 ms run would
  // make every other row's share of the wall clock wrong.
  const planned = new Map<string, { engine: Engine; version: string } | { engine: Engine; error: unknown }>()
  await timing.phase('versions', () => Promise.all(
    [...new Set(plan.map((assignment) => assignment.engineId))].map(async (engineId) => {
      const engine = engineById.get(engineId)
      if (engine === undefined) return
      try {
        planned.set(engineId, { engine, version: await engine.version(toolVersionCache) })
      } catch (error) {
        planned.set(engineId, { engine, error })
      }
    }),
  ))

  // Wrapped so a consumer that stops iterating early (breaking out of a `for await`) still
  // triggers this `finally` via the generator's implicit `return()` — otherwise every hash
  // `statIndex.hashOf` computed so far this run would be lost, not just deferred.
  try {
    for (const assignment of plan) {
      const resolved = planned.get(assignment.engineId)
      if (resolved === undefined) continue
      const engine = resolved.engine

      try {
        if ('error' in resolved) throw resolved.error
        const version = resolved.version
        // One context per assignment, reused for `materializeConfig` and every `run` below: the
        // framework adjustments are narrowed to this engine, so building it twice would mean
        // narrowing twice and risking the two disagreeing.
        const runContext: RunContext = {
          rootDir: options.rootDir,
          tmpDir: join(options.rootDir, '.slop-gate', 'tmp'),
          adjustments: engineAdjustmentsFor(engine.id, frameworks),
          ...(options.fixTier === undefined ? {} : { fixTier: options.fixTier }),
        }
        const handle = await timing.phase(`materialize:${engine.id}`, () => engine.materializeConfig(assignment.selection, runContext))
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
                generated: generatedPolicy,
                signal,
              },
              projectStats,
              timing,
            )) {
              if (!isVisible(diagnostic) || isDuplicateSynthetic(diagnostic) || baseline?.accepts(diagnostic) === true) continue
              collected.push(diagnostic)
              yield { type: 'diagnostic', diagnostic }
            }
            // All-or-nothing, matching the cache entry itself: either every assigned file was
            // covered by one aggregate hit, or none were (a miss re-checks the whole program, not a
            // subset of it).
            if (projectStats.cacheHit) for (const file of assignment.files) recordCacheHit(engine.id, file.path)
          } finally {
            await handle.dispose()
          }
          continue
        }

        try {
          // Hashing a file and reading its cache entry are both I/O, one of each per assigned file — 307
          // for oxlint here and 307 again for ast-grep — and awaiting them a file at a time made the whole
          // cache lookup serial for no reason: no probe depends on any other.
          //
          // **Bounded, not a bare `Promise.all` over `assignment.files`.** That fans out over every
          // assigned file at once: on the 2,003-file corpus, 2,003 half-finished probes holding 2,003
          // parsed diagnostics arrays live at one instant — peak RSS scaling with the repository, for
          // throughput the fan-out cannot deliver, since `readFile` runs on libuv's four-wide threadpool
          // and the extra requests only queue. Capping at `PROBE_CONCURRENCY` keeps the whole win (195 ms
          // on that corpus) and takes peak RSS from 208.3 MB to 158.9 MB. The sweep is on
          // `PROBE_CONCURRENCY` itself.
          const probes = await timing.phase(`probe:${engine.id}`, () => mapWithLimit(
            assignment.files,
            PROBE_CONCURRENCY,
            async (file) => {
              const components = {
                engineId: engine.id,
                engineVersion: version,
                engineRulesetHash: handle.rulesetHash,
                filePath: file.path,
                fileHash: await statIndex.hashOf(options.rootDir, file),
                configHash,
              }
              const key = deriveResultKey(components)
              return { file, components, key, hit: useCache ? await resultStore.get(engine.id, key) : null }
            },
          ))

          const pending: InventoryFile[] = []
          const keys = new Map<string, string>()
          const keyInputs = new Map<string, ResultKeyInput>()

          // **Consumed in assignment order, not completion order.** Two things read from this loop and
          // both make the order observable: the event stream, which is the user's output and is what
          // `pretty` prints as it arrives, and `isDuplicateSynthetic`, which keeps the *first*
          // occurrence of an orchestrator-synthesised diagnostic and would otherwise keep whichever
          // file's probe happened to settle first.
          for (const { file, components, key, hit } of probes) {
            keys.set(file.path, key)
            keyInputs.set(file.path, components)

            if (hit === null) {
              pending.push(file)
              continue
            }
            recordCacheHit(engine.id, file.path)
            for (const diagnostic of hit) {
              if (!isVisible(diagnostic) || isDuplicateSynthetic(diagnostic) || baseline?.accepts(diagnostic) === true) continue
              collected.push(diagnostic)
              yield { type: 'diagnostic', diagnostic }
            }
          }

          const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
          for (let index = 0; index < pending.length; index += batchSize) {
            const batch = pending.slice(index, index + batchSize)
            const raws: RawDiagnostic[] = []
            await timing.phase(`run:${engine.id}`, async () => {
              for await (const raw of engine.run({ files: batch }, handle, runContext, signal)) {
                raws.push(raw)
              }
            })

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
              const source = await timing.phase(`read-source:${engine.id}`, () => readSource(path))
              const normalized = timing.wrap(`normalize:${engine.id}`, () => normalizeDiagnostics({
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
                generated: generatedPolicy,
              }))

              // `normalized` — the *complete* per-file array, suppressed findings included — is what
              // gets cached: `config.unused-suppression` is computed once, right here, from
              // knowledge of every diagnostic this file produced, and a warm run must replay that
              // same array rather than silently losing it (see `NormalizeInput.suppressionScanFiles`
              // and this file's own module doc comment). Only `collected`/the stream below decide
              // what the user actually sees.
              if (useCache) await timing.phase(`cache-write:${engine.id}`, () => resultStore.set(engine.id, keys.get(path)!, normalized, keyInputs.get(path)!))
              for (const diagnostic of normalized) {
                if (!isVisible(diagnostic) || isDuplicateSynthetic(diagnostic) || baseline?.accepts(diagnostic) === true) continue
                collected.push(diagnostic)
                yield { type: 'diagnostic', diagnostic }
              }
            }
          }
        } finally {
          await timing.phase(`dispose:${engine.id}`, () => handle.dispose())
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        engineFailures.push({ engine: assignment.engineId, message })
        yield { type: 'engine-failed', engine: assignment.engineId, message }
      }
    }
  } finally {
    // `--no-cache` means write nothing either, not just read nothing. Without this the stat index was the
    // one thing a `--no-cache` run still created inside the analysed repository — a `.slop-gate/` directory
    // appearing in someone's `git status` from a command they asked to be cacheless, and the only reason
    // the tool could not be pointed at a read-only checkout at all.
    if (useCache) {
      await timing.phase('stat-index-persist', () => statIndex.persist())
      // Deferred to here, not written through on each entry: see `openResultStore` for the 8x disk cost
      // the per-entry layout carried, and why one file per engine makes the concurrent-write race
      // inexpressible rather than coordinated.
      await timing.phase('results-persist', () => resultStore.persist())
      await timing.phase('project-results-persist', () => projectResultStore.persist())
    }
    else await removeIfEmpty(join(options.rootDir, '.slop-gate', 'tmp'), join(options.rootDir, '.slop-gate'))
    // Deferred to one write rather than written through on each miss: a cold run misses on every
    // engine at once, and six concurrent atomic writes to one file would leave whichever landed last,
    // silently discarding the other five so the next run probed them all over again.
    if (toolVersionCache !== undefined) await timing.phase('tool-versions-persist', () => toolVersionCache.persist())
  }

  timing.wrap('sort-diagnostics', () => collected.sort(
    // A `null` file (an orchestrator-level diagnostic with nothing to attribute) sorts before any
    // real path — `''` is less than every non-empty string — surfacing configuration-level notices
    // ahead of per-file findings rather than placing them arbitrarily among the files by chance.
    (a, b) =>
      compareStrings(a.file ?? '', b.file ?? '') ||
      a.range.start - b.range.start ||
      compareStrings(a.concept, b.concept),
  ))

  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 }
  for (const diagnostic of collected) counts[diagnostic.severity] += 1

  let filesFromCache = 0
  for (const [path, assignments] of assignmentsByFile) {
    if (cacheHitsByFile.get(path) === assignments) filesFromCache += 1
  }

  const cacheByEngine: EngineCacheStats[] = [...assignedByEngine]
    .map(([engine, filesAssigned]) => ({ engine, filesAssigned, filesFromCache: cacheHitsByEngine.get(engine) ?? 0 }))
    .sort((a, b) => compareStrings(a.engine, b.engine))

  // One reading, used for `durationMs` and for the timing rows both, so the breakdown adds up to the
  // number printed beside it rather than to a clock that moved on while the report was being built.
  const finishedAt = performance.now()

  yield {
    type: 'done',
    result: {
      diagnostics: collected,
      counts,
      engineFailures,
      unavailableEngines,
      baseline: baseline === null ? null : baseline.summarise(),
      stats: {
        filesScanned: inventory.files.length,
        filesAnalysed,
        filesFromCache,
        cacheByEngine,
        enginesRun,
        durationMs: Math.round(finishedAt - startedAt),
      },
      ...(timing.enabled
        ? {
            timings: buildTimingReport({
              phases: timing.measured(),
              startupMs: enteredAt - startedAt,
              insideMs: finishedAt - enteredAt,
              diagnostics: collected,
            }),
          }
        : {}),
      ruleset: {
        // `anyEnabledConcepts`, not `base`: a concept enabled only by an override is still checked
        // on the files it matches, so reporting the base count would undercount the run.
        enabledConcepts: resolver.anyEnabledConcepts.size,
        overlaps: election.overlaps.length,
        uncovered: election.uncovered,
        unknownKeys: resolver.base.unknownKeys,
      },
    },
  }
}

/**
 * `null` when there is no baseline file. A malformed or unreadable one throws (`ConfigError` from
 * `parseBaseline`) rather than being treated as absent: silently ignoring a broken baseline would fail
 * the build on findings a team already agreed to carry, with the reason nowhere on screen.
 *
 * `BaselineSummary.path` is repo-relative so the same repository state prints the same report from any
 * working directory — the property `e2e.test.ts` pins for the whole `agent` report.
 */
async function openBaseline(options: CheckOptions): Promise<BaselineMatcher | null> {
  const path = options.baselineFile ?? baselinePathFor(options.rootDir)
  const file = await readBaseline(path)
  if (file === null) return null
  return createBaselineMatcher({ path: relative(options.rootDir, path).replaceAll('\\', '/'), file })
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
  generated: GeneratedPolicy
  signal: AbortSignal
}

/**
 * Runs one `'project'`-granularity assignment (spec §8.1: `tsc`, `knip` today) — the counterpart to the
 * per-file batch loop in `streamCheck` above. A project engine analyses a *program*, not a list of files,
 * so asking it about a subset gives wrong answers rather than just faster ones (§8.1), and everything here
 * follows from that one constraint:
 *
 * - **One cache entry, not one per file.** `deriveProjectResultKey` folds every assigned file's content
 *   hash into a single aggregate; a hit is all-or-nothing for the whole assignment, laid out at
 *   `results/project/<engineId>/<hash>.json` (spec §9) rather than `ResultStore`'s per-file sharding.
 * - **One `run()` call, not a batch loop.** `assignment.files` is what the aggregate hash is built from
 *   and what gets scanned for stale suppressions below, but it is never chunked into CLI file arguments:
 *   a project engine decides its own file set from its own project configuration, which is why
 *   `Engine.run`'s `batch` parameter is close to vestigial here.
 * - **Every assigned file still gets scanned for suppressions**, with no `fileRaws.length === 0`
 *   shortcut: a stale `sgate-disable-*` directive on a file the engine now reports nothing for is exactly
 *   the case `config.unused-suppression` exists to catch.
 * - **A raw diagnostic for a file outside `assignment.files` is kept, not dropped** — a project engine
 *   reporting against `tsconfig.json` itself, or against a file its `include` matches and our inventory
 *   does not. Second-guessing the engine's own program scope would be the silent wrongness spec §18/§22
 *   warns against.
 *
 * @yields Every diagnostic for this assignment, for the caller to filter by `isVisible` itself.
 */
async function* runProjectAssignment(
  engine: Engine,
  assignment: EngineAssignment,
  handle: EngineConfigHandle,
  version: string,
  ctx: ProjectAssignmentContext,
  stats: { cacheHit: boolean },
  timing: Timing = NO_TIMING,
): AsyncGenerator<Diagnostic> {
  // Bounded for the reason the file-granularity probe loop is (see its own comment): on a cold run
  // `hashOf` reads every assigned file, and a project engine's assignment is the whole program.
  // `mapWithLimit` preserves input order, which this needs more sharply than that loop does — the
  // hashes go straight into `deriveProjectResultKey`, so completion order would make the key differ
  // between two runs over identical inputs and no run would ever hit.
  const files = await timing.phase(`hash-files:${engine.id}`, () => mapWithLimit(
    assignment.files,
    PROBE_CONCURRENCY,
    async (file) => ({ path: file.path, hash: await ctx.statIndex.hashOf(ctx.rootDir, file) }),
  ))
  const components: ProjectResultKeyInput = {
    engineId: engine.id,
    engineVersion: version,
    engineRulesetHash: handle.rulesetHash,
    configHash: ctx.configHash,
    files,
  }
  const key = deriveProjectResultKey(components)

  const cached = ctx.useCache ? await timing.phase(`probe:${engine.id}`, () => ctx.projectResultStore.get(engine.id, key)) : null
  if (cached !== null) {
    stats.cacheHit = true
    yield* cached
    return
  }
  stats.cacheHit = false

  const raws: RawDiagnostic[] = []
  await timing.phase(`run:${engine.id}`, async () => {
    for await (const raw of engine.run({ files: assignment.files }, handle, ctx.runContext, ctx.signal)) {
      raws.push(raw)
    }
  })

  // Pre-seeded with every assigned file (so a clean one is still scanned for suppressions), then
  // widened to any other file the engine actually reported against — see the module doc comment.
  const byFile = new Map<string, RawDiagnostic[]>(assignment.files.map((file) => [file.path, []]))
  for (const raw of raws) {
    const existing = byFile.get(raw.file)
    if (existing) existing.push(raw)
    else byFile.set(raw.file, [raw])
  }

  // Measured per file, with the read split out of the normalize, so the two rows mean the same thing
  // here as they do in the file-granularity loop above and a reader comparing `normalize:tsc` against
  // `normalize:oxlint` is comparing the same work.
  const normalized: Diagnostic[] = []
  for (const [path, fileRaws] of byFile) {
    const source = await timing.phase(`read-source:${engine.id}`, () => ctx.readSource(path))
    normalized.push(
      ...timing.wrap(`normalize:${engine.id}`, () => normalizeDiagnostics({
        engine: engine.id,
        raws: fileRaws,
        entries: ctx.entries,
        owners: ctx.election.owners,
        sourceOf: () => source,
        levelOf: (concept) => ctx.resolver.forFile(path).rules.get(concept as never)?.level ?? 'off',
        suppressionScanFiles: [path],
        generated: ctx.generated,
      })),
    )
  }

  if (ctx.useCache) await timing.phase(`cache-write:${engine.id}`, () => ctx.projectResultStore.set(engine.id, key, normalized, components))
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
      ruleRefKey: `slop-gate/${concept}`,
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

  // The second kind of dead override, and the one with no other symptom: an `overrides` block that
  // sets a rule's *options*. Its level still applies to the files it matches, so nothing looks
  // broken — but the engine is configured once for the whole run, so the options are silently the
  // base cascade's everywhere (see `RuleSetResolver.optionsOf`). Without this the user's only
  // evidence is a finding count that does not match what they configured.
  for (const { source, key } of input.resolver.ignoredOverrideOptions) {
    const diagnostic = emit(
      'config.dead-override',
      `\`${source}\` sets options for \`${key}\`, which cannot be scoped to a path: an engine is ` +
        `configured once per run, so the options from the base config apply everywhere. The level ` +
        `in this override still applies.`,
    )
    if (diagnostic) diagnostics.push(diagnostic)
  }

  for (const record of input.election.overlaps) {
    const diagnostic = emit(
      'config.rule-overlap',
      `${ruleRefKey(record.winner)} and ${ruleRefKey(record.loser)} both detect ` +
        `\`${record.concept}\`; ${ruleRefKey(record.loser)} lost arbitration (${record.reason}).`,
    )
    if (diagnostic) diagnostics.push(diagnostic)
  }

  return diagnostics
}
