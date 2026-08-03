import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { ScriptBinInvocation } from '@misaon/slop-gate-core'

/** Alias of the shared `ScriptBinInvocation` shape, matching `engine-oxlint`'s `OxlintInvocation` and the other two adapters'. */
export type AstGrepInvocation = ScriptBinInvocation

/**
 * `@ast-grep/cli`'s own `optionalDependencies`, transcribed from its manifest (0.45.0) and keyed the
 * way its `postinstall.js` keys them. Seven entries; there is deliberately no musl Linux build
 * upstream, which `resolveAstGrepBinary` handles rather than papers over.
 */
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
  /** False on musl (Alpine); upstream ships no musl build, so the `-gnu` package would be present-but-unrunnable. */
  isGlibc?: () => boolean
  /** Resolves a specifier as seen from `@ast-grep/cli`'s own directory — where its platform packages actually live. */
  resolveFromCli?: (specifier: string, cliDir: string) => string
  resolveCliPackageJson?: () => string
  fileExists?: (path: string) => boolean
}

/**
 * Resolves how to spawn ast-grep. **The one adapter in this repository that must not go through
 * `resolveScriptBin`**, and the reason is worth stating because the failure it avoids is silent on
 * the machine you develop on and fatal on the one that installs differently.
 *
 * `resolveScriptBin` always returns `{ command: process.execPath, prefixArgs: [script] }` — correct
 * for `bin/oxlint`, `bin/tsc` and `bin/knip.js`, which are all `#!/usr/bin/env node` scripts. The
 * file at `@ast-grep/cli/ast-grep` is *not* one thing: the published tarball ships a small JS
 * fallback shim there, and the package's `postinstall` **overwrites that file in place** with the
 * native binary hardlinked out of the matching platform package. So whether `node <that path>` works
 * depends entirely on whether a lifecycle script ran — and under pnpm 10 it does not, because build
 * scripts are blocked unless a package is listed in `onlyBuiltDependencies` (confirmed on this
 * repository: `Ignored build scripts: @ast-grep/cli@0.45.0`). Prefixing `node` would work today here
 * and break the moment someone runs `pnpm approve-builds`, or installs with npm.
 *
 * Resolving the platform package directly sidesteps the whole question: that file is unambiguously a
 * native executable in both cases, and it is what the shim itself spawns. It also skips the shim's
 * own cost — a second Node process per invocation, plus a `[warn] postinstall script did not run`
 * line on stderr every time.
 *
 * The platform package is resolved *from `@ast-grep/cli`'s own directory*, not from this one. Under
 * pnpm's non-hoisted layout it is a dependency of that package and is not reachable from here
 * (verified: `MODULE_NOT_FOUND` from this package, resolves from the CLI's directory). This mirrors
 * what `postinstall.js` does with `{ paths: [__dirname] }`.
 *
 * **A bare `ast-grep` on `PATH` is the answer to exactly one question, and `undefined` is the answer
 * to the other.** Upstream publishes no musl build and nothing for platforms outside the seven above,
 * so on those a `PATH` binary is not a substitution for something we shipped — it is the only ast-grep
 * that can exist, and refusing it would remove the engine from Alpine outright. Every *other* failure
 * (the optional dependency skipped with `--no-optional`, the platform package present but its binary
 * missing, resolution throwing) is a broken install of a package this one bundles, and there the bare
 * command silently swaps an unknown ast-grep version for the pinned one — the same silent substitution
 * `resolveScriptBin` no longer offers the other three adapters. `createAstGrepEngine` turns
 * `undefined` into an `EngineError` naming the package.
 *
 * Every parameter exists so `resolve-binary.test.ts` can drive each branch without uninstalling
 * anything, exactly as the other adapters' resolvers do.
 */
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
  // `createRequire` needs a file path to anchor to; the file need not exist, only its directory.
  return createRequire(join(cliDir, 'noop.cjs')).resolve(specifier)
}

/**
 * `glibcVersionRuntime` is present in Node's process report on glibc and absent on musl — the same
 * signal `detect-libc` reports, without taking a dependency on it to answer one question.
 */
function defaultIsGlibc(): boolean {
  const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined
  return report?.header?.glibcVersionRuntime !== undefined
}
