import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

const require = createRequire(import.meta.url)

export function resolveKnipPackageJson(_specifier: string): string {
  return resolve(dirname(require.resolve('knip')), '..', 'package.json')
}

export function resolveKnipBinary(
  resolvePackageJson: (specifier: string) => string = resolveKnipPackageJson,
  fileExists: (path: string) => boolean = existsSync,
): ScriptBinInvocation | undefined {
  return resolveScriptBin({
    packageJsonSpecifier: 'knip/package.json',
    binSegments: ['bin', 'knip.js'],
    resolvePackageJson,
    fileExists,
  })
}
