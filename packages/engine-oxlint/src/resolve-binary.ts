import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
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
