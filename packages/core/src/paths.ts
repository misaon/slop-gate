import { realpath } from 'node:fs/promises'
import { relative } from 'node:path'

/** Public data structures carry POSIX separators regardless of the host platform. */
export function toPosix(value: string): string {
  return value.replaceAll('\\', '/')
}

export function relativePosix(root: string, absolute: string): string {
  return toPosix(relative(root, absolute))
}

/**
 * A path as a tool reported it, turned into the repo-relative POSIX form `RawDiagnostic.file` requires
 * — the path reaches fingerprints (§10.1), the cache key and the baseline, so an absolute one would
 * make all three machine-specific and give two developers on the same commit different fingerprints
 * for the same finding.
 *
 * **A relative path is returned unchanged rather than run through `relative()`.** Every adapter spawns
 * its tool with `cwd: context.rootDir`, so the common case is already repo-relative, and `relative()`
 * would resolve such a path against `process.cwd()` — producing a path that describes whoever started
 * the process. The absolute branch is what runs when a tool reports resolved paths anyway (oxlint
 * always does; ast-grep, tsc and knip do only if handed absolute arguments).
 *
 * A Windows drive prefix counts as absolute: `startsWith('/')` alone would pass `C:\repo\src\a.ts`
 * through as if it were relative.
 */
export function toRepoRelative(filename: string, rootDir: string): string {
  const normalized = toPosix(filename)
  if (!normalized.startsWith('/') && !/^[a-z]:\//i.test(normalized)) return normalized
  return relativePosix(toPosix(rootDir), normalized)
}

/**
 * Every absolute path a tool could name a run's own directories by — for the adapters that strip
 * prefixes out of output rather than relativising against a root (`actionlint`, `hadolint`).
 *
 * **The resolved forms are included, and that is the whole reason this is not a two-element array.** A
 * tool that reports the real path of a file rather than the path it was handed names a directory the
 * run never mentioned: `/tmp` is `/private/tmp` on macOS, which every test on that platform hits, and a
 * symlinked checkout does the same anywhere. A missed prefix leaves an absolute path in a message or a
 * `file`, and those reach fingerprints (§10.1), the cache key and the baseline.
 *
 * A directory that cannot be resolved is skipped rather than raised: it cannot appear in output either.
 */
export async function absolutePrefixes(dirs: { readonly rootDir: string; readonly tmpDir: string }): Promise<readonly string[]> {
  const declared = [dirs.rootDir, dirs.tmpDir]
  const prefixes = [...declared]
  for (const path of declared) {
    try {
      prefixes.push(await realpath(path))
    } catch {
      // A path that cannot be resolved cannot appear in output either.
    }
  }
  return prefixes
}
