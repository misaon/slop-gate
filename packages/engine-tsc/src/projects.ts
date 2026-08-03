import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { compareStrings } from '@misaon/slop-gate-core'

export type DiscoverProjectsOptions = {
  /** Where a repository-wide search starts, and what `references` are resolved relative to. */
  readonly rootDir: string
  /** The nominal project, `<rootDir>/tsconfig.json` unless the user named another. */
  readonly tsconfigPath: string
  /** Absolute directories of the workspace packages, consulted only when there is no root tsconfig at all. */
  readonly workspaceDirs: readonly string[]
}

/**
 * Every tsconfig this run should typecheck, in `compareStrings` order.
 *
 * A monorepo is the normal case and it has no single project. Three shapes cover the ones measured on real
 * repositories: a plain root tsconfig that declares its own inputs (one project, the original behaviour); a
 * *solution* root, `{"files": [], "references": [...]}`, whose only content is the list of real projects; and
 * no root tsconfig at all, where each workspace package carries its own.
 *
 * **None of this guesses.** `references` and the workspace manifest are declarations the repository already
 * makes, so running all of them typechecks exactly what the developer's own build does — which is the
 * distinction from picking one tsconfig and calling the repository covered. Where there is nothing to read,
 * the answer is an empty list and the engine reports a coverage gap rather than inventing a project.
 *
 * References are followed transitively, because a solution may reference another solution, and through a
 * `seen` set, because a reference graph is allowed to be a DAG and the shared leaf must be typechecked once.
 */
export async function discoverTscProjects(options: DiscoverProjectsOptions): Promise<readonly string[]> {
  const found = new Set<string>()
  const seen = new Set<string>()

  await collect(options.tsconfigPath, found, seen)

  if (found.size === 0 && seen.size === 0) {
    for (const dir of options.workspaceDirs) await collect(join(dir, 'tsconfig.json'), found, seen)
  }

  return [...found].sort(compareStrings)
}

async function collect(tsconfigPath: string, found: Set<string>, seen: Set<string>): Promise<void> {
  if (seen.has(tsconfigPath)) return

  const source = await readFile(tsconfigPath, 'utf8').catch(() => undefined)
  if (source === undefined) return
  seen.add(tsconfigPath)

  const references = referencesOf(source)
  if (references.length === 0 || declaresOwnInputs(source)) {
    found.add(tsconfigPath)
    if (references.length === 0) return
  }

  // A config may both declare inputs and reference others — typecheck it *and* everything it points at.
  for (const reference of references) await collect(await asTsconfigPath(dirname(tsconfigPath), reference), found, seen)
}

/** A reference names either a directory holding `tsconfig.json` or the config file itself. */
async function asTsconfigPath(baseDir: string, reference: string): Promise<string> {
  const target = isAbsolute(reference) ? reference : resolve(baseDir, reference)
  const isDirectory = await stat(target).then((entry) => entry.isDirectory(), () => false)
  return isDirectory ? join(target, 'tsconfig.json') : target
}

/**
 * Read with a tolerant scan rather than `JSON.parse`: comments and trailing commas are legal in a tsconfig,
 * and a config this cannot parse should fall through to tsc's own error rather than be silently skipped.
 */
function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '')
}

function referencesOf(source: string): readonly string[] {
  const block = /"references"\s*:\s*\[([\s\S]*?)\]/.exec(withoutComments(source))?.[1]
  return block === undefined ? [] : [...block.matchAll(/"path"\s*:\s*"([^"]+)"/g)].map(([, path]) => path ?? '')
}

/** `files: []` with no `include` is the solution shape — nothing of its own for `tsc -p` to read. */
function declaresOwnInputs(source: string): boolean {
  const scanned = withoutComments(source)
  const emptyFiles = /"files"\s*:\s*\[\s*\]/.test(scanned)
  const hasInclude = /"include"\s*:\s*\[\s*"/.test(scanned)
  return hasInclude || !emptyFiles
}
