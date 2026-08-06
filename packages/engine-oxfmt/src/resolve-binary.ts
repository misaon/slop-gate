import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

export function resolveOxfmtBinary(
  resolvePackageJson: (specifier: string) => string = createRequire(import.meta.url).resolve,
  fileExists: (path: string) => boolean = existsSync,
): ScriptBinInvocation | undefined {
  return resolveScriptBin({
    packageJsonSpecifier: 'oxfmt/package.json',
    binSegments: ['bin', 'oxfmt'],
    resolvePackageJson,
    fileExists,
  })
}
