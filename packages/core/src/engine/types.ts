import type { ByteRange } from '../diagnostics/types.ts'
import type { InventoryFile } from '../discovery/types.ts'
import type { EngineAdjustments } from '../frameworks/types.ts'
import type { LanguageId } from '../languages.ts'
import type { RuleLevel } from '../config/types.ts'
import type { Capability, EngineId } from '../registry/types.ts'

export type RawSeverity = 'error' | 'warning' | 'advice' | 'info'

export type RawDiagnostic = {
  readonly engineRuleId: string
  readonly message: string
  readonly severity: RawSeverity
  /** Repo-relative, POSIX separators. Adapters normalise this before yielding. */
  readonly file: string
  readonly range: ByteRange
  readonly help?: string
  readonly docsUrl?: string
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
