import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Reads this CLI package's own `version` field.
 *
 * `import.meta.url` refers to *this module's own* location, not the caller's — so as long as this
 * file lives directly under `packages/cli/src/` (one level below the package root, the same depth
 * `main.ts` sits at), `../package.json` resolves correctly both as source (`src/version.ts`, ts-dev
 * and vitest run files in place) and once bundled: tsdown flattens every chunk — entry or lazily
 * `import()`-ed — directly under `dist/`, never into a `dist/commands/` subdirectory, so a bundled
 * chunk sits at the same one-level depth regardless of which source directory it was authored in.
 * The `../../package.json` fallback exists only in case that flattening assumption ever stops
 * holding for some future build configuration; it is not expected to be the one that resolves.
 */
export function readCliVersion(): string {
  const startDir = dirname(fileURLToPath(import.meta.url))
  for (const candidate of [join(startDir, '../package.json'), join(startDir, '../../package.json')]) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string; version?: string }
      if (pkg.name === '@misaon/slop-gate' && typeof pkg.version === 'string') return pkg.version
    } catch {
      continue
    }
  }
  return '0.0.0'
}
