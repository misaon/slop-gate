import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AdvisoryRecord, AdvisoryTable } from './advisory.ts'
import { buildKeyedTable, KeyedTableFormatError, openKeyedTable } from './keyed-table.ts'

const record = (id: string): AdvisoryRecord => ({ id, versions: ['1.0.0'], ranges: [], severity: 'HIGH', summary: `${id} summary` })

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sgate-keyed-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function write(table: AdvisoryTable) {
  const { index, records } = buildKeyedTable(table)
  const recordsPath = join(dir, 'malicious.rec')
  await writeFile(recordsPath, records)
  return openKeyedTable(index, recordsPath)
}

describe('keyed advisory table', () => {
  it('finds every name it was built from, and nothing it was not', async () => {
    const table: AdvisoryTable = {
      chalk: [record('MAL-1')],
      '@scope/pkg': [record('MAL-2')],
      debug: [record('MAL-3'), record('MAL-4')],
      'zzz-last': [record('MAL-5')],
    }
    const keyed = await write(table)

    for (const name of Object.keys(table)) {
      expect((await keyed.lookup(name)).map((entry) => entry.id)).toEqual(table[name]!.map((entry) => entry.id))
    }
    for (const absent of ['chal', 'chalkk', 'aaa', 'zzzz', '', '@scope/other']) {
      await expect(keyed.lookup(absent)).resolves.toEqual([])
    }
    await keyed.close()
  })

  it('returns the whole record, not just its id', async () => {
    const keyed = await write({ chalk: [record('MAL-2025-46969')] })
    await expect(keyed.lookup('chalk')).resolves.toEqual([
      { id: 'MAL-2025-46969', versions: ['1.0.0'], ranges: [], severity: 'HIGH', summary: 'MAL-2025-46969 summary' },
    ])
    await keyed.close()
  })

  it('orders by UTF-8 so the binary search agrees with the writer', async () => {
    // `-` (0x2D) sorts before `.` (0x2E) before `/` (0x2F) before digits before letters; `@` (0x40)
    // sorts before every lowercase letter. A name set that straddles those boundaries would go
    // missing if either side used a different comparison.
    const names = ['@a/z', '@z/a', 'a-b', 'a.b', 'a0', 'aa', 'a~b', 'z', 'ä', '日本']
    const table = Object.fromEntries(names.map((name) => [name, [record(`MAL-${name}`)]]))
    const keyed = await write(table)

    for (const name of names) {
      expect((await keyed.lookup(name))[0]?.id, `lookup ${name}`).toBe(`MAL-${name}`)
    }
    await keyed.close()
  })

  it('handles an empty table', async () => {
    const keyed = await write({})
    await expect(keyed.lookup('anything')).resolves.toEqual([])
    await keyed.close()
  })

  it('refuses an index that is not one', async () => {
    await expect(openKeyedTable(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), join(dir, 'nope'))).rejects.toThrow(
      KeyedTableFormatError,
    )
  })

  it('never opens the records file when nothing matches', async () => {
    const { index } = buildKeyedTable({ chalk: [record('MAL-1')] })
    const keyed = await openKeyedTable(index, join(dir, 'does-not-exist.rec'))
    await expect(keyed.lookup('something-else')).resolves.toEqual([])
    await keyed.close()
  })
})
