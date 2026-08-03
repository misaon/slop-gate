import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import ignore from 'ignore'
import type { LanguageId } from '../languages.ts'
import { compareStrings } from '../ordering.ts'
import { detectLanguage } from './language.ts'
import { ALWAYS_SKIPPED, createGitFileSource, createWalkFileSource, selectFileSource, type FileSource } from './sources.ts'
import type { FileInventory, InventoryFile } from './types.ts'
import { buildWorkspaceGraph } from './workspaces.ts'

export { createGitFileSource, createWalkFileSource, selectFileSource, type FileSource }

export type BuildInventoryOptions = {
  rootDir: string
  ignore?: readonly string[]
  source?: FileSource
  signal?: AbortSignal
}

/**
 * True when some segment of `path` (including the leaf) is one of `ALWAYS_SKIPPED` — mirroring the walker's own
 * per-entry check in `./sources.ts`. Applied here rather than trusted to each `FileSource` because the git source
 * has no directory-traversal step to prune: `git ls-files -co --exclude-standard` happily lists
 * `.slop-gate/cache/**` as untracked, non-ignored content until `sgate init` has written `.slop-gate/.gitignore`,
 * and `check` must produce a correct inventory without depending on `init` having run first.
 */
function isAlwaysSkipped(path: string): boolean {
  return path.split('/').some((segment) => ALWAYS_SKIPPED.has(segment))
}

async function readSlopIgnore(rootDir: string): Promise<string[]> {
  const source = await readFile(join(rootDir, '.slopignore'), 'utf8').catch(() => null)
  // Spec section 7 pairs `.slopignore` with config `ignore`, so a repository can exclude paths without touching
  // its config file or its `.gitignore`. Lines are real gitignore patterns, left whole for the `ignore` package
  // below to parse rather than pre-filtered here: it already implements blank lines and `#` comments (including a
  // `\#`-escaped literal hash and trailing-whitespace trimming), and a hand-rolled subset would drift from it on
  // exactly the edge cases that make hand-rolled ignore parsing worth avoiding.
  return source === null ? [] : source.split('\n')
}

export async function buildInventory(options: BuildInventoryOptions): Promise<FileInventory> {
  const signal = options.signal ?? new AbortController().signal
  const source = options.source ?? (await selectFileSource(options.rootDir))
  const [paths, workspaces, slopIgnorePatterns] = await Promise.all([
    source.list(options.rootDir, signal),
    buildWorkspaceGraph(options.rootDir),
    readSlopIgnore(options.rootDir),
  ])

  // `.slopignore` and config `ignore` are one combined rule set, not two independently-applied ones: a path
  // either source excludes is excluded, and a `!negation` in either can re-include a path the other matched —
  // the same way two blocks appended to one `.gitignore` combine. Neither surface shadows the other.
  const patterns = [...slopIgnorePatterns, ...(options.ignore ?? [])]
  const matcher = patterns.length > 0 ? ignore().add(patterns) : null
  const isIgnored = (path: string): boolean => matcher !== null && matcher.ignores(path)
  const languages = new Set<LanguageId>()
  const files: InventoryFile[] = []

  await Promise.all(
    paths.map(async (path) => {
      if (isAlwaysSkipped(path) || isIgnored(path)) return
      signal.throwIfAborted()

      // A file vanishing mid-run is a benign race. A permission error is not: swallowing it would quietly shrink
      // the inventory, and every later stage would report a clean result for files it never saw.
      const stats = await stat(join(options.rootDir, path)).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      if (stats === null || !stats.isFile()) return

      const language = detectLanguage(path)
      languages.add(language)
      files.push({
        path,
        language,
        workspace: workspaces.attribute(path).dir,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      })
    }),
  )

  files.sort((a, b) => compareStrings(a.path, b.path))
  return { root: options.rootDir, files, languages, workspaces: workspaces.nodes }
}
