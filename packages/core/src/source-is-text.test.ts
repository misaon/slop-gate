import { globSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { compareStrings } from './ordering.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

test('no source file contains a byte that makes tooling treat it as binary', () => {
  const offenders = globSync('packages/*/src/**/*.ts', { cwd: repoRoot })
    .sort(compareStrings)
    .flatMap((file) => {
      const bytes = readFileSync(resolve(repoRoot, file))
      const at = bytes.indexOf(0)
      return at === -1 ? [] : [`${file}: NUL byte at offset ${at} — write it as the \\0 escape`]
    })

  expect(offenders).toEqual([])
})
