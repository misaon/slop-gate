import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

export type KnipInvocation = ScriptBinInvocation

const require = createRequire(import.meta.url)

/**
 * The one place this adapter genuinely diverges from `resolveOxlintBinary` and `resolveTscBinary`: both of
 * those hand `resolveScriptBin` a plain `require.resolve`, because `oxlint` and `typescript` export
 * `./package.json` from their own `exports` maps. **knip does not** — its map lists exactly `.` and
 * `./session`, so `require.resolve('knip/package.json')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`, verified
 * against knip 6.31.0 and pinned by a test so a future release that adds the export is noticed. Left to
 * `resolveScriptBin`'s own `try`/`catch` that throw makes the bundled knip unresolvable and the engine
 * fails the run with "reinstall slop-gate", while the bundled knip was sitting right there all along. So
 * the manifest is reached the other way round: resolve the package's `.` entry point, which the exports map
 * does list, and walk up to its own directory. The specifier parameter is ignored on purpose — it is here
 * to match `resolveScriptBin`'s `resolvePackageJson` contract.
 */
export function resolveKnipPackageJson(_specifier: string): string {
  return resolve(dirname(require.resolve('knip')), '..', 'package.json')
}

/**
 * Resolves how to invoke the *bundled* `knip` CLI. knip is a plain `dependencies` entry of this package
 * (spec §13.1's "bundled"), never a peer: unlike `typescript`, no repository has knip installed by default
 * and there is no editor surface whose results ours must agree with (§13.2).
 *
 * `knip/bin/knip.js` is a `#!/usr/bin/env node` script, and the `.js` extension makes it *look* unlike the
 * extensionless `bin/oxlint` and `bin/tsc` while being the same trap: Windows has no OS-level shebang
 * support and `CreateProcess` cannot launch a `.js` file as an image, so handing the resolved path straight
 * to `execFile` fails there while working fine on POSIX. `resolveScriptBin` turns it into
 * `{ command: process.execPath, prefixArgs: [scriptPath] }`. Both parameters exist only so
 * `resolve-binary.test.ts` can force each fallback branch with a stub.
 */
export function resolveKnipBinary(
  resolvePackageJson: (specifier: string) => string = resolveKnipPackageJson,
  fileExists: (path: string) => boolean = existsSync,
): KnipInvocation | undefined {
  return resolveScriptBin({
    packageJsonSpecifier: 'knip/package.json',
    binSegments: ['bin', 'knip.js'],
    resolvePackageJson,
    fileExists,
  })
}
