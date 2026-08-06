import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function readCliVersion(): string {
  const startDir = import.meta.dirname
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
