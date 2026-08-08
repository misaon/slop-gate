import { readFile, rmdir } from 'node:fs/promises'
import { availableParallelism } from 'node:os'
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
import type { GeneratedPolicy, RuleKey, SlopGateConfig } from '../config/types.ts'
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
  useBaseline?: boolean
  baselineFile?: string
  batchSize?: number
  sources?: Map<string, string>
  startedAt?: number
  timing?: boolean
  fixTier?: FixTier
  signal?: AbortSignal
}

export type EngineCacheStats = {
  engine: EngineId
  filesAssigned: number
  filesFromCache: number
}

export type CheckResult = {
  diagnostics: Diagnostic[]
  counts: Record<Severity, number>
  engineFailures: { engine: string; message: string }[]
  unavailableEngines: readonly UnavailableEngine[]
  baseline: BaselineSummary | null
  stats: {
    filesScanned: number
    filesAnalysed: number
    filesFromCache: number
    cacheByEngine: readonly EngineCacheStats[]
    enginesRun: number
    durationMs: number
  }
  /** Produced and then dropped, by rule and by who dropped it — the only false-positive signal a run
   * can observe without asking. */
  dropped: {
    inline: Readonly<Record<string, number>>
    baseline: Readonly<Record<string, number>>
    generated: Readonly<Record<string, number>>
  }
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

function recordDrop(into: Map<string, number>, diagnostic: Diagnostic): void {
  into.set(diagnostic.ruleRefKey, (into.get(diagnostic.ruleRefKey) ?? 0) + 1)
}

type AssignmentOutcome = {
  readonly diagnostics: Diagnostic[]
  readonly cacheHits: string[]
  ran: boolean
  failure?: string
}

// Engines are subprocesses that thread internally, so this bounds contention rather than filling
// cores. At least two, so a project-granularity engine (tsc, knip) never blocks the per-file ones.
function engineConcurrency(assignments: number): number {
  const cores = availableParallelism()
  return Math.max(2, Math.min(assignments, Math.floor(cores / 2)))
}

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
  const enteredAt = performance.now()
  const startedAt = options.startedAt ?? enteredAt
  const timing = options.timing === true ? createTiming() : NO_TIMING
  const signal = options.signal ?? new AbortController().signal
  const cacheDir = options.cacheDir ?? join(options.rootDir, '.slop-gate', 'cache')
  const useCache = options.useCache ?? true
  const baseline = (options.useBaseline ?? true) ? await openBaseline(options) : null
  const configFile = options.configFile

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

  const configHash = hashJson({
    config: options.config,
    entries,
    frameworks,
    fixTier: options.fixTier,
    unavailableEngines,
  })
  const generatedPolicy = options.config.generated ?? 'skip'
  const statIndex = await openStatIndex(cacheDir)
  const toolVersionCache = useCache ? await openToolVersionCache(cacheDir) : undefined
  const resultStore = openResultStore(cacheDir)
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
  const dropped = {
    inline: new Map<string, number>(),
    baseline: new Map<string, number>(),
    generated: new Map<string, number>(),
  }
  const engineFailures: { engine: string; message: string }[] = []
  let enginesRun = 0

  const seenSynthetic = new Set<string>()
  const isDuplicateSynthetic = (diagnostic: Diagnostic): boolean => {
    if (diagnostic.engine !== 'slop-gate') return false
    const key = [diagnostic.concept, diagnostic.file, diagnostic.range.start, diagnostic.range.end, diagnostic.message].join('\0')
    if (seenSynthetic.has(key)) return true
    seenSynthetic.add(key)
    return false
  }

  for (const diagnostic of configDiagnostics({ resolver, election, configFile })) {
    if (baseline?.accepts(diagnostic) === true) {
      recordDrop(dropped.baseline, diagnostic)
      continue
    }
    collected.push(diagnostic)
    yield { type: 'diagnostic', diagnostic }
  }

  const plan = buildPlan({ engines: options.engines, inventory, election, resolver })
  const assignmentsByFile = new Map<string, number>()
  const assignedByEngine = new Map<EngineId, number>()
  for (const assignment of plan) {
    assignedByEngine.set(assignment.engineId, (assignedByEngine.get(assignment.engineId) ?? 0) + assignment.files.length)
    for (const file of assignment.files) assignmentsByFile.set(file.path, (assignmentsByFile.get(file.path) ?? 0) + 1)
  }
  const filesAnalysed = assignmentsByFile.size

  const cacheHitsByFile = new Map<string, number>()
  const cacheHitsByEngine = new Map<EngineId, number>()
  const recordCacheHit = (engineId: EngineId, path: string): void => {
    cacheHitsByFile.set(path, (cacheHitsByFile.get(path) ?? 0) + 1)
    cacheHitsByEngine.set(engineId, (cacheHitsByEngine.get(engineId) ?? 0) + 1)
  }

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

  // Each assignment buffers, and the buffers are emitted in plan order: concurrency must not change a
  // byte of what a reporter sees.
  const runAssignment = async (assignment: (typeof plan)[number]): Promise<AssignmentOutcome> => {
    const outcome: AssignmentOutcome = { diagnostics: [], cacheHits: [], ran: false }
    const resolved = planned.get(assignment.engineId)
    if (resolved === undefined) return outcome
    const engine = resolved.engine

    const take = (diagnostic: Diagnostic): void => {
      const by = diagnostic.suppressed?.by
      if (by === 'inline' || by === 'config') return recordDrop(dropped.inline, diagnostic)
      if (by === 'generated') return recordDrop(dropped.generated, diagnostic)
      if (isDuplicateSynthetic(diagnostic)) return
      if (baseline?.accepts(diagnostic) === true) return recordDrop(dropped.baseline, diagnostic)
      outcome.diagnostics.push(diagnostic)
    }

      try {
        if ('error' in resolved) throw resolved.error
        const version = resolved.version
        const runContext: RunContext = {
          rootDir: options.rootDir,
          tmpDir: join(options.rootDir, '.slop-gate', 'tmp'),
          adjustments: engineAdjustmentsFor(engine.id, frameworks),
          ...(options.fixTier === undefined ? {} : { fixTier: options.fixTier }),
        }
        const handle = await timing.phase(`materialize:${engine.id}`, () => engine.materializeConfig(assignment.selection, runContext))
        outcome.ran = true

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
              take(diagnostic)
            }
            if (projectStats.cacheHit) for (const file of assignment.files) outcome.cacheHits.push(file.path)
          } finally {
            await handle.dispose()
          }
          return outcome
        }

        try {
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

          for (const { file, components, key, hit } of probes) {
            keys.set(file.path, key)
            keyInputs.set(file.path, components)

            if (hit === null) {
              pending.push(file)
              continue
            }
            outcome.cacheHits.push(file.path)
            for (const diagnostic of hit) take(diagnostic)
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
              const source = await timing.phase(`read-source:${engine.id}`, () => readSource(path))
              const normalized = timing.wrap(`normalize:${engine.id}`, () => normalizeDiagnostics({
                engine: engine.id,
                raws: fileRaws,
                entries,
                owners: election.owners,
                sourceOf: () => source,
                levelOf: (concept) => resolver.forFile(path).rules.get(concept as RuleKey)?.level ?? 'off',
                suppressionScanFiles: [path],
                generated: generatedPolicy,
              }))

              if (useCache) await timing.phase(`cache-write:${engine.id}`, () => resultStore.set(engine.id, keys.get(path)!, normalized, keyInputs.get(path)!))
              for (const diagnostic of normalized) take(diagnostic)
            }
          }
        } finally {
          await timing.phase(`dispose:${engine.id}`, () => handle.dispose())
        }
      } catch (error) {
        outcome.failure = error instanceof Error ? error.message : String(error)
      }

    return outcome
  }

  try {
    const outcomes = await timing.phase('engines', () => mapWithLimit(plan, engineConcurrency(plan.length), runAssignment))

    for (const [index, assignment] of plan.entries()) {
      const outcome = outcomes[index]!
      if (outcome.ran) enginesRun += 1
      for (const path of outcome.cacheHits) recordCacheHit(assignment.engineId, path)
      for (const diagnostic of outcome.diagnostics) {
        collected.push(diagnostic)
        yield { type: 'diagnostic', diagnostic }
      }
      if (outcome.failure !== undefined) {
        engineFailures.push({ engine: assignment.engineId, message: outcome.failure })
        yield { type: 'engine-failed', engine: assignment.engineId, message: outcome.failure }
      }
    }
  } finally {
    if (useCache) {
      await timing.phase('stat-index-persist', () => statIndex.persist())
      await timing.phase('results-persist', () => resultStore.persist())
      await timing.phase('project-results-persist', () => projectResultStore.persist())
    }
    else await removeIfEmpty(join(options.rootDir, '.slop-gate', 'tmp'), join(options.rootDir, '.slop-gate'))
    if (toolVersionCache !== undefined) await timing.phase('tool-versions-persist', () => toolVersionCache.persist())
  }

  timing.wrap('sort-diagnostics', () => collected.sort(
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
              busyMs: timing.busyMs(),
              phases: timing.measured(),
              startupMs: enteredAt - startedAt,
              insideMs: finishedAt - enteredAt,
              diagnostics: collected,
            }),
          }
        : {}),
      dropped: {
        inline: Object.fromEntries(dropped.inline),
        baseline: Object.fromEntries(dropped.baseline),
        generated: Object.fromEntries(dropped.generated),
      },
      ruleset: {
        enabledConcepts: resolver.anyEnabledConcepts.size,
        overlaps: election.overlaps.length,
        uncovered: election.uncovered,
        unknownKeys: resolver.base.unknownKeys,
      },
    },
  }
}

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

async function* runProjectAssignment(
  engine: Engine,
  assignment: EngineAssignment,
  handle: EngineConfigHandle,
  version: string,
  ctx: ProjectAssignmentContext,
  stats: { cacheHit: boolean },
  timing: Timing = NO_TIMING,
): AsyncGenerator<Diagnostic> {
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

  const byFile = new Map<string, RawDiagnostic[]>(assignment.files.map((file) => [file.path, []]))
  for (const raw of raws) {
    const existing = byFile.get(raw.file)
    if (existing) existing.push(raw)
    else byFile.set(raw.file, [raw])
  }

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
        levelOf: (concept) => ctx.resolver.forFile(path).rules.get(concept as RuleKey)?.level ?? 'off',
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
  configFile: string | undefined
}

function configDiagnostics(input: ConfigDiagnosticInput): Diagnostic[] {
  const emit = (concept: string, message: string): Diagnostic | null => {
    const level = input.resolver.base.rules.get(concept as RuleKey)?.level
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
