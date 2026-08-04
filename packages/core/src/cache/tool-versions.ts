import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from './atomic-write.ts'
import { RACY_WINDOW_MS } from './stat-index.ts'

type BinaryIdentity = { size: number; mtimeMs: number; ino: number }

type VersionEntry = { identity: BinaryIdentity[]; version: string }

export type ToolVersionCache = {
  resolve(invocation: readonly string[], probe: () => Promise<string>): Promise<string>
  persist(): Promise<void>
  probeCount(): number
}

const INDEX_FILE = 'tool-versions.json'

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
