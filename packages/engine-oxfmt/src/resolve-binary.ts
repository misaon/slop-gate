import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

export type OxfmtInvocation = ScriptBinInvocation

export function resolveOxfmtBinary(
  resolvePackageJson: (specifier: string) => string = createRequire(import.meta.url).resolve,
  fileExists: (path: string) => boolean = existsSync,
): OxfmtInvocation | undefined {
  return resolveScriptBin({
    packageJsonSpecifier: 'oxfmt/package.json',
    binSegments: ['bin', 'oxfmt'],
    resolvePackageJson,
    fileExists,
  })
}
