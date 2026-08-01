import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * How to spawn oxlint as a child process: `command` is the executable to launch, and `prefixArgs`
 * are argv entries that must come before whatever CLI arguments the caller appends (e.g. `--config`,
 * file paths). Two fields rather than one command string so a resolved invocation can insert
 * `node <script>` ahead of the caller's own argv without string-splitting or shell-quoting anything.
 */
export type OxlintInvocation = {
  readonly command: string
  readonly prefixArgs: readonly string[]
}

/**
 * Resolves how to invoke the installed `oxlint` package's CLI. Used by both `createOxlintEngine`
 * (this package) and `packages/core/scripts/generate-registry.ts`, which used to each carry their own
 * copy of this logic — the generator's copy additionally lacked the fallback below entirely.
 *
 * `oxlint`'s package.json declares an `exports` map that does not list `./bin/oxlint`, so
 * `require.resolve('oxlint/bin/oxlint')` always throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. `./package.json`
 * *is* exported, so resolve that and join the package's own documented `bin/oxlint` path instead.
 *
 * That resolved file is a `#!/usr/bin/env node` ES module script (`import "../dist/cli.js"`) with no
 * file extension — it is not, and on no platform ever is, a native executable. Every platform's
 * `optionalDependencies` entry (`@oxlint/binding-win32-x64-msvc`, `@oxlint/binding-darwin-arm64`,
 * ...) ships only a `.node` NAPI addon that `dist/bindings.js` `require()`s *from inside* the running
 * Node process — there is no standalone, directly spawnable `oxlint` executable on any platform,
 * Windows included. POSIX can run the extensionless script directly because the kernel honours its
 * shebang line and re-execs `node` on our behalf; Windows has no OS-level shebang support, so handing
 * `spawn`/`execFile` the bare resolved path fails with `ENOENT` even though the file exists (confirmed:
 * `bin/oxlint`'s own content is exactly the two lines above, and Node's own "no shebang support" gap
 * on Windows is what CI's `spawnSync ... oxlint ENOENT` reported — not reproducible on this host since
 * it isn't Windows, see the report for the full chain of evidence).
 *
 * Spawning the resolved script through the *same* Node binary already running this process
 * (`process.execPath`) instead of asking the OS to interpret the file sidesteps that gap uniformly —
 * it is exactly what the shebang already does on POSIX, made explicit. Nothing here is Windows-only:
 * the same `{ command: process.execPath, prefixArgs: [scriptPath] }` shape is returned regardless of
 * host platform, which is what lets `resolve-binary.test.ts` exercise the exact path Windows relies on
 * from a POSIX test runner, and what already lets all 395 pre-existing tests exercise this same
 * function in `index.test.ts`'s real-binary tests rather than a Windows-only branch nothing else runs.
 *
 * Falls back to the bare `'oxlint'` command, spawned directly with no prefix args, if resolution
 * fails entirely (e.g. `oxlint` is not resolvable as a package from this module's location, or its
 * `package.json` resolves but `bin/oxlint` itself is missing — an incomplete or corrupted install)
 * — relying on the caller's `PATH` to provide it, unchanged from this function's original behaviour.
 *
 * The `existsSync` check earning that second fallback case matters specifically *because* of the
 * `node <script>` strategy above: once oxlint is invoked as `node scriptPath`, a missing `scriptPath`
 * makes *Node* fail to find the entry module — and Node's own "module not found" launch failure exits
 * with code `1`, indistinguishable by exit code alone from oxlint's own "exited 1 because it found
 * lint issues" convention (`MAX_FINDINGS_EXIT_CODE` in ./index.ts). Silently falling into that branch
 * would misreport a broken install as "this file has zero findings" instead of surfacing an
 * `EngineError` — confirmed directly: `execFile(process.execPath, ['/nonexistent/path'])` fails with
 * a *numeric* `err.code === 1`, not the string `'ENOENT'` a directly-missing command produces, so the
 * existing `typeof failure.code === 'number'` check in ./index.ts's `execute()` would not catch it.
 * Verifying the file actually exists before committing to the `node`-prefixed invocation keeps that
 * failure mode routed through the bare-`'oxlint'` fallback instead, where a real absence still ends up
 * as a genuine ENOENT (string-coded) and therefore a proper `EngineError`, same as before this
 * function existed.
 *
 * `resolvePackageJson` and `fileExists` default to the real `createRequire(import.meta.url).resolve`
 * and `existsSync`, and only take parameters so resolve-binary.test.ts can force each fallback branch
 * with a stub, without needing to actually uninstall `oxlint`, corrupt its install, or mock built-ins.
 */
export function resolveOxlintBinary(
  resolvePackageJson: (specifier: string) => string = createRequire(import.meta.url).resolve,
  fileExists: (path: string) => boolean = existsSync,
): OxlintInvocation {
  try {
    const scriptPath = join(dirname(resolvePackageJson('oxlint/package.json')), 'bin', 'oxlint')
    if (!fileExists(scriptPath)) return { command: 'oxlint', prefixArgs: [] }
    return { command: process.execPath, prefixArgs: [scriptPath] }
  } catch {
    return { command: 'oxlint', prefixArgs: [] }
  }
}
