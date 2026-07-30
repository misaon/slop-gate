import type { ByteRange } from '../diagnostics/types.ts'
import type { InventoryFile } from '../discovery/types.ts'
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
}

export type EngineConfigHandle = {
  readonly path: string
  readonly rulesetHash: string
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
