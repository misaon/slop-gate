import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Diagnostic } from '../diagnostics/types.ts'
import { compareStrings } from '../ordering.ts'
import { writeFileAtomic } from './atomic-write.ts'
import { RESULT_SCHEMA_VERSION, type ProjectResultKeyInput, type ResultKeyInput } from './keys.ts'

export type ResultStore = {
  get(engineId: string, key: string): Promise<Diagnostic[] | null>
  set(engineId: string, key: string, diagnostics: readonly Diagnostic[], components: ResultKeyInput): Promise<void>
  persist(): Promise<void>
}

type StoredEntry<Key> = { key: Key; diagnostics: Diagnostic[] }

type EngineCacheFile<Key> = { schema: number; entries: Record<string, StoredEntry<Key>> }

export function openResultStore(cacheDir: string): ResultStore {
  return openPackedStore<ResultKeyInput>(cacheDir)
}

export type ProjectResultStore = {
  get(engineId: string, key: string): Promise<Diagnostic[] | null>
  set(engineId: string, key: string, diagnostics: readonly Diagnostic[], components: ProjectResultKeyInput): Promise<void>
  persist(): Promise<void>
}

export function openProjectResultStore(cacheDir: string): ProjectResultStore {
  return openPackedStore<ProjectResultKeyInput>(cacheDir, 'project')
}

function openPackedStore<Key>(cacheDir: string, subdirectory?: string): {
  get(engineId: string, key: string): Promise<Diagnostic[] | null>
  set(engineId: string, key: string, diagnostics: readonly Diagnostic[], components: Key): Promise<void>
  persist(): Promise<void>
} {
  const loading = new Map<string, Promise<Map<string, StoredEntry<Key>>>>()
  const dirty = new Set<string>()

  const pathFor = (engineId: string): string =>
    subdirectory === undefined
      ? join(cacheDir, 'results', `${engineId}.json`)
      : join(cacheDir, 'results', subdirectory, `${engineId}.json`)

  const entriesFor = (engineId: string): Promise<Map<string, StoredEntry<Key>>> => {
    const existing = loading.get(engineId)
    if (existing !== undefined) return existing

    const started = readEngineCache<Key>(pathFor(engineId))
    loading.set(engineId, started)
    return started
  }

  return {
    async get(engineId, key) {
      return (await entriesFor(engineId)).get(key)?.diagnostics ?? null
    },

    async set(engineId, key, diagnostics, components) {
      ;(await entriesFor(engineId)).set(key, { key: components, diagnostics: [...diagnostics] })
      dirty.add(engineId)
    },

    async persist() {
      for (const engineId of [...dirty].sort(compareStrings)) {
        const entries = await entriesFor(engineId)
        const sorted = [...entries.entries()].sort(([a], [b]) => compareStrings(a, b))
        const file: EngineCacheFile<Key> = { schema: RESULT_SCHEMA_VERSION, entries: Object.fromEntries(sorted) }
        await writeFileAtomic(pathFor(engineId), JSON.stringify(file))
      }
      dirty.clear()
    },
  }
}

async function readEngineCache<Key>(path: string): Promise<Map<string, StoredEntry<Key>>> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as EngineCacheFile<Key>
    if (parsed.schema !== RESULT_SCHEMA_VERSION || typeof parsed.entries !== 'object' || parsed.entries === null) {
      return new Map()
    }
    return new Map(
      Object.entries(parsed.entries).filter(([, entry]) => Array.isArray(entry?.diagnostics)),
    )
  } catch {
    return new Map()
  }
}
