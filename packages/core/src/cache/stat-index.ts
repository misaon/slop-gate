import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { InventoryFile } from '../discovery/types.ts'
import { writeFileAtomic } from './atomic-write.ts'
import { hashContent } from './keys.ts'

type StatEntry = { size: number; mtimeMs: number; hash: string }

/**
 * How recently a file may have been written before its `(size, mtimeMs)` pair stops being trusted as proof
 * the content is unchanged. The stat fast path assumes a write always moves `mtimeMs`; it does not, and
 * when the replacement is the same length too — `const a = 1` to `const a = 2` — the index hands back the
 * *previous* file's hash, so every downstream lookup is keyed on content no longer on disk: **silently
 * wrong, in the direction that hides findings.** Git calls such entries "racily clean"; this is its fix.
 *
 * 2s is calibrated, not round. FAT is the binding case at two-second write-time accuracy (NTFS resolves to
 * 100ns) and it **truncates to the granule rather than rounding**, so a file reporting mtime `T` may have
 * been written as late as `T + 2000` — past which no write can share that timestamp. Halving this leaves
 * half of FAT's granule exposed. Exported because `ToolVersionCache` needs the same number for the same
 * reason, shared rather than restated so the two cannot drift.
 */
export const RACY_WINDOW_MS = 2_000

export type StatIndex = {
  hashOf(rootDir: string, file: InventoryFile): Promise<string>
  persist(): Promise<void>
  rehashCount(): number
}

const INDEX_FILE = 'stat-index.json'

export async function openStatIndex(cacheDir: string, now: () => number = Date.now): Promise<StatIndex> {
  const entries = new Map<string, StatEntry>(Object.entries(await readIndex(cacheDir)))
  let rehashes = 0
  let dirty = false

  const settled = (mtimeMs: number): boolean => mtimeMs < now() - RACY_WINDOW_MS

  return {
    async hashOf(rootDir, file) {
      const cached = entries.get(file.path)
      if (cached && cached.size === file.size && cached.mtimeMs === file.mtimeMs && settled(file.mtimeMs))
        return cached.hash

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
