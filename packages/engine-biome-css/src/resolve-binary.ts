import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

export type BiomeInvocation = ScriptBinInvocation

/**
 * Resolves how to invoke the bundled `@biomejs/biome` CLI.
 *
 * `bin/biome` is a `#!/usr/bin/env node` script that picks the matching `@biomejs/cli-<platform>`
 * package and spawns the native binary out of it — confirmed by reading it — so this is exactly the
 * shape `resolveScriptBin` exists for, and needs the same Windows `node <script>` treatment as
 * `bin/oxlint` and `bin/tsc`. Unlike `knip`, `@biomejs/biome` publishes no `exports` map at all, so
 * `require.resolve('@biomejs/biome/package.json')` resolves directly with no workaround.
 *
 * **Deliberately not the ast-grep treatment.** That adapter resolves the platform package itself and
 * spawns the native binary directly, because `@ast-grep/cli`'s bin path is a JS shim only until a
 * `postinstall` overwrites it — and pnpm 10 blocks that script by default, so whether `node <path>`
 * works depends on whether a lifecycle script ran. Biome has no postinstall: the shim is the real,
 * permanent entry point and resolves the platform package at run time. There is no install hazard to
 * route around, and eight platform packages including both musl variants means no libc gap either.
 */
export function resolveBiomeBinary(
  resolvePackageJson: (specifier: string) => string = createRequire(import.meta.url).resolve,
  fileExists: (path: string) => boolean = existsSync,
): BiomeInvocation {
  return resolveScriptBin({
    packageJsonSpecifier: '@biomejs/biome/package.json',
    binSegments: ['bin', 'biome'],
    fallbackCommand: 'biome',
    resolvePackageJson,
    fileExists,
  })
}
