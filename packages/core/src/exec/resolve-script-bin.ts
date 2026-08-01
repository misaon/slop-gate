import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * How to spawn a resolved package's bin script as a child process: `command` is the executable to
 * launch, and `prefixArgs` are argv entries that must come before whatever CLI arguments the caller
 * appends (e.g. `--config`, file paths). Two fields rather than one command string so a resolved
 * invocation can insert `node <script>` ahead of the caller's own argv without string-splitting or
 * shell-quoting anything.
 */
export type ScriptBinInvocation = {
  readonly command: string
  readonly prefixArgs: readonly string[]
}

export type ResolveScriptBinOptions = {
  /** Specifier passed to `resolvePackageJson`, e.g. `'oxlint/package.json'` or `'typescript/package.json'`. */
  packageJsonSpecifier: string
  /** Path segments from the resolved package directory to its bin script, e.g. `['bin', 'oxlint']`. */
  binSegments: readonly string[]
  /** Bare command to fall back to, relying on the caller's `PATH` — e.g. `'oxlint'` or `'tsc'`. */
  fallbackCommand: string
  resolvePackageJson: (specifier: string) => string
  fileExists?: (path: string) => boolean
}

/**
 * Resolves an npm package's own bin script for direct spawning, routing around the fact that a
 * `#!/usr/bin/env node` extensionless script cannot be spawned directly on Windows: there is no
 * OS-level shebang support there, so handing `spawn`/`execFile` the bare resolved path fails with
 * `ENOENT` even though the file exists, while POSIX runs it transparently because the kernel honours
 * the shebang line. Shared by `engine-oxlint` (`resolveOxlintBinary`, a fixed dependency resolved
 * relative to its own installed location) and `engine-tsc` (`resolveTscBinary`, a peer dependency
 * that must instead be resolved relative to the *analysed project's* directory) — both packages ship
 * a bin entry with exactly this shape, confirmed by reading `bin/oxlint` and `bin/tsc` directly: both
 * are `#!/usr/bin/env node` scripts with no file extension, nothing platform-specific about which
 * file gets resolved.
 *
 * Spawning the resolved script through the *same* Node binary already running this process
 * (`process.execPath`) instead of asking the OS to interpret the file sidesteps the gap uniformly, on
 * every platform — it is exactly what the shebang already does on POSIX, made explicit.
 *
 * Falls back to `fallbackCommand`, spawned directly with no prefix args, in two cases: resolution
 * fails entirely (the package is not resolvable from wherever `resolvePackageJson` looks), or the
 * package resolves but its bin script is missing on disk (an incomplete or corrupted install). The
 * `fileExists` check specifically guards a gap the `node <script>` strategy itself introduces: once
 * invoked as `node scriptPath`, a missing `scriptPath` makes *Node* fail to find the entry module, and
 * Node's own launch failure exits with a *numeric* code `1` — indistinguishable by exit code alone
 * from many engines' own "exited non-zero because it found findings" convention. Verifying the file
 * exists before committing to the `node`-prefixed invocation routes a genuine absence back through the
 * bare fallback command instead, where it produces a real, string-coded `ENOENT` an adapter's own
 * error handling already knows how to turn into an actionable failure.
 */
export function resolveScriptBin(options: ResolveScriptBinOptions): ScriptBinInvocation {
  const fileExists = options.fileExists ?? existsSync
  try {
    const scriptPath = join(dirname(options.resolvePackageJson(options.packageJsonSpecifier)), ...options.binSegments)
    if (!fileExists(scriptPath)) return { command: options.fallbackCommand, prefixArgs: [] }
    return { command: process.execPath, prefixArgs: [scriptPath] }
  } catch {
    return { command: options.fallbackCommand, prefixArgs: [] }
  }
}
