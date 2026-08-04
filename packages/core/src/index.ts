export const CORE_VERSION = '0.0.0'

export type { ByteRange, Diagnostic, FixKind, Position, Severity } from './diagnostics/types.ts'
export { createLineIndex, type LineIndex } from './diagnostics/position.ts'

export type { BaselineEntry } from './baseline/types.ts'
export { baselinePathFor, entriesOf, readBaseline, writeBaseline } from './baseline/file.ts'

export {
  CONCEPT_GROUPS,
  GENERATED_CONCEPT_IDS,
  conceptById,
  isConceptId,
  type ConceptId,
} from './concepts/catalogue.ts'

export { SCRIPT_LANGUAGES, type LanguageId } from './languages.ts'
export { compareStrings } from './ordering.ts'
export { isOneOf } from './guards.ts'
export { absolutePrefixes, toPosix, toRepoRelative } from './paths.ts'
export { ConfigError, EngineError } from './errors.ts'

export { ENGINE_PREFERENCE, ruleRefKey, type EngineId, type RuleEntry, type RuleRef } from './registry/types.ts'
export { RULE_ENTRIES } from './registry/entries.ts'
export type {
  ConceptOwnership,
  IneligibilityReason,
  IneligibleCandidate,
  OverlapReason,
  RuleOverlap,
} from './registry/elect.ts'

export {
  splitRuleSetting,
  type OverrideBlock,
  type PresetName,
  type RuleKey,
  type RuleLevel,
  type RuleMap,
  type RuleSetting,
  type SlopGateConfig,
} from './config/types.ts'
export { defineConfig } from './config/define.ts'
export { PRESETS } from './config/presets.ts'
export { loadConfig } from './config/load.ts'
export type { ProvenanceLayer } from './config/resolve.ts'

export { resolveScriptBin, type ScriptBinInvocation } from './exec/resolve-script-bin.ts'
export { isExecFileFailure, runEngineTool, toolVersion, type ExecFileFailure } from './exec/spawn.ts'
export {
  CACHE_DIR_ENV,
  resolveToolBinary,
  toolBinaryName,
  toolCacheDir,
  type ResolveToolBinaryOptions,
  type ToolBinaryResolution,
  type ToolBinarySource,
  type ToolBinarySpec,
} from './exec/resolve-tool-binary.ts'

export type { InventoryFile } from './discovery/types.ts'
export { detectLanguage } from './discovery/language.ts'
export { buildWorkspaceGraph } from './discovery/workspaces.ts'
export { createWalkFileSource } from './discovery/inventory.ts'

export { engineAdjustmentsFor, settingValues, settingValuesFor } from './frameworks/adjustments.ts'
export { detectFrameworks } from './frameworks/detect.ts'
export type { EngineSettings, FrameworkEvidence } from './frameworks/types.ts'

export { hashContent, hashJson } from './cache/keys.ts'

export type {
  DerivedFix,
  Engine,
  EngineAvailability,
  EngineConfigHandle,
  EngineRuleSelection,
  EngineRuleSetting,
  FileBatch,
  FixTarget,
  RawDiagnostic,
  RawSeverity,
  RunContext,
} from './engine/types.ts'
export { LEVEL_TO_SEVERITY } from './engine/normalize.ts'

export { runCheck, streamCheck, type CheckEvent, type CheckResult, type EngineCacheStats } from './run/check.ts'
export type { MeasuredPhase, TimingReport } from './run/timing.ts'
export { resolveRun, type ResolvedRun, type UnavailableEngine } from './run/resolve-run.ts'

export { runFix, type FixResult } from './run/fix.ts'
export { FIX_TIER_RANK, type CandidateEdit, type FixTier } from './fix/types.ts'
export { applyEdits, decodeUtf8, encodeUtf8 } from './fix/apply.ts'
export { unifiedDiff } from './fix/diff.ts'
export { editsFromRewrite } from './fix/derive.ts'

export { wasEnabledBeforeBeingDisabled, type ConceptEnablement, type OverrideMention } from './queries/enablement.ts'
export { explainConcept, type ConceptWhy } from './queries/why.ts'
export { buildRulesList, type RulesListEntry, type RulesListOptions } from './queries/list.ts'
export { buildRulesConflicts, type RulesConflicts } from './queries/conflicts.ts'
