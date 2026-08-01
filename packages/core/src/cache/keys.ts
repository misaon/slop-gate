import { createHash } from 'node:crypto'
import { compareStrings } from '../ordering.ts'

export const RESULT_SCHEMA_VERSION = 1

export function hashContent(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`)

  return `{${entries.join(',')}}`
}

export function hashJson(value: unknown): string {
  return hashContent(stableStringify(value))
}

export function hashRuleSelection(ruleIds: Iterable<string>): string {
  return hashJson([...ruleIds].sort(compareStrings))
}

export type ResultKeyInput = {
  engineId: string
  engineVersion: string
  engineRulesetHash: string
  /** Repo-relative, POSIX. Without it, two byte-identical files share one cache entry even though
   *  the cached `Diagnostic[]` bakes in a path-dependent `file`, `fingerprint` and (via per-file
   *  override resolution) `severity` — whichever file is processed last silently overwrites the
   *  other's cached result. */
  filePath: string
  fileHash: string
  configHash: string
}

export function deriveResultKey(input: ResultKeyInput): string {
  // `input` is nested, not spread, so a future `ResultKeyInput` field named `schema` cannot
  // silently shadow `RESULT_SCHEMA_VERSION`.
  return hashJson({ schema: RESULT_SCHEMA_VERSION, input })
}

/**
 * The cache key components for a **project-granularity** engine (spec §8.1: `tsc`, `knip` — whole-
 * program analysis, not cacheable per file). `ResultKeyInput` above is keyed by one file's path and
 * content hash; a project engine has no single file to key against, so this instead folds in every
 * file the planner assigned it, each with its own content hash — spec §9's "aggregate input hash".
 * Sorting by path before hashing (see `deriveProjectResultKey`) is what makes the result independent
 * of the inventory's own file ordering, the same concern `hashRuleSelection` exists for.
 */
export type ProjectResultKeyInput = {
  engineId: string
  engineVersion: string
  engineRulesetHash: string
  configHash: string
  files: ReadonlyArray<{ path: string; hash: string }>
}

export function deriveProjectResultKey(input: ProjectResultKeyInput): string {
  const sortedFiles = [...input.files].sort((a, b) => compareStrings(a.path, b.path))
  // Nested under its own `schema`, matching `deriveResultKey` — same reasoning, same protection.
  return hashJson({ schema: RESULT_SCHEMA_VERSION, input: { ...input, files: sortedFiles } })
}
