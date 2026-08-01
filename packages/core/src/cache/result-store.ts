import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Diagnostic } from '../diagnostics/types.ts'
import { writeFileAtomic } from './atomic-write.ts'
import { RESULT_SCHEMA_VERSION, type ProjectResultKeyInput, type ResultKeyInput } from './keys.ts'

export type ResultStore = {
  get(key: string): Promise<Diagnostic[] | null>
  set(key: string, diagnostics: readonly Diagnostic[], components: ResultKeyInput): Promise<void>
}

/** `key` records what produced this entry, so a surprising cache hit can be explained. */
type StoredResult<Key> = { schema: number; key: Key; diagnostics: Diagnostic[] }

async function readStored<Key>(path: string): Promise<Diagnostic[] | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as StoredResult<Key>
    if (parsed.schema !== RESULT_SCHEMA_VERSION || !Array.isArray(parsed.diagnostics)) return null
    return parsed.diagnostics
  } catch {
    return null
  }
}

async function writeStored<Key>(path: string, diagnostics: readonly Diagnostic[], key: Key): Promise<void> {
  const payload: StoredResult<Key> = { schema: RESULT_SCHEMA_VERSION, key, diagnostics: [...diagnostics] }
  await writeFileAtomic(path, JSON.stringify(payload))
}

export function openResultStore(cacheDir: string): ResultStore {
  const pathFor = (key: string): string => join(cacheDir, 'results', key.slice(0, 2), `${key}.json`)

  return {
    get: (key) => readStored(pathFor(key)),
    set: (key, diagnostics, components) => writeStored(pathFor(key), diagnostics, components),
  }
}

/**
 * The project-granularity counterpart to `ResultStore` (spec §8.1/§9: `tsc`, `knip` — whole-program
 * results, cacheable only per workspace against an aggregate input hash, never per file). Same
 * on-disk shape and schema versioning as `ResultStore`, just laid out as spec §9 describes:
 * `results/project/<engineId>/<aggregateHash>.json`, one entry per engine rather than sharded by key
 * prefix — a project engine has far fewer cache entries than a file engine has files, so the sharding
 * that keeps `ResultStore`'s directories small has nothing to earn its keep here.
 */
export type ProjectResultStore = {
  get(engineId: string, key: string): Promise<Diagnostic[] | null>
  set(engineId: string, key: string, diagnostics: readonly Diagnostic[], components: ProjectResultKeyInput): Promise<void>
}

export function openProjectResultStore(cacheDir: string): ProjectResultStore {
  const pathFor = (engineId: string, key: string): string => join(cacheDir, 'results', 'project', engineId, `${key}.json`)

  return {
    get: (engineId, key) => readStored(pathFor(engineId, key)),
    set: (engineId, key, diagnostics, components) => writeStored(pathFor(engineId, key), diagnostics, components),
  }
}
