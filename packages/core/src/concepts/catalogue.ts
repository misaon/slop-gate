export const CONCEPT_GROUPS = [
  'correctness',
  'types',
  'dead-code',
  'formatting',
  'style',
  'complexity',
  'duplication',
  'security',
  'perf',
  'a11y',
  'framework',
  'config',
  'deps',
  'slop',
] as const

export type ConceptGroup = (typeof CONCEPT_GROUPS)[number]

export type ConceptDefinition = {
  readonly id: string
  readonly group: ConceptGroup
  readonly title: string
  readonly description: string
  readonly deprecated?: { readonly since: string; readonly replacedBy?: string }
  /**
   * True for a concept the orchestrator emits itself (packages/core/src/run/check.ts) rather than
   * any engine rule — e.g. `config.rule-overlap`. No `RuleEntry` will ever claim one of these, so
   * election must not count that against the repository's coverage.
   */
  readonly servicedBySlopGate?: boolean
}

export const CONCEPTS = [
  {
    id: 'correctness.no-debugger',
    group: 'correctness',
    title: 'Debugger statement',
    description: 'A `debugger` statement halts execution wherever it is reached.',
  },
  {
    id: 'correctness.no-duplicate-object-key',
    group: 'correctness',
    title: 'Duplicate object key',
    description: 'A repeated key silently discards the earlier value.',
  },
  {
    id: 'correctness.no-constant-condition',
    group: 'correctness',
    title: 'Constant condition',
    description: 'A condition that cannot vary makes one branch unreachable.',
  },
  {
    id: 'correctness.parse-error',
    group: 'correctness',
    title: 'Parse error',
    description:
      'The file has a syntax error and could not be parsed, so no engine could analyse it at all. ' +
      'Unlike every other concept, this has no owning rule: any engine capable of parsing the ' +
      "language may report it, attributed via a synthetic per-engine rule id (oxlint's is `parse-error`).",
  },
  {
    id: 'dead-code.unused-import',
    group: 'dead-code',
    title: 'Unused import',
    description: 'An imported binding that is never referenced.',
  },
  {
    id: 'dead-code.unused-variable',
    group: 'dead-code',
    title: 'Unused variable',
    description: 'A declared binding that is never read.',
  },
  {
    id: 'style.no-var',
    group: 'style',
    title: 'Use of var',
    description: '`var` is function-scoped and hoisted; prefer `const` or `let`.',
  },
  {
    id: 'slop.as-any-cast',
    group: 'slop',
    title: 'Explicit any',
    description:
      'An explicit `any` — whether an annotation or an `as any` cast — opts out of the type system. ' +
      'M0 detects it syntactically; the narrower `as unknown as T` pattern needs type information and arrives with the type-aware engine in M2.',
  },
  {
    id: 'config.unused-suppression',
    group: 'config',
    title: 'Unused suppression',
    description: 'A suppression comment that matches no diagnostic, left behind after a fix.',
    servicedBySlopGate: true,
  },
  {
    id: 'config.rule-overlap',
    group: 'config',
    title: 'Overlapping rules',
    description: 'Two enabled rules detect the same concept; one was suppressed by arbitration.',
    servicedBySlopGate: true,
  },
  {
    id: 'config.dead-override',
    group: 'config',
    title: 'Dead override',
    description: 'An override targeting a rule or concept that no enabled engine covers.',
    servicedBySlopGate: true,
  },
] as const satisfies readonly ConceptDefinition[]

export type ConceptId = (typeof CONCEPTS)[number]['id']

const byId = new Map<string, ConceptDefinition>(CONCEPTS.map((c) => [c.id, c]))

export function isConceptId(value: string): value is ConceptId {
  return byId.has(value)
}

export function conceptById(id: ConceptId): ConceptDefinition {
  const found = byId.get(id)
  if (!found) throw new Error(`unknown concept: ${id}`)
  return found
}

// `CONCEPTS` is deliberately `as const satisfies readonly ConceptDefinition[]` so each concept
// keeps its narrow literal type (see `RULE_ENTRIES` for the same pattern). A concept that omits
// `servicedBySlopGate` doesn't structurally have that key at all, so reading it needs the widened
// `ConceptDefinition` view rather than `CONCEPTS` directly.
const WIDENED_CONCEPTS: readonly ConceptDefinition[] = CONCEPTS

/** Concepts the orchestrator services itself — see `ConceptDefinition.servicedBySlopGate`. */
export const SLOP_GATE_SERVICED_CONCEPTS: ReadonlySet<string> = new Set(
  WIDENED_CONCEPTS.filter((c) => c.servicedBySlopGate).map((c) => c.id),
)
