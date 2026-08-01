import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

/**
 * Errors a rename onto an existing target can fail with *transiently* on Windows, where the rename is
 * not the uncontended metadata swap POSIX makes it. Anything holding the target open for even an
 * instant — the other writer in a concurrent pair, a real-time virus scanner opening the file it just
 * saw written, a search indexer — makes the call fail outright rather than wait. The same three codes
 * are what `graceful-fs` retries for the identical reason, and npm's own `write-file-atomic` carries
 * an open bug for exactly this because it does not.
 */
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])

/**
 * Backoff schedule, ~160ms in total across five attempts. Deliberately short: this guards a cache
 * write, so the correct response to genuinely sustained contention is to fail fast and let the run
 * continue uncached rather than to stall a linter the way `graceful-fs`'s minute-long ladder would.
 */
const RETRY_DELAYS_MS = [1, 5, 15, 40, 100]

const isTransient = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && TRANSIENT_RENAME_CODES.has(String(error.code))

export type WriteFileAtomicOptions = {
  /** Injectable for tests; production always uses `node:fs/promises`' own `rename`. */
  renameFile?: (from: string, to: string) => Promise<void>
}

/**
 * Writes `data` to `target` via a uniquely-named scratch file so a reader never observes a partial
 * write, and so two concurrent writers cannot corrupt each other's bytes.
 *
 * Retrying is not defensive padding: the concurrency this function exists to make safe is precisely
 * what provokes the Windows failure, so a bare `rename` is unsafe on the one platform the scratch
 * file was introduced for. The retry runs on every platform rather than behind a `process.platform`
 * check — a Windows-only path would go unexercised on the machines where the tests usually run, which
 * is the same trap `resolveScriptBin` documents in the other direction, and on POSIX these codes mean
 * a real failure that five attempts over 160ms resolve into the same error anyway.
 */
export async function writeFileAtomic(
  target: string,
  /**
   * `Uint8Array` as well as `string` because `sgate fix` (spec §11 step 7) writes a source file it
   * rebuilt by splicing bytes: engine ranges are byte offsets, so the fix pipeline never decodes the
   * file at all. Round-tripping through a string here to satisfy a narrower signature would reintroduce
   * exactly the encoding step that pipeline exists to avoid, and would rewrite any byte sequence
   * `TextDecoder` could not represent.
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
        // Losing the scratch file would leave a `.tmp` sibling in the cache directory for every
        // failure, and nothing ever collects them: the name is a fresh UUID each time, so no later
        // run can recognise one as its own to clean up.
        await rm(scratch, { force: true })
        throw error
      }
      await delay(RETRY_DELAYS_MS[attempt])
    }
  }
}
