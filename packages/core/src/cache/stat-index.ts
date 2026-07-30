import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { InventoryFile } from '../discovery/types.ts'
import { writeFileAtomic } from './atomic-write.ts'
import { hashContent } from './keys.ts'

type StatEntry = { size: number; mtimeMs: number; hash: string }

export type StatIndex = {
  hashOf(rootDir: string, file: InventoryFile): Promise<string>
  persist(): Promise<void>
  rehashCount(): number
}

const INDEX_FILE = 'stat-index.json'

export async function openStatIndex(cacheDir: string): Promise<StatIndex> {
  const entries = new Map<string, StatEntry>(Object.entries(await readIndex(cacheDir)))
  let rehashes = 0
  let dirty = false

  return {
    async hashOf(rootDir, file) {
      const cached = entries.get(file.path)
      if (cached && cached.size === file.size && cached.mtimeMs === file.mtimeMs) return cached.hash

      const hash = hashContent(await readFile(join(rootDir, file.path)))
      entries.set(file.path, { size: file.size, mtimeMs: file.mtimeMs, hash })
      rehashes += 1
      dirty = true
      return hash
    },

    async persist() {
      if (!dirty) return
      await writeFileAtomic(join(cacheDir, INDEX_FILE), JSON.stringify(Object.fromEntries(entries)))
      dirty = false
    },

    rehashCount() {
      return rehashes
    },
  }
}

async function readIndex(cacheDir: string): Promise<Record<string, StatEntry>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(cacheDir, INDEX_FILE), 'utf8'))
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, StatEntry>) : {}
  } catch {
    return {}
  }
}
