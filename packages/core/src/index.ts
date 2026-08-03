export const CORE_VERSION = '0.0.0'

export type {
  ByteRange,
  Diagnostic,
  Edit,
  Fix,
  FixKind,
  Position,
  RelatedLocation,
  Severity,
} from './diagnostics/types.ts'
export { createLineIndex, type LineIndex } from './diagnostics/position.ts'
export { fingerprint, normalizedWindow, type FingerprintInput } from './diagnostics/fingerprint.ts'

export {
  CONCEPTS,
  CONCEPT_GROUPS,
  GENERATED_CONCEPT_IDS,
  conceptById,
  isConceptId,
  type ConceptDefinition,
  type ConceptGroup,
  type ConceptId,
} from './concepts/catalogue.ts'
export { validateCatalogue } from './concepts/validate.ts'

export { LANGUAGES, SCRIPT_LANGUAGES, type LanguageId } from './languages.ts'
export { compareStrings } from './ordering.ts'
export {
  ENGINE_PREFERENCE,
  ruleRefKey,
  type Capability,
  type ClassifyRule,
  type EngineId,
  type EngineTier,
  type FixDomain,
  type RuleEntry,
  type RuleRef,
} from './registry/types.ts'
export { RULE_ENTRIES } from './registry/entries.ts'
export {
  electOwners,
  type ConceptOwnership,
  type DisplacedOwner,
  type ElectionInput,
  type ElectionResult,
  type IneligibilityReason,
  type IneligibleCandidate,
  type SuppressionReason,
  type SuppressionRecord,
} from './registry/elect.ts'
export { filterOwned, isOwned, owningEngines, type OwnerMap, type OwnershipCandidate } from './registry/ownership.ts'

export {
  isRuleLevel,
  splitRuleSetting,
  type EngineOptions,
  type EngineRuleKey,
  type GeneratedPolicy,
  type OverrideBlock,
  type PresetName,
  type RuleKey,
  type RuleLevel,
  type RuleMap,
  type RuleOptions,
  type RuleSetting,
  type SlopGateConfig,
} from './config/types.ts'
export { defineConfig } from './config/define.ts'
export { PRESETS } from './config/presets.ts'
export { OPTIONED_RECOMMENDED_RULES, type OptionedRule } from './config/rule-options.ts'

export { ConfigError, EngineError } from './errors.ts'
export { resolveScriptBin, type ResolveScriptBinOptions, type ScriptBinInvocation } from './exec/resolve-script-bin.ts'
export { findConfigFile, loadConfig } from './config/load.ts'

export {
  createRuleSetResolver,
  type ProvenanceLayer,
  type ProvenanceStep,
  type ResolveInput,
  type ResolvedRuleSet,
  type RuleResolution,
  type RuleSetResolver,
} from './config/resolve.ts'

export type { FileInventory, InventoryFile } from './discovery/types.ts'
export { isGeneratedPath } from './discovery/generated.ts'
export { detectLanguage } from './discovery/language.ts'
export {
  buildWorkspaceGraph,
  relativePosix,
  type WorkspaceGraph,
  type WorkspaceNode,
} from './discovery/workspaces.ts'

export {
  buildInventory,
  createGitFileSource,
  createWalkFileSource,
  selectFileSource,
  type BuildInventoryOptions,
  type FileSource,
} from './discovery/inventory.ts'

export { toPosix } from './paths.ts'

