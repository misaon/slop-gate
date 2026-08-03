import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from './atomic-write.ts'
import { RACY_WINDOW_MS } from './stat-index.ts'

/**
 * What a resolved invocation is recognised by, without reading a byte of it. One record per argv
 * element that names a file on disk — `node <script>` contributes two, a native binary one.
 */
type BinaryIdentity = { size: number; mtimeMs: number; ino: number }

type VersionEntry = { identity: BinaryIdentity[]; version: string }

export type ToolVersionCache = {
  /**
   * `probe()` runs only when this invocation's binaries are not the ones a previous run recorded a
   * version for. `invocation` is `[command, ...prefixArgs]`, never just the command.
   */
  resolve(invocation: readonly string[], probe: () => Promise<string>): Promise<string>
  persist(): Promise<void>
  /** How many probes actually ran. The observable the tests assert on, like `StatIndex.rehashCount`. */
  probeCount(): number
}

const INDEX_FILE = 'tool-versions.json'

/**
 * Remembers what `<tool> --version` said, so a warm run does not spawn a subprocess per engine to
 * rebuild a string it already knows.
 *
 * **The whole reason this exists is that `version()` is a cache-key component and nothing else.**
 * Nothing in a run reads it, displays it or branches on it — it is hashed into every result key so
 * that upgrading a tool invalidates the results the old one produced. Four of the engines implement
 * it as a `<tool> --version` spawn, and measured on this repository with a span around each one they
 * cost 36.5 ms (tsc), 25.4 ms (oxlint), 13.8 ms (actionlint) and 3.0 ms (ast-grep) — resolved
 * concurrently, so ~36 ms of a 111.6 ms internal warm run, every run, warm or cold, to learn
 * something that changes only when the machine's tooling does.
 *
 * Those per-engine figures are why this cache exists and are deliberately *not* what `--timing` shows:
 * the probes overlap, so summing them would over-count the wall clock, and the breakdown reports the
 * fan-out as one `versions` row instead (see `streamCheck`).
 *
 * ## What it is keyed on, and the staleness that buys
 *
 * A tool binary is not an edited source file, and that difference is what makes this key defensible
 * where the same key on a source file would not be. `StatIndex` deliberately does not trust
 * `(size, mtimeMs)` alone (see `RACY_WINDOW_MS`), because the modal edit — `const a = 1` to
 * `const a = 2` — preserves size, and a coarse-granularity filesystem can preserve mtime too. A
 * *binary* is never edited in place by a human: it is replaced wholesale by a package manager, an
 * archive extraction or a download, all of which create a new file. So the identity here records
 * `ino` alongside size and mtime, and a replacement has to match all three to be mistaken for the
 * original.
 *
 * `ino` is not decoration. It closes the one realistic shape `(size, mtimeMs)` misses for a tool:
 * `tar -x`, `cp -p` and npm's own tarball extraction all *restore* recorded timestamps, so a new
 * build of the same byte length can land looking older than the entry describing its predecessor —
 * settled, matching, and wrong. Extraction creates a new file, so the inode moves. Where the
 * filesystem reports no usable inode (Node reports `0` on some Windows and network volumes) the key
 * degrades to `(size, mtimeMs)`, which is why the racy-window guard below is applied as well rather
 * than instead.
 *
 * The alternative considered and rejected was hashing the binary's content: correct, and more
 * expensive than the spawn it replaces — ast-grep's native binary alone is tens of megabytes, so a
 * content-addressed key would cost more on every run than the subprocess costs on the first one.
 *
 * The residual exposure is therefore: replace a binary in place, at the same byte length, reusing its
 * inode, with a timestamp inside the same racy window — after which a run reports the previous
 * version and keys every result on it. It is bounded and self-healing (the next change to that file
 * fixes it), it never survives a `--no-cache` run, which bypasses this cache entirely, and no
 * ordinary install produces it. That is the trade taken, deliberately, and it is not the trade
 * `StatIndex` faces.
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
 * `undefined` when any element of the invocation cannot be stat-ed — a binary that has moved, or an
 * argv entry that is not a path at all. Nothing is cached in that case: a partial identity would be a
 * key that cannot notice the part it left out.
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
