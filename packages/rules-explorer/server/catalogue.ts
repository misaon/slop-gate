import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { CatalogueEntry, CatalogueSummary, IMPACTS } from '@misaon/slop-gate-core'
import type { RuleHistory } from '../scripts/history.ts'

const run = promisify(execFile)

export type Payload = {
  readonly generation: number
  readonly generatedAt: string
  readonly rules: readonly CatalogueEntry[]
  readonly summary: CatalogueSummary
  readonly impacts: typeof IMPACTS
  readonly history: RuleHistory
}

/**
 * Polled rather than watched. `fs.watch` saw the first edit and then went deaf: an editor that writes
 * through a temp file and renames — `sed -i` does, and so do most editors — replaces the inode the
 * inotify watch was attached to. A scan of core's 79 source files costs 8 ms, so once a second is
 * free and cannot be detached by a rename.
 */
const POLL_MS = 1000

/**
 * The catalogue as it is in core's **source**, re-read when that source changes.
 *
 * Reading the build would mean a rule edit shows up only after `pnpm build` and a restart, which for
 * a page whose whole job is to report the current state of the registry is a way of being quietly
 * wrong.
 */
export function openCatalogue(repoRoot: string) {
  const coreSrc = join(repoRoot, 'packages', 'core', 'src')
  const builder = join(import.meta.dirname, 'build-payload.ts')

  let generation = 0
  let pending: Promise<Payload> | null = null
  let lastGood: Payload | null = null
  let fingerprint = ''
  const listeners = new Set<(generation: number) => void>()

  /** Newest mtime and file count together: catches an edit, an addition and a deletion alike. */
  const scan = async (): Promise<string> => {
    const entries = await readdir(coreSrc, { recursive: true, withFileTypes: true })
    const sources = entries.filter(
      (entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'),
    )
    let newest = 0
    for (const entry of sources) {
      const stats = await stat(join(entry.parentPath, entry.name)).catch(() => null)
      if (stats !== null && stats.mtimeMs > newest) newest = stats.mtimeMs
    }
    return `${sources.length}:${newest}`
  }

  const check = async (): Promise<void> => {
    const next = await scan()
    const first = fingerprint === ''
    if (next === fingerprint) return
    fingerprint = next
    if (first) return

    generation += 1
    pending = null
    for (const listener of listeners) listener(generation)
  }

  const poll = setInterval(() => void check(), POLL_MS)
  poll.unref()

  const build = async (): Promise<Payload> => {
    const at = generation
    try {
      const { stdout } = await run(process.execPath, ['--experimental-strip-types', builder], {
        cwd: repoRoot,
        maxBuffer: 64 * 1024 * 1024,
      })
      const payload = { ...(JSON.parse(stdout) as Omit<Payload, 'generation'>), generation: at }
      lastGood = payload
      return payload
    } catch (error) {
      // Mid-edit source does not always parse. Serving the last good catalogue beats serving nothing.
      if (lastGood !== null) return lastGood
      throw error
    }
  }

  return {
    get(): Promise<Payload> {
      pending ??= build()
      return pending
    },
    generation: () => generation,
    onChange(listener: (generation: number) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close(): void {
      clearInterval(poll)
      listeners.clear()
    },
  }
}
