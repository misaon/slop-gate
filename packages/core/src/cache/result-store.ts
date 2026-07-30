import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Diagnostic } from '../diagnostics/types.ts'
import { writeFileAtomic } from './atomic-write.ts'
import { RESULT_SCHEMA_VERSION } from './keys.ts'

export type ResultStore = {
  get(key: string): Promise<Diagnostic[] | null>
  set(key: string, diagnostics: readonly Diagnostic[]): Promise<void>
}

type StoredResult = { schema: number; diagnostics: Diagnostic[] }

export function openResultStore(cacheDir: string): ResultStore {
  const pathFor = (key: string): string => join(cacheDir, 'results', key.slice(0, 2), `${key}.json`)

  return {
    async get(key) {
      try {
        const parsed = JSON.parse(await readFile(pathFor(key), 'utf8')) as StoredResult
        if (parsed.schema !== RESULT_SCHEMA_VERSION || !Array.isArray(parsed.diagnostics)) return null
        return parsed.diagnostics
      } catch {
        return null
      }
    },

    async set(key, diagnostics) {
      const payload: StoredResult = { schema: RESULT_SCHEMA_VERSION, diagnostics: [...diagnostics] }
      await writeFileAtomic(pathFor(key), JSON.stringify(payload))
    },
  }
}
