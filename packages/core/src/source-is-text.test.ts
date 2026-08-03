import { globSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { compareStrings } from './ordering.ts'

/**
 * A raw NUL byte in a `.ts` file makes `grep` classify it as binary and skip it — silently, returning
 * no matches rather than an error. Two files here carried one as a composite-key delimiter written as
 * the byte itself instead of the `\0` escape, so every grep-based audit of `registry/elect.ts` and
 * `engine-deps-security/src/scan.ts` came back empty and looked like a clean result. The compiler,
 * the tests and `git diff` are all unaffected, which is why nothing caught it for the life of the
 * repository.
 *
 * The escape is what belongs in source; the delimiter itself is a good choice, because NUL cannot
 * occur in a rule id or a package name and so cannot make one composite key ambiguous with another.
 */

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
