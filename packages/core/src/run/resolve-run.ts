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

export type ResolveRunOptions = {
  rootDir: string
  config: SlopGateConfig
  configFile?: string
  /**
   * The engines a real run would register. Only `.id`, `.capabilities` and `.availability()` are
   * ever read here — the first two plain synchronous properties, the third contractually
   * filesystem-only (see `Engine.availability`, which says at length why it may not spawn or
   * download) — so passing the real engine list costs nothing beyond constructing the objects and a
   * `stat` or two: nothing in this module calls `.version()`, `.materializeConfig()` or `.run()`. That is what makes it safe for a caller that must never
   * start a real engine (`sgate rules why` has no business spawning oxlint) to still get an
   * arbitration result that reflects exactly which engines and capabilities a real `check` would
   * have had, rather than a second, hand-maintained guess at the same thing.
   */
  engines: readonly Engine[]
  entries?: readonly RuleEntry[]
  fileSource?: FileSource
  /** Overridable so a test can pin an exact detected set without staging a repository for it. */
  frameworks?: FrameworkDetection
  signal?: AbortSignal
}

export type ResolvedRun = {
  resolver: RuleSetResolver
  election: ElectionResult
  inventory: FileInventory
  /** The registry entries arbitration actually ran against — `options.entries ?? RULE_ENTRIES`,
   *  resolved once here so every caller reads the same default instead of each re-deriving it. */
  entries: readonly RuleEntry[]
  /** Spec §23. Consumed twice: by the resolver above (already applied), and by each engine adapter
   *  via `RunContext.adjustments`. `sgate rules why` reads the evidence straight off it. */
  frameworks: FrameworkDetection
  /**
   * Registered engines whose tooling is absent, each with the reason and — where the adapter can
   * supply one — the command that installs it. Empty on a fully-equipped machine.
   *
   * This is the coverage gap a run has to state out loud. A skipped engine that produced no findings
   * is indistinguishable from a clean repository unless the run says which engine was skipped, so
   * every reporter prints this and `--require-engines` turns it into a failure.
   */
  unavailableEngines: readonly UnavailableEngine[]
}

export type UnavailableEngine = {
  readonly engine: EngineId
  readonly reason: string
  readonly install?: string
  /**
   * What the absence actually cost — the concepts this engine would have owned, each naming the
   * weaker owner that took over or nothing at all (`DisplacedOwner.insteadOwnedBy`). Empty for an
   * absent engine that would have lost every contest anyway: absent, but nothing was lost, and a
   * reporter that named it would send the reader to install a tool that would not have helped.
   */
  readonly displaced: readonly DisplacedOwner[]
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

  const inventory = await buildInventory({
    rootDir: options.rootDir,
    ...(options.config.ignore === undefined ? {} : { ignore: options.config.ignore }),
    ...(options.fileSource === undefined ? {} : { source: options.fileSource }),
    signal,
  })

  // Ordered, not incidental (spec §23.1): detection reads the inventory, and the resolver reads
  // detection. That is also why discovery cannot be skipped for the governance commands — see the
  // note below on language applicability, which now has a second reason behind it.
  const frameworks = options.frameworks ?? (await detectFrameworks({ inventory }))
  const resolver = createRuleSetResolver({
    config: options.config,
    ...(configFile === undefined ? {} : { configFile }),
    frameworks: frameworkRuleLayers(frameworks),
    frameworkOverrides: frameworkOverrideLayers(frameworks),
  })

  // Probed before the election, because availability decides who *can* own a concept (see
  // `ElectionInput.unavailableEngines`). `Engine.availability` is contractually filesystem-only, so
  // this stays safe for `sgate rules why` — which must explain a run without performing any of it.
  const probes = await Promise.all(
    options.engines.map(async (engine) => ({
      engine: engine.id,
      availability: (await engine.availability?.()) ?? ({ available: true } as const),
    })),
  )
  // `flatMap` rather than `filter`: a predicate does not narrow `EngineAvailability`, and reading
  // `reason` off the union afterwards would need a cast that could outlive the shape it assumes.
  const absent = probes.flatMap((probe) =>
    probe.availability.available ? [] : [{ engine: probe.engine, availability: probe.availability }],
  )

  const election = electOwners({
    entries,
    enabledConcepts: resolver.anyEnabledConcepts,
    capabilities: new Set(options.engines.flatMap((engine) => engine.capabilities.provides)),
    languages: inventory.languages,
    unavailableEngines: new Set(absent.map((probe) => probe.engine)),
    // See `ElectionInput.participatingEngines`'s own doc comment: an entry whose engine this run
    // never instantiated must not contest a concept or appear as a suppression — the same
    // contract `streamCheck` relies on, now shared verbatim rather than re-derived.
    participatingEngines: new Set(options.engines.map((engine) => engine.id)),
    pinnedOwners: resolver.base.pinnedOwners,
  })

  // Assembled after the election because `displaced` is an election outcome, not a property of the
  // probe: whether an absent engine cost the run anything depends on who else was standing.
  const unavailableEngines = absent.map(({ engine, availability }) => ({
    engine,
    reason: availability.reason,
    ...(availability.install === undefined ? {} : { install: availability.install }),
    displaced: election.displaced.filter((record) => record.wouldOwn.engine === engine),
  }))

  return { resolver, election, inventory, entries, frameworks, unavailableEngines }
}
