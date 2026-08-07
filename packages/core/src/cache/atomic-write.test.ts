import { mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { writeFileAtomic } from './atomic-write.ts'

const withCode = (code: string): NodeJS.ErrnoException =>
  Object.assign(new Error(`${code}: simulated`), { code })

const renameFailing = (failures: number, code = 'EPERM') => {
  let remaining = failures
  const calls = { count: 0 }
  const renameFile = async (from: string, to: string): Promise<void> => {
    calls.count += 1
    if (remaining > 0) {
      remaining -= 1
      throw withCode(code)
    }
    await rename(from, to)
  }
  return { renameFile, calls }
}

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-atomic-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('writes a file that can be read back', async () => {
  const target = join(dir, 'out.json')
  await writeFileAtomic(target, 'hello')
  await expect(readFile(target, 'utf8')).resolves.toBe('hello')
})

test('concurrent writers to the same target do not collide on the scratch filename', async () => {
  const target = join(dir, 'out.json')

  await Promise.all([writeFileAtomic(target, 'a'), writeFileAtomic(target, 'b')])

  expect(['a', 'b']).toContain(await readFile(target, 'utf8'))
})

test('retries a rename that fails transiently and still writes the file', async () => {
  const target = join(dir, 'out.json')
  const { renameFile, calls } = renameFailing(3)

  await writeFileAtomic(target, 'hello', { renameFile })

  await expect(readFile(target, 'utf8')).resolves.toBe('hello')
  expect(calls.count).toBe(4)
})

test('gives up after exhausting the retry schedule and rethrows the original error', async () => {
  const target = join(dir, 'out.json')
  const { renameFile, calls } = renameFailing(Number.POSITIVE_INFINITY)

  await expect(writeFileAtomic(target, 'hello', { renameFile })).rejects.toThrow('EPERM')
  expect(calls.count).toBe(6)
})

test('does not retry an error that is not a transient lock', async () => {
  const target = join(dir, 'out.json')
  const { renameFile, calls } = renameFailing(Number.POSITIVE_INFINITY, 'ENOSPC')

  await expect(writeFileAtomic(target, 'hello', { renameFile })).rejects.toThrow('ENOSPC')
  expect(calls.count).toBe(1)
})

test('removes the scratch file when the rename ultimately fails', async () => {
  const target = join(dir, 'out.json')
  const { renameFile } = renameFailing(Number.POSITIVE_INFINITY)

  await expect(writeFileAtomic(target, 'hello', { renameFile })).rejects.toThrow('EPERM')
  await expect(readdir(dir)).resolves.toEqual([])
})
