import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

/** Alias of the shared `ScriptBinInvocation` shape kept as its own name, matching `engine-oxlint`'s `OxlintInvocation` and `engine-tsc`'s `TscInvocation`. */
export type KnipInvocation = ScriptBinInvocation

const require = createRequire(import.meta.url)

/**
 * The one place this adapter genuinely diverges from `resolveOxlintBinary` and `resolveTscBinary`.
 * Both of those hand `resolveScriptBin` a plain `require.resolve`, because both `oxlint` and
 * `typescript` export `./package.json` from their own `exports` maps. **knip does not**: its map
 * lists exactly `.` and `./session`, so `require.resolve('knip/package.json')` throws
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` — verified directly against knip 6.31.0, and pinned by a test so a
 * future release that adds the export is noticed rather than silently tolerated.
 *
 * Left to `resolveScriptBin`'s own `try`/`catch`, that throw degrades straight to the bare `knip`
 * fallback command, which relies on `node_modules/.bin` being on the spawned child's `PATH` —
 * something a globally- or `npx`-installed `sgate` has no reason to guarantee, and which would fail
 * as a bare `ENOENT` with no hint that the *bundled* knip was sitting right there all along. So the
 * manifest is reached the other way round instead: resolve the package's `.` entry point (`dist/index.js`,
 * which the exports map does list) and walk up to its own directory. `resolve` normalises the `..`
 * away eagerly so the returned path is the real manifest, not a `dist/../package.json` spelling of it.
 *
 * The specifier parameter is accepted and ignored on purpose: this function's only caller is
 * `resolveScriptBin`, whose `resolvePackageJson` contract passes `packageJsonSpecifier` through, and
 * matching that signature is what lets knip's odd resolution be swapped in without special-casing the
 * shared helper for one engine.
 */
export function resolveKnipPackageJson(_specifier: string): string {
  return resolve(dirname(require.resolve('knip')), '..', 'package.json')
}

/**
 * Resolves how to invoke the *bundled* `knip` CLI. knip is a plain `dependencies` entry of this
 * package (spec §13.1's "bundled"), never a peer: unlike `typescript`, no repository has knip
 * installed by default, and there is no editor surface whose results ours must agree with — the
 * argument that makes `tsc` a peer runs the other way here. See §13.2 of the design spec.
 *
 * `knip/bin/knip.js` is a `#!/usr/bin/env node` script. The `.js` extension makes it *look* unlike
 * the extensionless `bin/oxlint` and `bin/tsc`, but it is the same trap: Windows has no OS-level
 * shebang support and `CreateProcess` cannot launch a `.js` file as an image, so handing the resolved
 * path straight to `execFile` fails there while working fine on POSIX. `resolveScriptBin`
 * (`@misaon/slop-gate-core`) turns it into `{ command: process.execPath, prefixArgs: [scriptPath] }`,
 * which is what the shebang already does on POSIX, made explicit and portable.
 *
 * Both parameters exist only so `resolve-binary.test.ts` can force each fallback branch with a stub,
 * mirroring the other two adapters' own tests.
 */
export function resolveKnipBinary(
  resolvePackageJson: (specifier: string) => string = resolveKnipPackageJson,
  fileExists: (path: string) => boolean = existsSync,
): KnipInvocation {
  return resolveScriptBin({
    packageJsonSpecifier: 'knip/package.json',
    binSegments: ['bin', 'knip.js'],
    fallbackCommand: 'knip',
    resolvePackageJson,
    fileExists,
  })
}
