import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

// Split into two tests, deliberately, so neither needs packages/cli's own dist to exist: this
// repo's `pnpm test` does not build first (turbo.json has no `test` task, and nothing depends on
// `sgate` to trigger its own build as a side effect of anyone else's typecheck).
//
// This one proves the library entry's own behaviour, from source: importing it exposes
// `defineConfig` and does not write to stdout. The other proves the package.json wiring that
// routes a real `import('sgate')` to this file rather than to `main.ts` — the
// side-effecting CLI script that used to sit behind "exports" and would have run the CLI as a side
// effect of loading a config file. Together they cover the same ground a single dist-dependent
// test would, without the build dependency.
test('the library entry exposes defineConfig and has no side effects', async () => {
  const writes: unknown[] = []
  const originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    writes.push(chunk)
    return true
  }) as typeof process.stdout.write

  let loaded: typeof import('./index.ts')
  try {
    loaded = await import('./index.ts')
  } finally {
    process.stdout.write = originalWrite
  }

  expect(typeof loaded.defineConfig).toBe('function')
  expect(writes).toEqual([])
})

test('the package "exports" field points at the library entry, not the CLI script', async () => {
  const packageDir = dirname(fileURLToPath(import.meta.url))
  const pkg = JSON.parse(await readFile(join(packageDir, '..', 'package.json'), 'utf8')) as {
    exports: { '.': { import: string; types: string } }
  }

  expect(pkg.exports['.'].import).toBe('./dist/index.js')
  expect(pkg.exports['.'].types).toBe('./dist/index.d.ts')
})

test('every package exposes types to classic node resolution, not only through exports', async () => {
  // A tsconfig with `"module": "commonjs"` and no explicit `moduleResolution` uses node10
  // resolution, which ignores the `exports` map entirely and looks for a top-level `types`.
  // Without this shim a generated `slop-gate.config.ts` raises TS2307 in the user's own
  // typecheck — measured against a real NestJS project, which is how it was found.
  const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

  for (const pkg of ['core', 'engine-oxlint', 'reporters', 'cli']) {
    const manifest = JSON.parse(await readFile(join(root, 'packages', pkg, 'package.json'), 'utf8')) as {
      types?: string
      exports?: { '.'?: { types?: string } }
    }
    const viaExports = manifest.exports?.['.']?.types

    expect(viaExports, `${pkg} declares types in exports`).toBeDefined()
    expect(manifest.types, `${pkg} also declares a top-level types`).toBe(viaExports)
  }
})
