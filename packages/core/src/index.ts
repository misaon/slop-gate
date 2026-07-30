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
