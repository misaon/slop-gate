import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { writeFileAtomic } from './atomic-write.ts'

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
  expect(await readFile(target, 'utf8')).toBe('hello')
})

test('concurrent writers to the same target do not collide on the scratch filename', async () => {
  const target = join(dir, 'out.json')

  await Promise.all([writeFileAtomic(target, 'a'), writeFileAtomic(target, 'b')])

  expect(['a', 'b']).toContain(await readFile(target, 'utf8'))
})
