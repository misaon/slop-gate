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

export interface Engine {
  readonly id: EngineId
  readonly capabilities: EngineCapabilities
  version(): Promise<string>
  materializeConfig(selection: EngineRuleSelection, context: RunContext): Promise<EngineConfigHandle>
  run(
    batch: FileBatch,
    handle: EngineConfigHandle,
    context: RunContext,
    signal: AbortSignal,
  ): AsyncIterable<RawDiagnostic>
}
