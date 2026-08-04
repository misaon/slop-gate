import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
