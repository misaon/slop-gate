import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type ScriptBinInvocation = {
  readonly command: string
  readonly prefixArgs: readonly string[]
}

export type ResolveScriptBinOptions = {
  packageJsonSpecifier: string
  binSegments: readonly string[]
  resolvePackageJson: (specifier: string) => string
  fileExists?: (path: string) => boolean
}

export function resolveScriptBin(options: ResolveScriptBinOptions): ScriptBinInvocation | undefined {
  const fileExists = options.fileExists ?? existsSync
  try {
    const scriptPath = join(dirname(options.resolvePackageJson(options.packageJsonSpecifier)), ...options.binSegments)
    if (!fileExists(scriptPath)) return undefined
    return { command: process.execPath, prefixArgs: [scriptPath] }
  } catch {
    return undefined
  }
}
