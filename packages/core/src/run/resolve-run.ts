import type { RuleSetResolver } from '../config/resolve.ts'
import { createRuleSetResolver } from '../config/resolve.ts'
import type { SlopGateConfig } from '../config/types.ts'
import { buildInventory, type FileSource } from '../discovery/inventory.ts'
import type { FileInventory } from '../discovery/types.ts'
import type { Engine } from '../engine/types.ts'
import { frameworkOverrideLayers, frameworkRuleLayers } from '../frameworks/adjustments.ts'
import { detectFrameworks } from '../frameworks/detect.ts'
import type { FrameworkDetection } from '../frameworks/types.ts'
import { electOwners, type DisplacedOwner, type ElectionResult } from '../registry/elect.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import type { EngineId, RuleEntry } from '../registry/types.ts'
import { NO_TIMING, type Timing } from './timing.ts'

export type ResolveRunOptions = {
  rootDir: string
  config: SlopGateConfig
  configFile?: string
  engines: readonly Engine[]
  entries?: readonly RuleEntry[]
  fileSource?: FileSource
  frameworks?: FrameworkDetection
  timing?: Timing
  signal?: AbortSignal
}

export type ResolvedRun = {
  resolver: RuleSetResolver
  election: ElectionResult
  inventory: FileInventory
  entries: readonly RuleEntry[]
  frameworks: FrameworkDetection
  unavailableEngines: readonly UnavailableEngine[]
}

export type UnavailableEngine = {
  readonly engine: EngineId
  readonly reason: string
  readonly install?: string
  readonly displaced: readonly DisplacedOwner[]
}

export async function resolveRun(options: ResolveRunOptions): Promise<ResolvedRun> {
  const signal = options.signal ?? new AbortController().signal
  const entries = options.entries ?? RULE_ENTRIES
  const configFile = options.configFile
  const timing = options.timing ?? NO_TIMING

  const inventory = await timing.phase('discover', () => buildInventory({
    rootDir: options.rootDir,
    ...(options.config.ignore === undefined ? {} : { ignore: options.config.ignore }),
    ...(options.fileSource === undefined ? {} : { source: options.fileSource }),
    signal,
  }))

  const frameworks = options.frameworks ?? (await timing.phase('detect-frameworks', () => detectFrameworks({ inventory })))
  const resolver = timing.wrap('resolve-ruleset', () => createRuleSetResolver({
    config: options.config,
    ...(configFile === undefined ? {} : { configFile }),
    frameworks: frameworkRuleLayers(frameworks),
    frameworkOverrides: frameworkOverrideLayers(frameworks),
  }))

  const probes = await timing.phase('availability', () => Promise.all(
    options.engines.map(async (engine) => ({
      engine: engine.id,
      availability: (await engine.availability?.()) ?? ({ available: true } as const),
    })),
  ))
  const absent = probes.flatMap((probe) =>
    probe.availability.available ? [] : [{ engine: probe.engine, availability: probe.availability }],
  )

  const election = timing.wrap('arbitrate', () => electOwners({
    entries,
    enabledConcepts: resolver.anyEnabledConcepts,
    capabilities: new Set(options.engines.flatMap((engine) => engine.capabilities.provides)),
    languages: inventory.languages,
    unavailableEngines: new Set(absent.map((probe) => probe.engine)),
    participatingEngines: new Set(options.engines.map((engine) => engine.id)),
    pinnedOwners: resolver.base.pinnedOwners,
  }))

  const unavailableEngines = absent.map(({ engine, availability }) => ({
    engine,
    reason: availability.reason,
    ...(availability.install === undefined ? {} : { install: availability.install }),
    displaced: election.displaced.filter((record) => record.wouldOwn.engine === engine),
  }))

  return { resolver, election, inventory, entries, frameworks, unavailableEngines }
}
