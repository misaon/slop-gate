import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { ScriptBinInvocation } from '@misaon/slop-gate-core'

export type AstGrepInvocation = ScriptBinInvocation

const PLATFORM_PACKAGES: Readonly<Record<string, string>> = {
  'darwin arm64': '@ast-grep/cli-darwin-arm64',
  'darwin x64': '@ast-grep/cli-darwin-x64',
  'linux arm64': '@ast-grep/cli-linux-arm64-gnu',
  'linux x64': '@ast-grep/cli-linux-x64-gnu',
  'win32 arm64': '@ast-grep/cli-win32-arm64-msvc',
  'win32 ia32': '@ast-grep/cli-win32-ia32-msvc',
  'win32 x64': '@ast-grep/cli-win32-x64-msvc',
}

export type ResolveAstGrepBinaryOptions = {
  platform?: string
  arch?: string
  isGlibc?: () => boolean
  resolveFromCli?: (specifier: string, cliDir: string) => string
  resolveCliPackageJson?: () => string
  fileExists?: (path: string) => boolean
}

export function resolveAstGrepBinary(options: ResolveAstGrepBinaryOptions = {}): AstGrepInvocation | undefined {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const isGlibc = options.isGlibc ?? defaultIsGlibc
  const fileExists = options.fileExists ?? existsSync
  const resolveCliPackageJson = options.resolveCliPackageJson ?? defaultResolveCliPackageJson
  const resolveFromCli = options.resolveFromCli ?? defaultResolveFromCli
  const unpublished: AstGrepInvocation = { command: 'ast-grep', prefixArgs: [] }

  if (platform === 'linux' && !isGlibc()) return unpublished

  const packageName = PLATFORM_PACKAGES[`${platform} ${arch}`]
  if (packageName === undefined) return unpublished

  try {
    const cliDir = dirname(resolveCliPackageJson())
    const binaryDir = dirname(resolveFromCli(`${packageName}/package.json`, cliDir))
    const binary = join(binaryDir, platform === 'win32' ? 'ast-grep.exe' : 'ast-grep')
    if (!fileExists(binary)) return undefined
    return { command: binary, prefixArgs: [] }
  } catch {
    return undefined
  }
}

const require = createRequire(import.meta.url)

function defaultResolveCliPackageJson(): string {
  return require.resolve('@ast-grep/cli/package.json')
}

function defaultResolveFromCli(specifier: string, cliDir: string): string {
  return createRequire(join(cliDir, 'noop.cjs')).resolve(specifier)
}

function defaultIsGlibc(): boolean {
  const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined
  return report?.header?.glibcVersionRuntime !== undefined
}
