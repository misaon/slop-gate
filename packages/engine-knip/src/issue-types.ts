import { compareStrings } from '@misaon/slop-gate-core'

export const KNIP_ISSUE_TYPES = [
  'files',
  'dependencies',
  'devDependencies',
  'optionalPeerDependencies',
  'unlisted',
  'binaries',
  'unresolved',
  'exports',
  'nsExports',
  'types',
  'nsTypes',
  'enumMembers',
  'namespaceMembers',
  'duplicates',
  'catalog',
  'catalogReferences',
  'cycles',
] as const

export type KnipIssueType = (typeof KNIP_ISSUE_TYPES)[number]

export type KnipIssueTypeExclusion = {
  readonly reason: string
}

export const KNIP_EXCLUDED_ISSUE_TYPES: Readonly<Record<string, KnipIssueTypeExclusion>> = {
  nsExports: {
    reason:
      "knip splits 'unused export' into `exports` and `nsExports` precisely because the second is " +
      'the weaker signal: an export only reachable through a namespace import (`import * as x`) ' +
      'cannot be proven unused, since knip cannot see which members the namespace holder actually ' +
      'touches. Surfacing the bucket knip itself labels lower-confidence, on top of an `exports` ' +
      'measurement only one finding deep (see the knip block in entries.uncatalogued.ts), would ship a ' +
      'category with no evidence behind it and a false-positive mode built into its definition.',
  },
  nsTypes: {
    reason:
      'Same reachability caveat as `nsExports` immediately above, applied to exported types rather ' +
      'than values — knip separates it for the identical reason, and the identical argument applies: ' +
      'a member reached only through a namespace import is not demonstrably unused, it is merely ' +
      'not individually traceable.',
  },
  namespaceMembers: {
    reason:
      'The same weak-reachability shape one level deeper (a member of an exported TypeScript ' +
      '`namespace` declaration), plus a measurement: zero occurrences across both repositories this ' +
      'adapter was validated against, because `namespace` is essentially absent from the ESM ' +
      'codebases M2 targets. A category that never fires cannot have its accuracy measured, and ' +
      'shipping an unmeasured one is exactly what `no-implied-eval` is recorded in the M0 follow-ups ' +
      'for having almost done.',
  },
  cycles: {
    reason:
      'A circular dependency is neither dead code nor dependency hygiene — it belongs to no concept ' +
      'group the catalogue currently has (spec §5.1), and inventing one is a taxonomy decision that ' +
      'should be made deliberately rather than as a side effect of enumerating knip output. knip ' +
      'itself keeps `cycles` off by default for the same reason it is separate: it answers a ' +
      'different question than the rest of the report.',
  },
  catalog: {
    reason:
      "pnpm's `catalog:` protocol. Neither repository this adapter was measured against uses " +
      'catalogs, so there is no evidence for a severity, a false-positive rate, or even that the ' +
      'category fires at all here. Mapping it blind would claim coverage this adapter has never ' +
      'once seen produce a finding.',
  },
  catalogReferences: {
    reason:
      'Same as `catalog` immediately above: the other half of pnpm catalog support, unmeasured for ' +
      'exactly the same reason, and excluded rather than guessed at so the pair is turned on ' +
      'together once a catalog-using repository is actually available to measure.',
  },
  optionalPeerDependencies: {
    reason:
      "knip's own title for this type is 'Referenced optional peerDependencies' — it reports that a " +
      'referenced optional peer *exists*, which is information about the dependency graph, not a ' +
      'defect in it. There is no edit a user would make in response, so there is no diagnostic to ' +
      'emit; a warning nobody can act on is worse than silence.',
  },
}

export const KNIP_SURFACED_ISSUE_TYPES: readonly KnipIssueType[] = KNIP_ISSUE_TYPES.filter(
  (type) => !Object.hasOwn(KNIP_EXCLUDED_ISSUE_TYPES, type),
).sort(compareStrings)

const SURFACED = new Set<string>(KNIP_SURFACED_ISSUE_TYPES)

export function isSurfacedIssueType(value: string): value is KnipIssueType {
  return SURFACED.has(value)
}
