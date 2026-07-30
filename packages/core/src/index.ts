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
