import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

/**
 * How to spawn oxlint as a child process: `command` is the executable to launch, and `prefixArgs`
 * are argv entries that must come before whatever CLI arguments the caller appends (e.g. `--config`,
 * file paths). Alias of the shared `ScriptBinInvocation` shape (`resolveScriptBin`,
 * `@misaon/slop-gate-core`) kept as its own name here so nothing outside this package has to know the
 * oxlint adapter's invocation type is shared with `engine-tsc`'s.
 */
export type OxlintInvocation = ScriptBinInvocation

/**
 * Resolves how to invoke the installed `oxlint` package's CLI. Used by both `createOxlintEngine`
 * (this package) and `packages/core/scripts/generate-registry.ts`, which used to each carry their own
 * copy of this logic — the generator's copy additionally lacked the fallback below entirely.
 *
 * `oxlint`'s package.json declares an `exports` map that does not list `./bin/oxlint`, so
 * `require.resolve('oxlint/bin/oxlint')` always throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. `./package.json`
 * *is* exported, so resolve that and join the package's own documented `bin/oxlint` path instead —
 * `resolveScriptBin` (`@misaon/slop-gate-core`) does exactly this, plus the Windows shebang-spawn fix
 * and the corrupted-install guard; see its own doc comment for the full chain of evidence (`bin/oxlint`
 * is a `#!/usr/bin/env node` script with no file extension, not a native executable on any platform).
 * Extracted there specifically because `engine-tsc`'s `resolveTscBinary` needs the identical fix for
 * `typescript/bin/tsc` — the same shape of script, confirmed by reading it directly — just resolved
 * from a different anchor (the analysed project's own directory, since `typescript` is a peer
 * dependency, rather than this package's own install location).
 *
 * `resolvePackageJson` and `fileExists` default to the real `createRequire(import.meta.url).resolve`
 * and `existsSync`, and only take parameters so resolve-binary.test.ts can force each fallback branch
 * with a stub, without needing to actually uninstall `oxlint`, corrupt its install, or mock built-ins.
 */
export function resolveOxlintBinary(
  resolvePackageJson: (specifier: string) => string = createRequire(import.meta.url).resolve,
  fileExists: (path: string) => boolean = existsSync,
): OxlintInvocation {
  return resolveScriptBin({
    packageJsonSpecifier: 'oxlint/package.json',
    binSegments: ['bin', 'oxlint'],
    fallbackCommand: 'oxlint',
    resolvePackageJson,
    fileExists,
  })
}
