import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'

test('the library entry exposes defineConfig and has no side effects', async () => {
  const writes: unknown[] = []
  const originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    writes.push(chunk)
    return true
  })

  let loaded: typeof import('./index.ts')
  try {
    loaded = await import('./index.ts')
  } finally {
    process.stdout.write = originalWrite
  }

  expect(loaded.defineConfig).toBeTypeOf('function')
  expect(writes).toEqual([])
})

test('the package "exports" field points at the library entry, not the CLI script', async () => {
  const packageDir = import.meta.dirname
  const pkg = JSON.parse(await readFile(join(packageDir, '..', 'package.json'), 'utf8')) as {
    exports: { '.': { import: string; types: string } }
  }

  expect(pkg.exports['.'].import).toBe('./dist/index.js')
  expect(pkg.exports['.'].types).toBe('./dist/index.d.ts')
})

test('every package exposes types to classic node resolution, not only through exports', async () => {
  const root = join(import.meta.dirname, '../../..')

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
