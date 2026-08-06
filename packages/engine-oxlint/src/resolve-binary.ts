import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

export type OxlintInvocation = ScriptBinInvocation

export function resolveOxlintBinary(
  resolvePackageJson: (specifier: string) => string = createRequire(import.meta.url).resolve,
  fileExists: (path: string) => boolean = existsSync,
): OxlintInvocation | undefined {
  return resolveScriptBin({
    packageJsonSpecifier: 'oxlint/package.json',
    binSegments: ['bin', 'oxlint'],
    resolvePackageJson,
    fileExists,
  })
}

/**
 * oxlint ships a JSON Schema for its config, and it is the only local statement of which rules take
 * options. This package owns the dependency, so it is the one that can find the file.
 */
export function resolveOxlintSchemaPath(
  resolvePackageJson: (specifier: string) => string = createRequire(import.meta.url).resolve,
): string | undefined {
  try {
    return join(dirname(resolvePackageJson('oxlint/package.json')), 'configuration_schema.json')
  } catch {
    return undefined
  }
}
