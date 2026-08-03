import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export type WorktreeState =
  | { readonly state: 'clean' }
  | { readonly state: 'dirty'; readonly changed: readonly string[] }
  /** Not a git worktree at all — or `git` is not installed. There is nothing to recover a bad fix from. */
  | { readonly state: 'no-git' }
  /** Inside a repository, but git could not answer. Treated exactly like `dirty`. */
  | { readonly state: 'unknown'; readonly reason: string }

export type InspectWorktreeOptions = {
  /** Injectable for tests. Production shells out to `git` in `rootDir`. */
  run?: (args: readonly string[]) => Promise<string>
}

/**
 * Answers the one question spec §11's first safety rail asks: does the user have a `git diff` they could
 * use to separate `sgate fix`'s edits from their own, and to undo them?
 *
 * That framing is why **untracked files are not dirt** (`--untracked-files=no`). `sgate fix` only rewrites
 * files already in the inventory and creates nothing, so a stray build artifact cannot be mistaken for one
 * of its edits — refusing over it would be a rail firing on the wrong signal, and one users would learn to
 * pass `--allow-dirty` past reflexively. `'unknown'` exists for the mirror case: a git that answers
 * `rev-parse` then fails `status` is never rounded down to "clean", and the reason is surfaced so it reads
 * as a git failure rather than the user's own uncommitted work.
 */
export async function inspectWorktree(rootDir: string, options: InspectWorktreeOptions = {}): Promise<WorktreeState> {
  const run =
    options.run ??
    (async (args: readonly string[]) => (await exec('git', [...args], { cwd: rootDir, encoding: 'utf8' })).stdout)

  try {
    const inside = await run(['rev-parse', '--is-inside-work-tree'])
    if (inside.trim() !== 'true') return { state: 'no-git' }
  } catch {
    return { state: 'no-git' }
  }

  let status: string
  try {
    status = await run(['status', '--porcelain', '--untracked-files=no'])
  } catch (error) {
    return { state: 'unknown', reason: error instanceof Error ? error.message : String(error) }
  }

  const changed = status
    .split('\n')
    .filter((line) => line.trim() !== '')
    // Porcelain v1 is `XY <path>`, two status columns and a space. Slicing at a fixed offset rather
    // than splitting on whitespace is what keeps a path containing spaces intact.
    .map((line) => line.slice(3))
    // A rename is `old -> new`. The destination is the file that exists now, and so the only one an
    // inventory path could ever match.
    .map((path) => (path.includes(' -> ') ? path.slice(path.indexOf(' -> ') + 4) : path))
    .map((path) => (path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path))

  return changed.length === 0 ? { state: 'clean' } : { state: 'dirty', changed }
}
