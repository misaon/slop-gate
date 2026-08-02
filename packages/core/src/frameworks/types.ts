import type { ConceptId } from '../concepts/catalogue.ts'
import type { RuleLevel } from '../config/types.ts'
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

/** The levels an addition may name. `off` is absent on purpose: `disable-concept` is how to say it. */
export type EnabledLevel = Exclude<RuleLevel, 'off'>

/**
 * The count behind an `enable-concept`, required by the type because a profile that turns a rule
 * *on* is asking to produce findings on code that passed yesterday, and "it seemed right" is not a
 * reason to do that to somebody's build. Spec §23.5's bar for a subtraction is a measured
 * false-positive count; this is the same bar pointed the other way, and `refuseEnable` is where the
 * arithmetic lives.
 */
export type FrameworkMeasurement = {
  /** Where the count came from, named so a reader can go and disagree with it. */
  readonly repository: string
  /** Findings the concept produced there. Zero measures nothing — see `refuseEnable`. */
  readonly findings: number
  /** How many of those were wrong. An addition at `error` requires this to be zero. */
  readonly falsePositives: number
}

/**
 * A framework's consequence for one of the two consumers.
 *
 * `disable-concept` and `engine-setting` are **set contributions** — a concept removed, or values
 * added to a named list — and neither can express a conflict (spec §23.3). `enable-concept` can:
 * two profiles may name the same concept at different levels, and a union has no meaning for a
 * scalar. It is admitted anyway, because a profile that can only subtract cannot say the one thing
 * a framework most often has to say, and it is made safe by two properties rather than by a
 * precedence table:
 *
 * - the merge is still a join, just over the level chain rather than the powerset — `off` absorbs,
 *   and otherwise the strictest wins, which is commutative, associative and idempotent exactly as
 *   the union was (`frameworkRuleLayers`);
 * - the level is a *floor*, never a ceiling: the cascade drops an addition that would lower what an
 *   earlier layer already set (`materialize`), so this variant cannot subtract by accident.
 */
export type FrameworkAdjustment =
  | { readonly kind: 'disable-concept'; readonly concept: ConceptId; readonly reason: string }
  | {
      readonly kind: 'enable-concept'
      readonly concept: ConceptId
      readonly level: EnabledLevel
      readonly reason: string
      readonly measured: FrameworkMeasurement
    }
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

/**
 * An addition this profile asked for and did not get, with the sentence `refuseEnable` refused it
 * with. Recorded rather than dropped for the reason every other near-miss in this codebase is
 * (`ignoredOverrideOptions`, `displaced`, `ineligible`): a profile author whose measurement does not
 * clear the bar has to be told which number was short, and a reader looking at a concept the profile
 * claims to cover has to be able to see that it does not.
 */
export type RejectedAdjustment = {
  readonly concept: ConceptId
  readonly level: EnabledLevel
  readonly refusal: string
}

export type FrameworkApplication = {
  readonly id: FrameworkId
  readonly summary: string
  readonly evidence: readonly FrameworkEvidence[]
  readonly adjustments: readonly FrameworkAdjustment[]
  /** Sorted by concept. Empty for every shipped profile — `profiles.test.ts` pins that. */
  readonly rejected: readonly RejectedAdjustment[]
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
