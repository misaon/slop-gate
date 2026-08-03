import { createHash } from 'node:crypto'
import { compareStrings } from '../ordering.ts'

/**
 * The shape of a cached `Diagnostic`, not of the cache key. A stale entry is discarded rather than
 * migrated, so this has to change whenever a field of `Diagnostic` is added, removed or **renamed** — a
 * renamed field reads back as `undefined`, and a warm run would then quietly lose whatever depends on it
 * rather than recompute.
 */
export const RESULT_SCHEMA_VERSION = 2

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

export function hashRuleSelection(ruleRefKeys: Iterable<string>): string {
  return hashJson([...ruleRefKeys].sort(compareStrings))
}

export type ResultKeyInput = {
  engineId: string
  engineVersion: string
  engineRulesetHash: string
  /** Repo-relative, POSIX. Without it two byte-identical files share one entry, even though the cached
   *  `Diagnostic[]` bakes in a path-dependent `file`, `fingerprint` and `severity` — whichever file is
   *  processed last silently overwrites the other's result. */
  filePath: string
  fileHash: string
  configHash: string
}

export function deriveResultKey(input: ResultKeyInput): string {
  // `input` is nested, not spread, so a future `ResultKeyInput` field named `schema` cannot shadow this.
  return hashJson({ schema: RESULT_SCHEMA_VERSION, input })
}

/**
 * Cache key components for a **project-granularity** engine (spec §8.1: `tsc`, `knip` — whole-program
 * analysis, not cacheable per file). With no single file to key against, this folds in every file the
 * planner assigned it, each with its own hash — spec §9's "aggregate input hash". Sorting by path first
 * (see `deriveProjectResultKey`) makes the key independent of the inventory's own file ordering.
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
