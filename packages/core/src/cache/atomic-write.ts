import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

/**
 * On Windows a rename onto an existing target is not POSIX's uncontended metadata swap: anything holding
 * the target open for an instant — the other writer in a concurrent pair, a real-time virus scanner, a
 * search indexer — makes the call fail outright rather than wait. `graceful-fs` retries the same three
 * codes for the same reason; npm's `write-file-atomic` carries an open bug for exactly this because it
 * does not.
 */
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])

/**
 * ~160ms across five attempts. Deliberately short: this guards a *cache* write, so sustained contention
 * should fail fast and let the run continue uncached rather than stall a linter the way `graceful-fs`'s
 * minute-long ladder would.
 */
const RETRY_DELAYS_MS = [1, 5, 15, 40, 100]

const isTransient = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && TRANSIENT_RENAME_CODES.has(String(error.code))

export type WriteFileAtomicOptions = {
  /** Injectable for tests; production always uses `node:fs/promises`' own `rename`. */
  renameFile?: (from: string, to: string) => Promise<void>
}

/**
 * Writes `data` to `target` via a uniquely-named scratch file so a reader never observes a partial write,
 * and so two concurrent writers cannot corrupt each other's bytes.
 *
 * Retrying is not defensive padding: the concurrency this function exists to make safe is precisely what
 * provokes the Windows failure above, so a bare `rename` is unsafe on the one platform the scratch file
 * was introduced for. It runs on **every** platform rather than behind a `process.platform` check — a
 * Windows-only path would go unexercised on the machines the tests actually run on, and on POSIX these
 * codes mean a real failure that five attempts over 160ms resolve into the same error anyway.
 */
export async function writeFileAtomic(
  target: string,
  /**
   * `Uint8Array` as well as `string` because `sgate fix` (spec §11 step 7) splices bytes — engine ranges
   * are byte offsets, so that pipeline never decodes the file. **Narrowing this signature** would put back
   * the encoding step it exists to avoid, and would rewrite any byte sequence `TextDecoder` cannot carry.
   */
  data: string | Uint8Array,
  options: WriteFileAtomicOptions = {},
): Promise<void> {
  const renameFile = options.renameFile ?? rename
  await mkdir(dirname(target), { recursive: true })
  const scratch = `${target}.${randomUUID()}.tmp`
  await writeFile(scratch, data, 'utf8')

  for (let attempt = 0; ; attempt += 1) {
    try {
      await renameFile(scratch, target)
      return
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length || !isTransient(error)) {
        // Nothing ever collects these: the name is a fresh UUID each time, so no later run can recognise
        // a stray `.tmp` sibling as its own to clean up.
        await rm(scratch, { force: true })
        throw error
      }
      await delay(RETRY_DELAYS_MS[attempt])
    }
  }
}
