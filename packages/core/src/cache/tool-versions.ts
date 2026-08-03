import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from './atomic-write.ts'
import { RACY_WINDOW_MS } from './stat-index.ts'

/** One record per argv element naming a file on disk — `node <script>` contributes two, a native binary one. */
type BinaryIdentity = { size: number; mtimeMs: number; ino: number }

type VersionEntry = { identity: BinaryIdentity[]; version: string }

export type ToolVersionCache = {
  /** `probe()` runs only on a miss. `invocation` is `[command, ...prefixArgs]`, never just the command. */
  resolve(invocation: readonly string[], probe: () => Promise<string>): Promise<string>
  persist(): Promise<void>
  /** How many probes actually ran. The observable the tests assert on, like `StatIndex.rehashCount`. */
  probeCount(): number
}

const INDEX_FILE = 'tool-versions.json'

/**
 * Remembers what `<tool> --version` said, so a warm run does not spawn a subprocess per engine to rebuild
 * a string it already knows. **`version()` is a cache-key component and nothing else** — nothing in a run
 * reads it, displays it or branches on it; it is hashed into every result key so that upgrading a tool
 * invalidates the results the old one produced.
 *
 * Keyed on `(size, mtimeMs, ino)` per argv element. That is weaker than what `StatIndex` accepts for a
 * source file, and defensible only because a binary is never edited in place: it is replaced wholesale by
 * a package manager, an archive extraction or a download, all of which create a new file.
 *
 * **`ino` is not decoration.** `tar -x`, `cp -p` and npm's own tarball extraction all *restore* recorded
 * timestamps, so a new build of the same byte length can land looking older than the entry describing its
 * predecessor — settled, matching, and wrong. Extraction moves the inode. But where the filesystem reports
 * no usable inode (Node gives `0` on some Windows and network volumes) the key degrades to
 * `(size, mtimeMs)`, which is why `settled()` is applied **as well as** `ino` rather than instead of it.
 *
 * Hashing the binary's content was rejected: correct, and more expensive than the spawn it replaces —
 * ast-grep's native binary alone is tens of megabytes.
 *
 * The residual exposure, deliberately unguarded: a binary replaced in place at the same byte length,
 * reusing its inode, inside the racy window. Bounded, self-healing on the next change to that file, and
 * bypassed entirely by `--no-cache`.
 */
export async function openToolVersionCache(cacheDir: string, now: () => number = Date.now): Promise<ToolVersionCache> {
  const entries = new Map<string, VersionEntry>(Object.entries(await readIndex(cacheDir)))
  let probes = 0
  let dirty = false

  return {
    async resolve(invocation, probe) {
      const key = invocation.join('\0')
      const identity = await identityOf(invocation)
      const cached = entries.get(key)
      if (identity !== undefined && cached !== undefined && matches(cached.identity, identity) && settled(identity, now()))
        return cached.version

      const version = await probe()
      probes += 1
      if (identity !== undefined) {
        entries.set(key, { identity, version })
        dirty = true
      }
      return version
    },

    async persist() {
      if (!dirty) return
      await writeFileAtomic(join(cacheDir, INDEX_FILE), JSON.stringify(Object.fromEntries(entries)))
      dirty = false
    },

    probeCount() {
      return probes
    },
  }
}

/**
 * `undefined` when any element cannot be stat-ed — a moved binary, or an argv entry that is not a path.
 * Nothing is cached then: a partial identity would be a key that cannot notice the part it left out.
 */
async function identityOf(invocation: readonly string[]): Promise<BinaryIdentity[] | undefined> {
  const identity: BinaryIdentity[] = []
  for (const path of invocation) {
    try {
      const stats = await stat(path)
      identity.push({ size: stats.size, mtimeMs: stats.mtimeMs, ino: stats.ino })
    } catch {
      return undefined
    }
  }
  return identity
}

const matches = (stored: readonly BinaryIdentity[], current: readonly BinaryIdentity[]): boolean =>
  stored.length === current.length &&
  stored.every((entry, index) => {
    const other = current[index]!
    return entry.size === other.size && entry.mtimeMs === other.mtimeMs && entry.ino === other.ino
  })

const settled = (identity: readonly BinaryIdentity[], nowMs: number): boolean =>
  identity.every((entry) => entry.mtimeMs < nowMs - RACY_WINDOW_MS)

async function readIndex(cacheDir: string): Promise<Record<string, VersionEntry>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(cacheDir, INDEX_FILE), 'utf8'))
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, VersionEntry>) : {}
  } catch {
    return {}
  }
}
