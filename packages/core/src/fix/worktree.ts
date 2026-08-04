import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export type WorktreeState =
  | { readonly state: 'clean' }
  | { readonly state: 'dirty'; readonly changed: readonly string[] }
  | { readonly state: 'no-git' }
  | { readonly state: 'unknown'; readonly reason: string }

export type InspectWorktreeOptions = {
  run?: (args: readonly string[]) => Promise<string>
}

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
    .map((line) => line.slice(3))
    .map((path) => (path.includes(' -> ') ? path.slice(path.indexOf(' -> ') + 4) : path))
    .map((path) => (path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path))

  return changed.length === 0 ? { state: 'clean' } : { state: 'dirty', changed }
}
