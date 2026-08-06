import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

export function resolveOxlintBinary(
  resolvePackageJson: (specifier: string) => string = createRequire(import.meta.url).resolve,
  fileExists: (path: string) => boolean = existsSync,
): ScriptBinInvocation | undefined {
  return resolveScriptBin({
    packageJsonSpecifier: 'oxlint/package.json',
    binSegments: ['bin', 'oxlint'],
    resolvePackageJson,
    fileExists,
  })
}

// oxlint's config schema is the only local statement of which rules take options.
export function resolveOxlintSchemaPath(
  resolvePackageJson: (specifier: string) => string = createRequire(import.meta.url).resolve,
): string | undefined {
  try {
    return join(dirname(resolvePackageJson('oxlint/package.json')), 'configuration_schema.json')
  } catch {
    return undefined
  }
}
