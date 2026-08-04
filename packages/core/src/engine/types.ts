import type { ToolVersionCache } from '../cache/tool-versions.ts'
import type { ByteRange, Edit } from '../diagnostics/types.ts'
import type { FixTier } from '../fix/types.ts'
import type { InventoryFile } from '../discovery/types.ts'
import type { EngineSettings } from '../frameworks/types.ts'
import type { LanguageId } from '../languages.ts'
import type { RuleLevel, RuleOptions } from '../config/types.ts'
import type { Capability, EngineId } from '../registry/types.ts'

export type RawSeverity = 'error' | 'warning' | 'advice' | 'info'

type RawFix = {
  readonly description?: string
  readonly edits: readonly Edit[]
}

export type RawDiagnostic = {
  readonly engineRuleId: string
  readonly message: string
  readonly severity: RawSeverity
  readonly file: string
  readonly range: ByteRange
  readonly help?: string
  readonly docsUrl?: string
  readonly fix?: RawFix
}

export type EngineRuleSetting = readonly [RuleLevel, ...RuleOptions]

export type EngineRuleSelection = ReadonlyMap<string, EngineRuleSetting>

type EngineCapabilities = {
  readonly languages: readonly LanguageId[]
  readonly granularity: 'file' | 'project'
  readonly provides: readonly Capability[]
  readonly fixes: boolean
}

export type RunContext = {
  readonly rootDir: string
  readonly tmpDir: string
  readonly adjustments?: EngineSettings
  readonly fixTier?: FixTier
}

export type EngineConfigHandle = {
  readonly path: string
  readonly rulesetHash: string
  readonly ruleCount?: number
  dispose(): Promise<void>
}

export type FileBatch = { readonly files: readonly InventoryFile[] }

export type FixTarget = {
  readonly file: string
  readonly engineRuleId: string
  readonly range: ByteRange
}

export type DerivedFix = {
  readonly file: string
  readonly engineRuleId: string
  readonly edits: readonly Edit[]
}

export type EngineAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: string; readonly install?: string }

export interface Engine {
  readonly id: EngineId
  readonly capabilities: EngineCapabilities
  availability?(): Promise<EngineAvailability>
  version(cache?: ToolVersionCache): Promise<string>
  materializeConfig(selection: EngineRuleSelection, context: RunContext): Promise<EngineConfigHandle>
  run(
    batch: FileBatch,
    handle: EngineConfigHandle,
    context: RunContext,
    signal: AbortSignal,
  ): AsyncIterable<RawDiagnostic>
  deriveFixes?(
    targets: readonly FixTarget[],
    selection: EngineRuleSelection,
    context: RunContext,
    signal: AbortSignal,
  ): Promise<readonly DerivedFix[]>
}