// --- Framework awareness (spec §23): one detection pass, two consumers ---------------------------
export {
  engineAdjustmentsFor,
  frameworkOverrideLayers,
  frameworkRuleLayers,
  settingValues,
  settingValuesFor,
  type FrameworkOverrideLayer,
  type FrameworkRuleLayer,
} from './frameworks/adjustments.ts'
export {
  EMPTY_DETECTION,
  buildDetectionContext,
  defineProfile,
  detectFrameworks,
  findDependency,
  findFiles,
  relativeToWorkspace,
  type DetectFrameworksOptions,
} from './frameworks/detect.ts'
export { extractStringLiteral } from './frameworks/literal.ts'
export { FRAMEWORK_PROFILES, dualFiringConcepts } from './frameworks/profiles.ts'
export { refuseEnable } from './frameworks/warrant.ts'
export type {
  AnyFrameworkProfile,
  DependencyField,
  DetectionContext,
  EnabledLevel,
  EngineAdjustments,
  EngineSetting,
  FrameworkAdjustment,
  FrameworkApplication,
  FrameworkDetection,
  FrameworkEvidence,
  FrameworkId,
  FrameworkMeasurement,
  FrameworkProfile,
  InapplicableFramework,
  Manifest,
  ManifestDependency,
  RejectedAdjustment,
} from './frameworks/types.ts'

export {
  RESULT_SCHEMA_VERSION,
  deriveProjectResultKey,
  deriveResultKey,
  hashContent,
  hashJson,
  hashRuleSelection,
  stableStringify,
  type ProjectResultKeyInput,
  type ResultKeyInput,
} from './cache/keys.ts'
export { openStatIndex, type StatIndex } from './cache/stat-index.ts'
export { openProjectResultStore, openResultStore, type ProjectResultStore, type ResultStore } from './cache/result-store.ts'

export type {
  DerivedFix,
  Engine,
  EngineAvailability,
  EngineCapabilities,
  EngineConfigHandle,
  EngineRuleOptions,
  EngineRuleSelection,
  FileBatch,
  FixTarget,
  RawDiagnostic,
  RawFix,
  RawSeverity,
  RunContext,
} from './engine/types.ts'
export { LEVEL_TO_SEVERITY, normalizeDiagnostics, type NormalizeInput } from './engine/normalize.ts'

export { parseSuppressions, type SuppressionDirective, type SuppressionKind } from './suppressions/parse.ts'
export { applySuppressions, type ApplySuppressionsResult } from './suppressions/apply.ts'

export { buildPlan, type EngineAssignment, type PlanInput } from './planner/plan.ts'
export { runCheck, streamCheck, type CheckEvent, type CheckOptions, type CheckResult } from './run/check.ts'

// --- `sgate fix` (spec §11) ----------------------------------------------------------------------
export {
  DEFAULT_MAX_PASSES,
  runFix,
  type FixOptions,
  type FixRefusal,
  type FixResult,
  type FixedFile,
} from './run/fix.ts'
export { FIX_TIER_RANK, type ArbitrationResult, type CandidateEdit, type DropReason, type DroppedEdit, type FixTier } from './fix/types.ts'
export { arbitrateEdits, rangesConflict } from './fix/arbitrate.ts'
export { applyEdits, decodeUtf8, encodeUtf8 } from './fix/apply.ts'
export { unifiedDiff } from './fix/diff.ts'
export { editsFromRewrite } from './fix/derive.ts'
export { createOscillationLedger, type Oscillation, type OscillationLedger } from './fix/oscillation.ts'
export { inspectWorktree, type InspectWorktreeOptions, type WorktreeState } from './fix/worktree.ts'
export { writeFileAtomic, type WriteFileAtomicOptions } from './cache/atomic-write.ts'
export { resolveRun, type ResolveRunOptions, type ResolvedRun, type UnavailableEngine } from './run/resolve-run.ts'

export { LEVEL_STRENGTH } from './config/types.ts'

// --- `sgate rules` governance commands: pure data-shaping over an already-resolved run ------------
export {
  resolveEnablement,
  wasEnabledBeforeBeingDisabled,
  type ConceptEnablement,
  type OverrideMention,
} from './rules/enablement.ts'
export { explainConcept, type ConceptWhy } from './rules/why.ts'
export { buildRulesList, type RulesListEntry, type RulesListOptions } from './rules/list.ts'
export { buildRulesConflicts, type RulesConflicts } from './rules/conflicts.ts'
