import type { ToolVersionCache } from '../cache/tool-versions.ts'
import type { ByteRange, Edit } from '../diagnostics/types.ts'
import type { FixTier } from '../fix/types.ts'
import type { InventoryFile } from '../discovery/types.ts'
import type { EngineSettings } from '../frameworks/types.ts'
import type { LanguageId } from '../languages.ts'
import type { RuleLevel, RuleOptions } from '../config/types.ts'
import type { Capability, EngineId } from '../registry/types.ts'

export type RawSeverity = 'error' | 'warning' | 'advice' | 'info'

/**
 * The edits an engine offers for one finding (spec §11 step 1). Ranges are byte offsets into the
 * file's UTF-8 bytes, exactly like `RawDiagnostic.range`.
 *
 * Deliberately carries **no tier**: `RuleEntry.fixKind` is the authority on whether a fix is safe,
 * suggested or unsafe, and `normalizeDiagnostics` stamps it on. An adapter reporting its own tier
 * would be a second, unreviewed source of truth for the one decision the three-tier design rests on,
 * and a rule the registry says is unfixable could smuggle an edit past `sgate rules`.
 */
export type RawFix = {
  readonly description?: string
  readonly edits: readonly Edit[]
}

export type RawDiagnostic = {
  readonly engineRuleId: string
  readonly message: string
  readonly severity: RawSeverity
  /** Repo-relative, POSIX separators. Adapters normalise this before yielding. */
  readonly file: string
  readonly range: ByteRange
  readonly help?: string
  readonly docsUrl?: string
  /** Populated only when `RunContext.fixTier` asked for it — `sgate check` never sets that, so an
   *  adapter that has to *derive* fixes rather than read them out of its own output (see
   *  `engine-oxlint`) does that work only on a `sgate fix` run. */
  readonly fix?: RawFix
}

/**
 * One rule's resolved level followed by that rule's options (spec §6.2), both already resolved through
 * the config cascade; the engine only materialises them. **Core does not interpret the options** — it
 * resolves *which* apply and hands the list over; what a list means is the adapter's business, and an
 * adapter for an engine with no option grammar reads `setting[0]` and ignores the rest.
 *
 * **Always a tuple, never a bare level** — unlike `RuleSetting`, the shape a *user* writes. Widening
 * this to that union would leave every `level !== 'off'` comparison in the adapters compiling while
 * silently inverting the day a rule got options: an `['off', …]` is not `'off'`, so a disabled rule
 * reads as enabled with nothing in the output to see it by. Against the tuple that same comparison is
 * a hard type error (TS2367), so an adapter is forced to destructure the level out before comparing.
 *
 * **An adapter that reads the options must fold them into `EngineConfigHandle.rulesetHash`.** That
 * hash is the only per-engine term in the result cache key (`deriveResultKey`), so two runs differing
 * only by a rule's options would otherwise share a cache entry and the second be served the first's
 * findings. An adapter that *ignores* the options owes nothing: identical inputs really do produce
 * identical findings there.
 */
export type EngineRuleSetting = readonly [RuleLevel, ...RuleOptions]

/** engineRuleId → its resolved setting. Only ever holds rules that are on: `buildPlan` drops a rule
 *  resolving to `'off'` before the selection is built. Adapters check the level anyway — this is a
 *  published contract and a caller can construct one by hand. */
export type EngineRuleSelection = ReadonlyMap<string, EngineRuleSetting>

export type EngineCapabilities = {
  readonly languages: readonly LanguageId[]
  readonly granularity: 'file' | 'project'
  readonly provides: readonly Capability[]
  readonly fixes: boolean
}

export type RunContext = {
  readonly rootDir: string
  /** Where ephemeral engine configs are written. Cleaned up by the caller. */
  readonly tmpDir: string
  /** Framework-derived settings for **this engine only**, already merged and sorted (spec §23.2).
   *  Optional so an adapter test can construct a context without one; absent and empty mean the same.
   *  `key` is this engine's own vocabulary — core does not interpret it, the adapter does. */
  readonly adjustments?: EngineSettings
  /**
   * Set by `sgate fix` (spec §11) to the highest fix tier this run will apply, and absent on every
   * `sgate check`. An adapter that can report fixes should populate `RawDiagnostic.fix` when it is
   * present and skip that work when it is not. It is a *ceiling*, not a filter of last resort — an
   * adapter may hand back everything it has and let `normalizeDiagnostics` and the fix loop gate on
   * `RuleEntry.fixKind`; it exists so an engine that must run itself again to produce a fix (oxlint)
   * can ask for only the applicable tiers.
   */
  readonly fixTier?: FixTier
}

