import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Diagnostic } from '../diagnostics/types.ts'
import { compareStrings } from '../ordering.ts'
import { writeFileAtomic } from './atomic-write.ts'
import { RESULT_SCHEMA_VERSION, type ProjectResultKeyInput, type ResultKeyInput } from './keys.ts'

export type ResultStore = {
  get(engineId: string, key: string): Promise<Diagnostic[] | null>
  set(engineId: string, key: string, diagnostics: readonly Diagnostic[], components: ResultKeyInput): Promise<void>
  /** Writes every engine touched this run. Nothing reaches disk until this is called. */
  persist(): Promise<void>
}

/** `key` records what produced this entry, so a surprising cache hit can be explained. */
type StoredEntry<Key> = { key: Key; diagnostics: Diagnostic[] }

/** One engine's whole cache: `resultKey` → what that key produced. */
type EngineCacheFile<Key> = { schema: number; entries: Record<string, StoredEntry<Key>> }

/**
 * One file per engine, holding every entry for it, rather than one file per (engine, file) pair.
 *
 * **The per-entry layout cost 8× its own content in disk.** Measured on this repository: 678 entries
 * averaging 512 bytes, 339 KiB of JSON, occupying **2 796 KiB** across 238 directories — because a
 * filesystem charges a 4 KiB block minimum per file and almost every entry is an eighth of one. On a
 * 2 000-file monorepo that is 3 800 entries and ~15 MB of a developer's disk, for under 2 MB of data;
 * the largest of the repositories this was measured against reached 5 310. Gitignored, but not free.
 *
 * Packed per engine it is 4–9 files, no directories, and the on-disk size is the content size.
 *
 * **Deferred to one write, and per engine rather than one file for all of them.** Engines run
 * concurrently, so a single shared file would have six writers racing and the last one landing would
 * silently discard the other five — the same failure `ToolVersionCache` defers its write to avoid. Each
 * engine owning its own file makes the race inexpressible instead of coordinated.
 *
 * The cost, stated because it is a real regression: a run that crashes now loses the whole run's cache
 * where the per-entry layout kept whatever it had already written. Accepted — a crashed run's cache is
 * worth little, and `writeFileAtomic` already makes each file all-or-nothing.
 *
 * Reads are lazy per engine and memoised: an engine the plan gave no work to costs no read at all.
 */
export function openResultStore(cacheDir: string): ResultStore {
  return openPackedStore<ResultKeyInput>(cacheDir)
}

/**
 * The project-granularity counterpart (spec §8.1/§9: `tsc`, `knip` — whole-program results, cacheable
 * only per workspace against an aggregate input hash, never per file).
 *
 * Identical storage, and now literally the same implementation: packing per engine removed the one
 * difference between the two, which used to be that this one was not sharded by key prefix because a
 * project engine has too few entries for sharding to earn anything.
 */
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
      // Sequential, not `Promise.all`: the writes are one per engine, a handful at most, and serialising
      // them keeps a partial failure from being reported as several unrelated rejections.
      for (const engineId of [...dirty].sort(compareStrings)) {
        const entries = await entriesFor(engineId)
        // Keys sorted so two runs over the same repository produce the same bytes, which is what lets a
        // test assert the cache is unchanged rather than merely equivalent.
        const sorted = [...entries.entries()].sort(([a], [b]) => compareStrings(a, b))
        const file: EngineCacheFile<Key> = { schema: RESULT_SCHEMA_VERSION, entries: Object.fromEntries(sorted) }
        await writeFileAtomic(pathFor(engineId), JSON.stringify(file))
      }
      dirty.clear()
    },
  }
}

/**
 * A cache file this build does not understand reads as empty, never as partially valid.
 *
 * The schema check covers the layout change too: an older `.slop-gate` holds `results/<shard>/<hash>.json`
 * files this build never looks at, and they are simply orphaned rather than misread. `sgate check` writes
 * the new layout beside them; deleting the old tree is `sgate cache clear`'s job, not a read path's.
 */
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
