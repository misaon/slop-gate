import { randomUUID } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function writeFileAtomic(target: string, data: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  const scratch = `${target}.${randomUUID()}.tmp`
  await writeFile(scratch, data, 'utf8')
  await rename(scratch, target)
}
