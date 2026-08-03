import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

export type OxlintInvocation = ScriptBinInvocation

/**
 * Resolves how to invoke the bundled `oxlint` package's CLI. Used by both `createOxlintEngine` and
 * `packages/core/scripts/generate-registry.ts`.
 *
 * `oxlint`'s package.json declares an `exports` map that does not list `./bin/oxlint`, so
 * `require.resolve('oxlint/bin/oxlint')` always throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. `./package.json`
 * *is* exported, so resolve that and join the package's own documented `bin/oxlint` path instead —
 * `resolveScriptBin` does exactly this, plus the Windows shebang-spawn fix (`bin/oxlint` is an
 * extensionless `#!/usr/bin/env node` script, not a native executable on any platform) and the
 * corrupted-install guard. See its own doc comment.
 *
 * `undefined` when the bundled `oxlint` cannot be resolved. It used to be a bare `oxlint` for the child's
 * `PATH` to resolve, which meant a broken install of *this* package silently linted with whatever oxlint the
 * machine happened to have — a different version than the registry was generated from, whose rule ids and
 * categories `entries.generated.ts` no longer describes. Both parameters exist only so
 * resolve-binary.test.ts can force each unresolvable branch with a stub.
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
