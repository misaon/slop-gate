import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { compareStrings, resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

export function resolveTscBinary(
  rootDir: string,
  resolvePackageJson: (specifier: string) => string = createRequire(join(rootDir, 'package.json')).resolve,
  fileExists: (path: string) => boolean = existsSync,
): ScriptBinInvocation | undefined {
  return resolveScriptBin({
    packageJsonSpecifier: 'typescript/package.json',
    binSegments: ['bin', 'tsc'],
    resolvePackageJson,
    fileExists,
  })
}

export type TscResolution =
  | { readonly kind: 'resolved'; readonly invocation: ScriptBinInvocation; readonly version: string; readonly fromDir: string }
  | { readonly kind: 'ambiguous'; readonly versions: readonly string[] }
  | { readonly kind: 'missing' }

export function resolveTscAcrossWorkspaces(
  rootDir: string,
  workspaceDirs: readonly string[],
  resolveIn: (dir: string) => ScriptBinInvocation | undefined = (dir) => resolveTscBinary(dir),
  readVersion: (invocation: ScriptBinInvocation) => string | undefined = versionOfResolvedTypescript,
): TscResolution {
  const fromRoot = resolveIn(rootDir)
  if (fromRoot !== undefined) {
    return { kind: 'resolved', invocation: fromRoot, version: readVersion(fromRoot) ?? 'unknown', fromDir: rootDir }
  }

  const byVersion = new Map<string, { invocation: ScriptBinInvocation; fromDir: string }>()
  for (const dir of workspaceDirs) {
    const invocation = resolveIn(dir)
    if (invocation === undefined) continue
    const version = readVersion(invocation) ?? 'unknown'
    if (!byVersion.has(version)) byVersion.set(version, { invocation, fromDir: dir })
  }

  if (byVersion.size === 0) return { kind: 'missing' }
  if (byVersion.size > 1) return { kind: 'ambiguous', versions: [...byVersion.keys()].sort(compareStrings) }

  const [only] = [...byVersion]
  if (only === undefined) return { kind: 'missing' }
  const [version, found] = only
  return { kind: 'resolved', invocation: found.invocation, version, fromDir: found.fromDir }
}

function versionOfResolvedTypescript(invocation: ScriptBinInvocation): string | undefined {
  const script = invocation.prefixArgs[0]
  if (script === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dirname(dirname(script)), 'package.json'), 'utf8'))
    const version = (parsed as { version?: unknown }).version
    return typeof version === 'string' ? version : undefined
  } catch {
    return undefined
  }
}
