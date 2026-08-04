import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Reads this CLI package's own `version` field. `import.meta.url` is *this module's* location, so `../package.json`
 * resolves only while this file stays directly under `packages/cli/src/` — one level below the package root, which
 * is also the depth a bundled chunk sits at, since tsdown flattens every chunk (entry or lazily `import()`-ed)
 * directly under `dist/` rather than into a `dist/commands/` subdirectory. The `../../package.json` fallback
 * covers that flattening ever stopping; it is not expected to be the one that resolves.
 */
export function readCliVersion(): string {
  const startDir = dirname(fileURLToPath(import.meta.url))
  for (const candidate of [join(startDir, '../package.json'), join(startDir, '../../package.json')]) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string; version?: string }
      if (pkg.name === 'sgate' && typeof pkg.version === 'string') return pkg.version
    } catch {
      continue
    }
  }
  return '0.0.0'
}
