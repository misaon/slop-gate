import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FileInventory, InventoryFile } from '../discovery/types.ts'
import { compareStrings } from '../ordering.ts'
import { toPosix } from '../paths.ts'
import type {
  AnyFrameworkProfile,
  DependencyField,
  DetectionContext,
  FrameworkAdjustment,
  FrameworkApplication,
  FrameworkDetection,
  FrameworkEvidence,
  FrameworkProfile,
  InapplicableFramework,
  Manifest,
  RejectedAdjustment,
} from './types.ts'
import { isApplied } from './types.ts'
import { refuseEnable } from './warrant.ts'

const MANIFEST = 'package.json'

const DEPENDENCY_FIELDS: readonly DependencyField[] = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

export const EMPTY_DETECTION: FrameworkDetection = { applied: [], inapplicable: [] }

export function defineProfile<P>(profile: FrameworkProfile<P>): AnyFrameworkProfile {
  return {
    id: profile.id,
    summary: profile.summary,
    async evaluate(context) {
      const outcome = await profile.detect(context)
      if (outcome === null) return null
      if ('blocked' in outcome) {
        return { id: profile.id, summary: profile.summary, evidence: outcome.evidence, blocked: outcome.blocked }
      }

      const adjustments: FrameworkAdjustment[] = []
      const rejected: RejectedAdjustment[] = []
      for (const adjustment of profile.consequences(outcome.parameters)) {
        const refusal = adjustment.kind === 'enable-concept' ? refuseEnable(adjustment, outcome.evidence) : null
        if (refusal === null) adjustments.push(adjustment)
        else if (adjustment.kind === 'enable-concept') {
          rejected.push({ concept: adjustment.concept, level: adjustment.level, refusal })
        }
      }
      rejected.sort((a, b) => compareStrings(a.concept, b.concept))

      return { id: profile.id, summary: profile.summary, evidence: outcome.evidence, adjustments, rejected }
    },
  }
}

function parseManifest(path: string, workspace: string, source: string): Manifest | null {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(source) as Record<string, unknown>
  } catch {
    return null
  }

  const dependencies: Array<{ name: string; field: DependencyField }> = []
  for (const field of DEPENDENCY_FIELDS) {
    const section = parsed[field]
    if (typeof section !== 'object' || section === null) continue
    for (const name of Object.keys(section).sort(compareStrings)) dependencies.push({ name, field })
  }
  return { file: path, workspace, dependencies }
}

async function buildDetectionContext(
  inventory: FileInventory,
  readText?: (path: string) => Promise<string | null>,
): Promise<DetectionContext> {
  const read =
    readText ??
    (async (path: string) => readFile(join(inventory.root, path), 'utf8').catch(() => null))

  const manifestFiles = inventory.files.filter((file) => {
    const path = toPosix(file.path)
    return path === MANIFEST || path.endsWith(`/${MANIFEST}`)
  })

  const parsed = await Promise.all(
    manifestFiles.map(async (file) => {
      const path = toPosix(file.path)
      const source = await read(path)
      if (source === null) return null
      const slash = path.lastIndexOf('/')
      return parseManifest(path, slash === -1 ? '' : path.slice(0, slash), source)
    }),
  )

  return { inventory, manifests: parsed.filter((m): m is Manifest => m !== null), readText: read }
}

export type DetectFrameworksOptions = {
  readonly inventory: FileInventory
  readText?: (path: string) => Promise<string | null>
  /** Passed in, never defaulted here: `profiles.ts` is built out of this module's helpers, so reading it back would be a cycle. */
  readonly profiles: readonly AnyFrameworkProfile[]
}

export async function detectFrameworks(options: DetectFrameworksOptions): Promise<FrameworkDetection> {
  const { profiles } = options
  if (profiles.length === 0) return EMPTY_DETECTION

  const context = await buildDetectionContext(options.inventory, options.readText)
  const outcomes = (await Promise.all(profiles.map(async (profile) => profile.evaluate(context)))).filter(
    (outcome): outcome is FrameworkApplication | InapplicableFramework => outcome !== null,
  )
  outcomes.sort((a, b) => compareStrings(a.id, b.id))

  return {
    applied: outcomes.filter((outcome): outcome is FrameworkApplication => isApplied(outcome)),
    inapplicable: outcomes.filter((outcome): outcome is InapplicableFramework => !isApplied(outcome)),
  }
}

export function dependencyEvidence(context: DetectionContext, names: readonly string[]): FrameworkEvidence | null {
  const wanted = new Set(names)
  for (const manifest of context.manifests) {
    for (const dependency of manifest.dependencies) {
      if (!wanted.has(dependency.name)) continue
      return {
        kind: 'manifest-dependency',
        file: manifest.file,
        workspace: manifest.workspace,
        name: dependency.name,
        field: dependency.field,
      }
    }
  }
  return null
}

export function inventoryFilesMatching(
  context: DetectionContext,
  predicate: (path: string) => boolean,
): readonly InventoryFile[] {
  return context.inventory.files.filter((file) => predicate(toPosix(file.path)))
}

export function relativeToWorkspace(path: string, workspace: string): string {
  return workspace === '' ? path : path.slice(workspace.length + 1)
}