export type EngineConfigHandle = {
  readonly path: string
  readonly rulesetHash: string
  /** How many rules this config enables, when the engine can report it. Lets `run` assert the engine
   *  activated exactly the elected set — catching unelected rules leaking in and elected rules silently
   *  not running. */
  readonly ruleCount?: number
  dispose(): Promise<void>
}

export type FileBatch = { readonly files: readonly InventoryFile[] }

/** One finding the fix loop wants edits for. Only ever built from a diagnostic that survived
 *  arbitration, suppression and the tier gate — see `run/fix.ts`. */
export type FixTarget = {
  readonly file: string
  readonly engineRuleId: string
  readonly range: ByteRange
}

/** Edits for one `(file, rule)` pair. Not keyed to an individual `FixTarget`: every target sharing a
 *  file and a rule also shares the tier, priority and severity arbitration ranks by, so a finer
 *  attribution would carry no information the pipeline could act on. */
export type DerivedFix = {
  readonly file: string
  readonly engineRuleId: string
  readonly edits: readonly Edit[]
}

/** Whether an engine can actually run here. Both fields reach the user when it cannot: `reason` says
 *  what is missing, `install` is the exact command that fixes it (spec §18). */
export type EngineAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: string; readonly install?: string }

export interface Engine {
  readonly id: EngineId
  readonly capabilities: EngineCapabilities
  /**
   * Whether this engine's tooling is present. Omit it entirely for a bundled engine — anything
   * installed by `npm install` is present by construction.
   *
   * **Contract: this must touch the filesystem and nothing else.** No spawning a process, no network,
   * no download, no writing anything — a `PATH` lookup and a `stat` are the whole budget. Not for
   * performance: `sgate rules why` calls this, and it explains what a run *would* do without doing any
   * of it, so a `<tool> --version` spawn would make an explain-only command execute a program and a
   * lazy fetch would make it change the machine. The obvious implementation is the wrong one.
   *
   * Reported, never inferred: a registered-but-unavailable engine is a *coverage gap* the run states
   * out loud, distinct from one that was never registered — otherwise a user comparing two machines
   * cannot tell "this build does not include actionlint" from "actionlint is not installed here".
   */
  availability?(): Promise<EngineAvailability>
  /**
   * A cache-key component and nothing else: no reporter prints it and nothing in a run branches on it.
   * It exists so that upgrading a tool invalidates the results the previous one produced, which is why
   * it must report the *resolved* binary's version rather than any pinned constant. `cache` is optional
   * because most implementations need nothing to answer; one that spawns `<tool> --version` must pass it
   * through to `toolVersion`, where the spawn is elided — called with no cache it always spawns.
   */
  version(cache?: ToolVersionCache): Promise<string>
  materializeConfig(selection: EngineRuleSelection, context: RunContext): Promise<EngineConfigHandle>
  run(
    batch: FileBatch,
    handle: EngineConfigHandle,
    context: RunContext,
    signal: AbortSignal,
  ): AsyncIterable<RawDiagnostic>
  /**
   * Optional second route to fix data, for an engine that cannot *describe* a fix and can only
   * *perform* one. oxlint is the case this exists for: none of its five output formats carries fix
   * data, so `@misaon/slop-gate-engine-oxlint` obtains edits by running `--fix` over copies and
   * diffing. An engine that reports its fixes inline does not implement this.
   *
   * Called by `sgate fix` **after** normalization, unlike `RawDiagnostic.fix` which rides along with
   * the finding — only diagnostics that survived arbitration, the tier gate and inline suppressions
   * become targets, so an engine that must re-run itself never does that work for a finding the user
   * already silenced or the registry never owned.
   *
   * `selection` is the same one `materializeConfig` was given: the re-materialised config must agree
   * with the check run's about *options*, not just about which rules are on — a `--fix` pass configured
   * with `eqeqeq`'s default `always` rewrites the `== null` comparisons a check run configured with
   * `smart` deliberately exempted, edits for findings the user was never shown.
   */
  deriveFixes?(
    targets: readonly FixTarget[],
    selection: EngineRuleSelection,
    context: RunContext,
    signal: AbortSignal,
  ): Promise<readonly DerivedFix[]>
}
