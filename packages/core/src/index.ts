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
export { fingerprint, type FingerprintInput } from './diagnostics/fingerprint.ts'

export {
  CONCEPTS,
  CONCEPT_GROUPS,
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
  type ElectionInput,
  type ElectionResult,
  type SuppressionReason,
  type SuppressionRecord,
} from './registry/elect.ts'
export { filterOwned, isOwned, type OwnershipCandidate } from './registry/ownership.ts'

export {
  isRuleLevel,
  splitRuleSetting,
  type EngineOptions,
  type EngineRuleKey,
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

export { ConfigError, EngineError } from './errors.ts'
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
export { detectLanguage } from './discovery/language.ts'
export {
  buildWorkspaceGraph,
  relativePosix,
  type WorkspaceGraph,
  type WorkspaceNode,
} from './discovery/workspaces.ts'
