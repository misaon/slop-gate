import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { compareStrings, resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

export type TscInvocation = ScriptBinInvocation

/**
 * Resolves the *analysed project's own* `typescript` (spec §13.1) — a type error must match what the developer's
 * editor and build already report, or the tool loses credibility on its first run. `typescript` is a **peer**
 * dependency, so unlike bundled oxlint it must be resolved relative to `rootDir` and never `import.meta.url`,
 * which would silently find this monorepo's copy instead. Confirmed directly: anchoring at a linked NestJS
 * playground finds *its* `typescript@5.9.3`, and `createRequire`'s anchor need not exist as a real file (only its
 * directory is used), so `join(rootDir, 'package.json')` works whether or not that file is present.
 *
 * `typescript/bin/tsc` is an extensionless `#!/usr/bin/env node` script, not a native binary, so `resolveScriptBin`
 * turns it into `{ command: process.execPath, prefixArgs: [scriptPath] }` — Windows has no OS-level shebang
 * support. Both function parameters exist so the tests can force each fallback branch with a stub.
 */
export function resolveTscBinary(
  rootDir: string,
  resolvePackageJson: (specifier: string) => string = createRequire(join(rootDir, 'package.json')).resolve,
  fileExists: (path: string) => boolean = existsSync,
): TscInvocation | undefined {
  return resolveScriptBin({
    packageJsonSpecifier: 'typescript/package.json',
    binSegments: ['bin', 'tsc'],
    resolvePackageJson,
    fileExists,
  })
}

/**
 * Where the analysed repository's `typescript` was found, or why it could not be used.
 *
 * `ambiguous` exists because "pick the first one" is the wrong answer, not a convenient one. Reporting a
 * type error from a version the developer's own build does not use is the failure §13.1 forbids, and it
 * would be indistinguishable from a real finding.
 */
export type TscResolution =
  | { readonly kind: 'resolved'; readonly invocation: TscInvocation; readonly version: string; readonly fromDir: string }
  | { readonly kind: 'ambiguous'; readonly versions: readonly string[] }
  | { readonly kind: 'missing' }

/**
 * Resolves `typescript` from the repository root, and failing that from its workspace packages.
 *
 * The root is not where a workspace monorepo keeps it. pnpm links a dependency only into the package that
 * declares it, so a repository whose root manifest lists no `typescript` cannot resolve one from the root
 * even though every one of its packages can — measured on two real monorepos, where the root failed and
 * `apps/backend` and `apps/api` resolved `typescript@5.9.3` and `@6.0.3`. Before this, both were told
 * "no `typescript` is installed in this project", which was false, and `types.type-error` — in
 * `recommended` — was silently unchecked.
 *
 * Packages are consulted in the order the workspace graph lists them, and every one is consulted rather
 * than stopping at the first hit: stopping early cannot tell one version from several, and several is the
 * case that must not be resolved by guessing. pnpm's `catalog:` protocol makes agreement the normal
 * outcome, since the version is then declared once for the whole repository.
 */
export function resolveTscAcrossWorkspaces(
  rootDir: string,
  workspaceDirs: readonly string[],
  resolveIn: (dir: string) => TscInvocation | undefined = (dir) => resolveTscBinary(dir),
  readVersion: (invocation: TscInvocation) => string | undefined = versionOfResolvedTypescript,
): TscResolution {
  const fromRoot = resolveIn(rootDir)
  if (fromRoot !== undefined) {
    return { kind: 'resolved', invocation: fromRoot, version: readVersion(fromRoot) ?? 'unknown', fromDir: rootDir }
  }

  const byVersion = new Map<string, { invocation: TscInvocation; fromDir: string }>()
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

/** `prefixArgs[0]` is `<package>/bin/tsc` by construction — `resolveScriptBin` is given those segments. */
function versionOfResolvedTypescript(invocation: TscInvocation): string | undefined {
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
