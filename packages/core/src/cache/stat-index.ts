import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { InventoryFile } from '../discovery/types.ts'
import { writeFileAtomic } from './atomic-write.ts'
import { hashContent } from './keys.ts'

type StatEntry = { size: number; mtimeMs: number; hash: string }

/**
 * How recently a file may have been written before its `(size, mtimeMs)` pair stops being trusted as
 * proof that the content is unchanged.
 *
 * The stat fast path assumes a write always moves `mtimeMs`. It does not: filesystem timestamp
 * granularity is coarse (2s on FAT, and Windows updates last-write-time lazily), so two writes close
 * enough together can leave `mtimeMs` identical. When the replacement content also happens to be the
 * same length — `const a = 1` to `const a = 2`, flipping a boolean, fixing an equal-length typo, the
 * single most ordinary edit there is — `size` matches too, and the index hands back the *previous*
 * file's hash. Every downstream cache lookup is then keyed on content that is no longer on disk, so a
 * run reports the last version's diagnostics for a file the developer just changed: silently wrong,
 * and wrong in the direction that hides findings rather than inventing them.
 *
 * Git has the same exposure in its own index and calls such entries "racily clean"; the fix here is
 * its fix. An entry is trusted only once the file's mtime is comfortably in the past, which a file
 * being actively edited never is, so a just-written file is re-read until it settles. The cost is
 * bounded to files touched within the window — in practice the handful the developer just saved —
 * and it is self-healing: no state has to be invalidated for a file to become cacheable again.
 *
 * 2s is the calibrated value, not a round one. FAT is the binding case at two-second write-time
 * accuracy (NTFS resolves to 100ns), and it truncates to the granule rather than rounding, so a file
 * reporting mtime `T` may have been written as late as `T + 2000` — past which no write can still
 * share that timestamp. Halving this would leave half of FAT's granule exposed.
 */
const RACY_WINDOW_MS = 2_000

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
