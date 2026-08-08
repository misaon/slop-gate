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

/**
 * Whether `--type-aware` will work. oxlint locates the `tsgolint` executable itself and fails the whole
 * run when it cannot, so this only has to answer whether the package is resolvable — not where it is.
 */
export function resolveTsgolint(
  resolvePackageJson: (specifier: string) => string = createRequire(import.meta.url).resolve,
): boolean {
  try {
    resolvePackageJson('oxlint-tsgolint/package.json')
    return true
  } catch {
    return false
  }
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
