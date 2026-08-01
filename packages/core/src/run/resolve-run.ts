import type { RuleSetResolver } from '../config/resolve.ts'
import { createRuleSetResolver } from '../config/resolve.ts'
import type { SlopGateConfig } from '../config/types.ts'
import { buildInventory, type FileSource } from '../discovery/inventory.ts'
import type { FileInventory } from '../discovery/types.ts'
import type { Engine } from '../engine/types.ts'
import { electOwners, type ElectionResult } from '../registry/elect.ts'
import { RULE_ENTRIES } from '../registry/entries.ts'
import type { RuleEntry } from '../registry/types.ts'

export type ResolveRunOptions = {
  rootDir: string
  config: SlopGateConfig
  configFile?: string
  /**
   * The engines a real run would register. Only `.id` and `.capabilities` are ever read here —
   * both plain, synchronous properties (see `Engine`) — so passing the real engine list costs
   * nothing beyond constructing the objects: nothing in this module calls `.version()`,
   * `.materializeConfig()` or `.run()`. That is what makes it safe for a caller that must never
   * start a real engine (`sgate rules why` has no business spawning oxlint) to still get an
   * arbitration result that reflects exactly which engines and capabilities a real `check` would
   * have had, rather than a second, hand-maintained guess at the same thing.
   */
  engines: readonly Engine[]
  entries?: readonly RuleEntry[]
  fileSource?: FileSource
  signal?: AbortSignal
}

export type ResolvedRun = {
  resolver: RuleSetResolver
  election: ElectionResult
  inventory: FileInventory
  /** The registry entries arbitration actually ran against — `options.entries ?? RULE_ENTRIES`,
   *  resolved once here so every caller reads the same default instead of each re-deriving it. */
  entries: readonly RuleEntry[]
}

/**
 * Config resolution, rule-registry arbitration and file discovery — spec §4.1 stages 1 through 3
 * — with no engine ever invoked. Extracted out of `streamCheck` (`./check.ts`) so `sgate rules`'s
 * governance commands can resolve the exact same effective ruleset and election outcome a real
 * `check` would use, without scheduling, caching or running anything.
 *
 * This is *not* the full prepare/plan/schedule split the M2 restructure needs (see
 * `docs/superpowers/specs/2026-07-31-m0-followups.md`, "Restructure before M2, not after"): a real
 * per-engine cache key still needs `engine.version()` and `handle.rulesetHash`, which only the
 * engine can supply, so that half of "prepare" has to stay inside `streamCheck`'s own run loop for
 * now. This is the first honest slice of it — the half that never needed an engine in the first
 * place — done now because the governance commands need it today; the rest waits for a second
 * engine to design the split against.
 *
 * Discovery still runs here (not skipped): language applicability is a property of the repository,
 * not the config, so arbitration cannot know whether a Vue-scoped concept is a genuine gap or a
 * language mismatch (see `ElectionResult.uncovered`) without knowing what languages the repository
 * actually contains. A file walk with no engine attached is cheap — verified directly against both
 * this repository and the linked NestJS playground.
 */
export async function resolveRun(options: ResolveRunOptions): Promise<ResolvedRun> {
  const signal = options.signal ?? new AbortController().signal
  const entries = options.entries ?? RULE_ENTRIES
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
    // See `ElectionInput.participatingEngines`'s own doc comment: an entry whose engine this run
    // never instantiated must not contest a concept or appear as a suppression — the same
    // contract `streamCheck` relies on, now shared verbatim rather than re-derived.
    participatingEngines: new Set(options.engines.map((engine) => engine.id)),
    pinnedOwners: resolver.base.pinnedOwners,
  })

  return { resolver, election, inventory, entries }
}
