import type { ByteRange, Edit } from '../diagnostics/types.ts'
import type { FixTier } from '../fix/types.ts'
import type { InventoryFile } from '../discovery/types.ts'
import type { EngineAdjustments } from '../frameworks/types.ts'
import type { LanguageId } from '../languages.ts'
import type { RuleLevel } from '../config/types.ts'
import type { Capability, EngineId } from '../registry/types.ts'

export type RawSeverity = 'error' | 'warning' | 'advice' | 'info'

/**
 * The edits an engine offers for one finding (spec §11 step 1).
 *
 * Deliberately carries **no tier**: `RuleEntry.fixKind` is the authority on whether a fix is safe,
 * suggested or unsafe (D7 — "each declared per rule in the registry and covered by tests"), and
 * `normalizeDiagnostics` stamps it on. An adapter that reported its own tier would be a second,
 * unreviewed source of truth for the one decision the whole three-tier design rests on, and a rule
 * the registry says is unfixable would be able to smuggle an edit past `sgate rules`.
 *
 * Ranges are byte offsets into the file's UTF-8 bytes, exactly like `RawDiagnostic.range`.
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
  /**
   * Populated only when `RunContext.fixTier` asked for it. `sgate check` never sets that, so the
   * common path pays nothing for a feature it does not use — and an adapter that has to *derive*
   * fixes rather than read them out of its own output (see `engine-oxlint`) does that work only on a
   * `sgate fix` run.
   */
  readonly fix?: RawFix
}

/** engineRuleId → level. Levels are already resolved; the engine only materialises them. */
export type EngineRuleSelection = ReadonlyMap<string, RuleLevel>

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
  /**
   * Framework-derived settings for **this engine only**, already merged and sorted (spec §23.2).
   * Optional so an adapter test can construct a context without one; absent and empty mean the same
   * thing. `key` is this engine's own vocabulary — core does not interpret it, the adapter does,
   * including how the union maps onto whatever merge semantics the engine's config format has.
   */
  readonly adjustments?: EngineAdjustments
  /**
   * Set by `sgate fix` (spec §11) to the highest fix tier this run will apply, and absent on every
   * `sgate check`. An adapter that can report fixes should populate `RawDiagnostic.fix` when it is
   * present and skip that work when it is not; an adapter with no fixes ignores it entirely.
   *
   * It is a *ceiling*, not a filter of last resort — an adapter is free to hand back everything it
   * has and let `normalizeDiagnostics` and the fix loop gate on `RuleEntry.fixKind`. It exists
   * because an engine that must run itself again to produce a fix (oxlint) can use it to ask for
   * only the tiers that could possibly be applied.
   */
  readonly fixTier?: FixTier
}

export type EngineConfigHandle = {
  readonly path: string
  readonly rulesetHash: string
  /** How many rules this config enables, when the engine can report it. Lets `run` assert that the
   *  engine activated exactly the elected set — catching both unelected rules leaking in and
   *  elected rules silently not running. */
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

/**
 * Edits for one `(file, rule)` pair. Not keyed to an individual `FixTarget`: every target sharing a
 * file and a rule also shares the tier, priority and severity arbitration ranks by, so a finer
 * attribution would carry no information the pipeline could act on.
 */
export type DerivedFix = {
  readonly file: string
  readonly engineRuleId: string
  readonly edits: readonly Edit[]
}

/**
 * Whether an engine can actually run here. `reason` and `install` are only read when it cannot, and
 * both reach the user: `reason` says what is missing, `install` is the exact command that fixes it
 * (spec §18).
 */
export type EngineAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: string; readonly install?: string }

export interface Engine {
  readonly id: EngineId
  readonly capabilities: EngineCapabilities
  /**
   * Whether this engine's tooling is present. Omit it entirely for a bundled engine — anything
   * installed by `npm install` is present by construction, and an implementation that always
   * returns `available: true` is noise.
   *
   * **Contract: this must touch the filesystem and nothing else.** No spawning a process, no
   * network, no download, no writing anything — a `PATH` lookup and a `stat` are the whole budget.
   *
   * The reason is not performance. `sgate rules why` calls this, and `rules why` explains what a run
   * *would* do without doing any of it; an availability probe that shells out to `<tool> --version`
   * would make an explain-only command execute a program, and one that lazily fetched a missing
   * binary would make it change the machine. The obvious implementation is a `--version` spawn, so
   * this says plainly that the obvious implementation is wrong.
   *
   * Reported, never inferred: an engine that is registered but unavailable is a *coverage gap* the
   * run states out loud, and it is deliberately distinct from an engine that was never registered.
   * Collapsing the two would leave a user comparing two machines with no way to tell "this build
   * does not include actionlint" from "actionlint is not installed here".
   */
  availability?(): Promise<EngineAvailability>
  version(): Promise<string>
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
   * diffing (see that package's `derive-fixes.ts`).
   *
   * Called by `sgate fix` **after** normalization, unlike `RawDiagnostic.fix` which rides along with
   * the finding. That ordering is the reason to have two routes rather than one: only diagnostics
   * that survived arbitration, the tier gate and inline suppressions become targets, so an engine
   * that must re-run itself never does that work for a finding the user already silenced or the
   * registry never owned.
   *
   * An engine that reports its fixes inline does not implement this.
   */
  deriveFixes?(
    targets: readonly FixTarget[],
    context: RunContext,
    signal: AbortSignal,
  ): Promise<readonly DerivedFix[]>
}
