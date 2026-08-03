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
 * Resolves how to invoke the bundled `oxlint` package's CLI. Used by both `createOxlintEngine`
 * (this package) and `packages/core/scripts/generate-registry.ts`, which used to each carry their own
 * copy of this logic.
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
 * `undefined` when the bundled `oxlint` cannot be resolved. It used to be a bare `oxlint` for the
 * child's `PATH` to resolve, which meant a broken install of *this* package silently linted with
 * whatever oxlint the machine happened to have — a different version than the registry was generated
 * from, whose rule ids and categories `entries.generated.ts` no longer describes. `oxlint` is a
 * `dependencies` entry of this package, so there is no legitimate case for that substitution.
 *
 * `resolvePackageJson` and `fileExists` default to the real `createRequire(import.meta.url).resolve`
 * and `existsSync`, and only take parameters so resolve-binary.test.ts can force each unresolvable
 * branch with a stub, without needing to actually uninstall `oxlint`, corrupt its install, or mock
 * built-ins.
 */
export function resolveOxlintBinary(
  resolvePackageJson: (specifier: string) => string = createRequire(import.meta.url).resolve,
  fileExists: (path: string) => boolean = existsSync,
): OxlintInvocation | undefined {
  return resolveScriptBin({
    packageJsonSpecifier: 'oxlint/package.json',
    binSegments: ['bin', 'oxlint'],
    resolvePackageJson,
    fileExists,
  })
}
