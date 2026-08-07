import type { ConceptGroup } from '../concepts/catalogue.ts'

// What a finding costs if real, never how likely it is to be real — that is `reliability.ts`, and
// conflating them is how a rule that is wrong 94% of the time becomes "less severe" instead of off.
export type Impact = 1 | 2 | 3

export type ImpactDefinition = {
  readonly label: string
  readonly test: string
}

export const IMPACTS: Readonly<Record<Impact, ImpactDefinition>> = {
  3: {
    label: 'broken or unsafe',
    test: 'It does not work, or it is a security or data-loss risk, now. It does not compile, does not resolve, or hands someone your credentials.',
  },
  2: {
    label: 'will bite',
    test: 'It is a real defect with a plausible path to failing — wrong behaviour under some input, a test that cannot fail, a dependency with a published advisory.',
  },
  1: {
    label: 'untidy',
    test: 'No path to failure. A reader or an agent should still fix it, and nothing breaks if they do not.',
  },
}

// The default for a group; the exceptions below are where the group predicts badly.
export const GROUP_IMPACT: Readonly<Record<ConceptGroup, Impact>> = {
  security: 3,
  types: 3,
  correctness: 2,
  deps: 2,
  slop: 2,
  a11y: 2,
  framework: 2,
  duplication: 1,
  'dead-code': 1,
  suspicious: 1,
  config: 1,
  pedantic: 1,
  restriction: 1,
  style: 1,
  perf: 1,
  complexity: 1,
  formatting: 1,
  nursery: 1,
}

// Only concepts their group is wrong about. An exception with no stated reason does not belong here.
const CONCEPT_IMPACT: Readonly<Record<string, Impact>> = {
  // The file did not parse, so nothing else about it was checked.
  'correctness.parse-error': 3,
  // The import does not resolve: it throws the moment that line runs.
  'deps.unresolved-import': 3,
  // A redundant backslash in a regex is a typo, not a defect — the pattern still matches.
  'correctness.no-useless-escape': 1,
  // An expression whose value is discarded is usually a call someone forgot to `await` or assign.
  'dead-code.no-op-expression': 2,
  // A missing key makes React reuse the wrong DOM node, which shows up as state on the wrong row.
  'correctness.jsx-key': 2,
  // A stub returning a hard-coded value behind a real signature is the failure this tool is named for.
  'slop.stub-implementation': 2,
  // A comment narrating the code beneath it is noise, not a defect.
  'slop.narrative-comment': 1,
  // The check itself did not run, so the verdict is incomplete rather than wrong.
  'deps.advisory-coverage-gap': 2,
}

export function impactOf(concept: string, group: ConceptGroup): Impact {
  return CONCEPT_IMPACT[concept] ?? GROUP_IMPACT[group]
}
