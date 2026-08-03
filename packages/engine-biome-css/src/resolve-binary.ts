import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolveScriptBin, type ScriptBinInvocation } from '@misaon/slop-gate-core'

export type BiomeInvocation = ScriptBinInvocation

/**
 * Resolves how to invoke the bundled `@biomejs/biome` CLI.
 *
 * `bin/biome` is a `#!/usr/bin/env node` script that picks the matching `@biomejs/cli-<platform>`
 * package and spawns the native binary out of it, so it needs the same Windows `node <script>` treatment
 * as `bin/oxlint` and `bin/tsc`. Unlike `knip`, `@biomejs/biome` publishes no `exports` map, so
 * `require.resolve('@biomejs/biome/package.json')` resolves directly with no workaround.
 *
 * **Deliberately not the ast-grep treatment.** That adapter resolves the platform package itself because
 * `@ast-grep/cli`'s bin path is a JS shim only until a `postinstall` overwrites it, and pnpm 10 blocks
 * that script by default. Biome has no postinstall: the shim is the permanent entry point and resolves
 * the platform package at run time. Eight platform packages including both musl variants, so no libc
 * gap either.
 */
export function resolveBiomeBinary(
  resolvePackageJson: (specifier: string) => string = createRequire(import.meta.url).resolve,
  fileExists: (path: string) => boolean = existsSync,
): BiomeInvocation | undefined {
  return resolveScriptBin({
    packageJsonSpecifier: '@biomejs/biome/package.json',
    binSegments: ['bin', 'biome'],
    resolvePackageJson,
    fileExists,
  })
}
