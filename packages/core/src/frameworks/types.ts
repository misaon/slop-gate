import type { ConceptId } from '../concepts/catalogue.ts'
import type { FileInventory } from '../discovery/types.ts'
import type { EngineId } from '../registry/types.ts'

export type FrameworkId =
  | 'angular'
  | 'mikro-orm'
  | 'nestjs'
  | 'nestjs-express'
  | 'react-jsx-transform'
  | 'test-framework'
  | 'vitepress'

export type DependencyField = 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies'

/**
 * Why a framework was considered present, always naming the file it was read from. Detection returns
 * this rather than a boolean because a boolean fixes none of the measured cases (spec §23.1): it
 * cannot tell knip *where* a VitePress site is, and it cannot let `sgate rules why` say more than
 * "off, because reasons".
 */
export type FrameworkEvidence =
  | {
      readonly kind: 'manifest-dependency'
      readonly file: string
      readonly workspace: string
      readonly name: string
      readonly field: DependencyField
    }
  | { readonly kind: 'path-present'; readonly file: string }
  | { readonly kind: 'config-literal'; readonly file: string; readonly property: string; readonly value: string }

/**
 * A framework's consequence for one of the two consumers. Both shapes are **set contributions** — a
 * concept removed, or values added to a named list — and there is deliberately no shape that assigns
 * a value to a key. That is what makes merging a sorted union and framework conflicts inexpressible
 * rather than resolvable; see spec §23.3, and read it before adding a third variant.
 */
export type FrameworkAdjustment =
  | { readonly kind: 'disable-concept'; readonly concept: ConceptId; readonly reason: string }
  | {
      readonly kind: 'engine-setting'
      readonly engine: EngineId
      /** Engine-specific, uninterpreted by core — the same arrangement as `RuleEntry.engineRuleId`. */
      readonly key: string
      /** Repo-relative POSIX workspace directory the setting is scoped to; `''` for the whole config. */
      readonly workspace: string
      readonly values: readonly string[]
      readonly reason: string
    }

export type ManifestDependency = { readonly name: string; readonly field: DependencyField }

export type Manifest = {
  /** Repo-relative POSIX path of the `package.json` itself. */
  readonly file: string
  /** Repo-relative POSIX directory it declares; `''` for the repository root. */
  readonly workspace: string
  /** Sorted by `(field, name)`, so evidence never depends on `Object.keys` order. */
  readonly dependencies: readonly ManifestDependency[]
}

export type DetectionContext = {
  readonly inventory: FileInventory
  /** Every `package.json` the inventory listed, parsed once, in `compareStrings` path order. */
  readonly manifests: readonly Manifest[]
  /** Reads one repo-relative file; `null` when it is missing or unreadable. */
  readText(path: string): Promise<string | null>
}

/** What `detect` hands `consequences`: the parameters, plus the evidence that produced them. */
type Detected<P> = { readonly evidence: readonly FrameworkEvidence[]; readonly parameters: P }

/**
 * `null` means "this framework is not here", which is recorded nowhere — a repository without NestJS
 * should not carry a note saying so. `blocked` means "it is here, but a parameter could not be
 * resolved", which *is* recorded, because the user sees the status-quo false positive and deserves to
 * be told why the profile that would have fixed it stood down (spec §23.1).
 */
type DetectOutcome<P> = Detected<P> | { readonly blocked: string; readonly evidence: readonly FrameworkEvidence[] } | null

export type FrameworkProfile<P> = {
  readonly id: FrameworkId
  /** One line, present tense, rendered by `sgate rules why` above the per-adjustment reasons. */
  readonly summary: string
  detect(context: DetectionContext): Promise<DetectOutcome<P>>
  /** Pure over the detected parameters: no filesystem, no config, no clock. */
  consequences(parameters: P): readonly FrameworkAdjustment[]
}

/** A profile with its parameter type erased, so profiles of different shapes share one list. */
export type AnyFrameworkProfile = {
  readonly id: FrameworkId
  readonly summary: string
  evaluate(context: DetectionContext): Promise<FrameworkApplication | InapplicableFramework | null>
}

export type FrameworkApplication = {
  readonly id: FrameworkId
  readonly summary: string
  readonly evidence: readonly FrameworkEvidence[]
  readonly adjustments: readonly FrameworkAdjustment[]
}

export type InapplicableFramework = {
  readonly id: FrameworkId
  readonly summary: string
  readonly evidence: readonly FrameworkEvidence[]
  /** The unresolvable parameter, phrased for a human and naming what would fix it. */
  readonly blocked: string
}

export type FrameworkDetection = {
  /** Sorted by `id`. */
  readonly applied: readonly FrameworkApplication[]
  /** Sorted by `id`. Detected, but stood down for want of a parameter. */
  readonly inapplicable: readonly InapplicableFramework[]
}

/** One engine setting after every contributing profile has been merged. */
export type EngineSetting = {
  readonly key: string
  readonly workspace: string
  /** The sorted union of every contribution to this `(workspace, key)`. */
  readonly values: readonly string[]
}

/** Sorted by `(workspace, key)`. What an engine adapter receives on its `RunContext`. */
export type EngineAdjustments = readonly EngineSetting[]

export function isApplied(
  outcome: FrameworkApplication | InapplicableFramework,
): outcome is FrameworkApplication {
  return 'adjustments' in outcome
}
