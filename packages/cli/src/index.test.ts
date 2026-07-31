import { expect, test } from 'vitest'

// This resolves '@misaon/slop-gate' by its published name (Node's self-reference resolution: a
// package's own exports map applies to imports of its own name from within its own tree), not by
// a relative path — that is the whole point. It is the regression test for the defect this task
// found: the package's "exports" field used to point at dist/main.js, the side-effecting CLI
// script, which has no exports of its own to give and would run the CLI as a side effect of this
// very import. Requires packages/cli's own dist to exist (`pnpm build`); unlike main.test.ts and
// check.test.ts in this same package, this cannot spawn or import source directly, because the
// property under test — that the *published* entry point is safe to import — is a property of the
// built package.json "exports" wiring, not of the source tree.
test('importing the package resolves the library entry, not the CLI script', async () => {
  const writes: unknown[] = []
  const originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    writes.push(chunk)
    return true
  }) as typeof process.stdout.write

  let loaded: typeof import('@misaon/slop-gate')
  try {
    loaded = await import('@misaon/slop-gate')
  } finally {
    process.stdout.write = originalWrite
  }

  expect(typeof loaded.defineConfig).toBe('function')
  expect(writes).toEqual([])
})
