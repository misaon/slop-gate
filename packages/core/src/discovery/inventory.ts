import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import picomatch from 'picomatch'
import type { LanguageId } from '../languages.ts'
import { compareStrings } from '../ordering.ts'
import { detectLanguage } from './language.ts'
import { createGitFileSource, createWalkFileSource, selectFileSource, type FileSource } from './sources.ts'
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
 * Spec section 7 pairs `.slopignore` with config `ignore`. It exists so a repository can exclude
 * paths from analysis without touching its config file or its `.gitignore` — test fixtures holding
 * deliberately broken code being the motivating case. gitignore-style lines; blanks and `#`
 * comments skipped; an absent file means no patterns.
 */
async function readSlopIgnore(rootDir: string): Promise<string[]> {
  const source = await readFile(join(rootDir, '.slopignore'), 'utf8').catch(() => null)
  if (source === null) return []
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
}

export async function buildInventory(options: BuildInventoryOptions): Promise<FileInventory> {
  const signal = options.signal ?? new AbortController().signal
  const source = options.source ?? (await selectFileSource(options.rootDir))
  const [paths, workspaces] = await Promise.all([
    source.list(options.rootDir, signal),
    buildWorkspaceGraph(options.rootDir),
  ])

  const patterns = [...(await readSlopIgnore(options.rootDir)), ...(options.ignore ?? [])]
  const isIgnored = patterns.length > 0 ? picomatch(patterns, { dot: true }) : () => false
  const languages = new Set<LanguageId>()
  const files: InventoryFile[] = []

  await Promise.all(
    paths.map(async (path) => {
      if (isIgnored(path)) return
      signal.throwIfAborted()

      // A file vanishing mid-run is a benign race. A permission error is not: swallowing it would
      // quietly shrink the inventory, and every later stage would report a clean result for files
      // it never saw.
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
