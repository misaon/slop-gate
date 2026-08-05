import type { ConceptId } from '../concepts/catalogue.ts'
import type { RuleLevel } from '../config/types.ts'
import type { FileInventory } from '../discovery/types.ts'
import type { EngineId } from '../registry/types.ts'

export type FrameworkId =
  | 'angular'
  | 'chai'
  | 'firebase-functions'
  | 'mikro-orm'
  | 'nestjs'
  | 'nestjs-express'
  | 'nextjs'
  | 'nuxt'
  | 'react-jsx-transform'
  | 'test-framework'
  | 'vitepress'

export type DependencyField = 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies'

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

export type EnabledLevel = Exclude<RuleLevel, 'off'>

export type FrameworkMeasurement = {
  readonly repository: string
  readonly findings: number
  readonly falsePositives: number
}

type PathScope = { readonly paths?: readonly string[] }

export type FrameworkAdjustment =
  | ({ readonly kind: 'disable-concept'; readonly concept: ConceptId; readonly reason: string } & PathScope)
  | ({
      readonly kind: 'enable-concept'
      readonly concept: ConceptId
      readonly level: EnabledLevel
      readonly reason: string
      readonly measured: FrameworkMeasurement
    } & PathScope)
  | {
      readonly kind: 'engine-setting'
      readonly engine: EngineId
      readonly key: string
      readonly workspace: string
      readonly values: readonly string[]
      readonly reason: string
    }

type ManifestDependency = { readonly name: string; readonly field: DependencyField }

export type Manifest = {
  readonly file: string
  readonly workspace: string
  readonly dependencies: readonly ManifestDependency[]
}

export type DetectionContext = {
  readonly inventory: FileInventory
  readonly manifests: readonly Manifest[]
  readText(path: string): Promise<string | null>
}

type Detected<P> = { readonly evidence: readonly FrameworkEvidence[]; readonly parameters: P }

type DetectOutcome<P> = Detected<P> | { readonly blocked: string; readonly evidence: readonly FrameworkEvidence[] } | null

export type FrameworkProfile<P> = {
  readonly id: FrameworkId
  readonly summary: string
  detect(context: DetectionContext): Promise<DetectOutcome<P>>
  consequences(parameters: P): readonly FrameworkAdjustment[]
}

export type AnyFrameworkProfile = {
  readonly id: FrameworkId
  readonly summary: string
  evaluate(context: DetectionContext): Promise<FrameworkApplication | InapplicableFramework | null>
}

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
  readonly rejected: readonly RejectedAdjustment[]
}

export type InapplicableFramework = {
  readonly id: FrameworkId
  readonly summary: string
  readonly evidence: readonly FrameworkEvidence[]
  readonly blocked: string
}

export type FrameworkDetection = {
  readonly applied: readonly FrameworkApplication[]
  readonly inapplicable: readonly InapplicableFramework[]
}

export type EngineSetting = {
  readonly key: string
  readonly workspace: string
  readonly values: readonly string[]
}

export type EngineSettings = readonly EngineSetting[]

export function isApplied(
  outcome: FrameworkApplication | InapplicableFramework,
): outcome is FrameworkApplication {
  return 'adjustments' in outcome
}
