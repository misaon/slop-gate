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
 * Returns `undefined` in two cases — resolution fails entirely (the package is not resolvable from
 * wherever `resolvePackageJson` looks), or the package resolves but its bin script is missing on disk
 * (an incomplete or corrupted install). The `fileExists` check specifically guards a gap the
 * `node <script>` strategy itself introduces: once invoked as `node scriptPath`, a missing `scriptPath`
 * makes *Node* fail to find the entry module, and Node's own launch failure exits with a *numeric*
 * code `1` — indistinguishable by exit code alone from many engines' own "exited non-zero because it
 * found findings" convention.
 *
 * **`undefined`, and deliberately not a bare command name for the caller's `PATH` to resolve.** This
 * function used to take a `fallbackCommand` and return `{ command: 'oxlint', prefixArgs: [] }` when it
 * could not find the bundled one, and every caller passed one. That is a silent substitution of an
 * unknown version for the pinned dependency the registry was generated against, and it produces
 * results describing the machine rather than the project — the exact class §13.1 forbids for `tsc`
 * ("uses the repo's own TypeScript version"), reached by accident for three engines that never
 * intended it. `engine-tsc` was already refusing its own fallback by inspecting the returned shape
 * (`prefixArgs.length > 0`), which worked and could only be written by someone who knew this
 * function's internals.
 *
 * Every caller here wraps a **bundled** dependency, so `undefined` means slop-gate's own installation
 * is incomplete — not a property of the analysed repository, and therefore not a coverage gap
 * (`Engine.availability`) either: a gap exits 0 and reports the repository as clean, which is the worst
 * available answer to "our linter is missing". Each adapter turns it into an `EngineError` naming the
 * package instead. A tool that is genuinely *not* bundled — actionlint, hadolint — resolves `PATH`
 * itself, deliberately and visibly, and never through this helper.
 */
export function resolveScriptBin(options: ResolveScriptBinOptions): ScriptBinInvocation | undefined {
  const fileExists = options.fileExists ?? existsSync
  try {
    const scriptPath = join(dirname(options.resolvePackageJson(options.packageJsonSpecifier)), ...options.binSegments)
    if (!fileExists(scriptPath)) return undefined
    return { command: process.execPath, prefixArgs: [scriptPath] }
  } catch {
    return undefined
  }
}
