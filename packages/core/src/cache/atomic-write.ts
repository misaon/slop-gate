import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])

const RETRY_DELAYS_MS = [1, 5, 15, 40, 100]

const isTransient = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && TRANSIENT_RENAME_CODES.has(String(error.code))

export type WriteFileAtomicOptions = {
  renameFile?: (from: string, to: string) => Promise<void>
}

export async function writeFileAtomic(
  target: string,
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
        await rm(scratch, { force: true })
        throw error
      }
      await delay(RETRY_DELAYS_MS[attempt])
    }
  }
}
