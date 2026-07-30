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
import { normalizeDiagnostics } from '../engine/normalize.ts'
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
  stats: { filesScanned: number; filesFromCache: number; enginesRun: number; durationMs: number }
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
  const configFile = options.configFile ?? 'slop-gate.config.ts'

  const resolver = createRuleSetResolver({ config: options.config, configFile })
  const inventory = await buildInventory({
    rootDir: options.rootDir,
    ...(options.config.ignore === undefined ? {} : { ignore: options.config.ignore }),
    ...(options.fileSource === undefined ? {} : { source: options.fileSource }),
    signal,
  })

  const election = electOwners({
    entries,
    enabledConcepts: resolver.base.enabledConcepts,
    capabilities: new Set(),
    languages: inventory.languages,
    pinnedOwners: resolver.base.pinnedOwners,
  })

  const configHash = hashJson({ config: options.config, entries: entries.map(ruleRefKey) })
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

  const plan = buildPlan({ engines: options.engines, inventory, election, resolver, entries })

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
            const source = await readSource(path)
            const normalized = normalizeDiagnostics({
              engine: engine.id,
              raws: fileRaws,
              entries,
              owners: election.owners,
              sourceOf: () => source,
              levelOf: (concept) => resolver.forFile(path).rules.get(concept as never)?.level,
            })

            if (useCache) await resultStore.set(keys.get(path)!, normalized, keyInputs.get(path)!)
            for (const diagnostic of normalized) {
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

  await statIndex.persist()

  collected.sort(
    (a, b) => compareStrings(a.file, b.file) || a.range.start - b.range.start || compareStrings(a.concept, b.concept),
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
        filesFromCache,
        enginesRun,
        durationMs: Math.round(performance.now() - startedAt),
      },
      ruleset: {
        enabledConcepts: resolver.base.enabledConcepts.size,
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
  configFile: string
}

function configDiagnostics(input: ConfigDiagnosticInput): Diagnostic[] {
  const emit = (concept: string, message: string): Diagnostic | null => {
    const level = input.resolver.base.rules.get(concept as never)?.level
    if (level === undefined || level === 'off') return null
    return {
      concept,
      ruleId: `slop-gate/${concept}`,
      engine: 'slop-gate',
      severity: level === 'error' ? 'error' : level === 'info' ? 'info' : 'warn',
      message,
      file: input.configFile,
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
