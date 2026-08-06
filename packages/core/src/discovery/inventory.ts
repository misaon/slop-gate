import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import ignore from 'ignore'
import type { LanguageId } from '../languages.ts'
import { compareStrings } from '../ordering.ts'
import { detectLanguage } from './language.ts'
import {
  createGitFileSource,
  createWalkFileSource,
  isAlwaysSkippedPath,
  selectFileSource,
  type FileSource,
} from './sources.ts'
import type { FileInventory, InventoryFile } from './types.ts'
import { buildWorkspaceGraph } from './workspaces.ts'

export { createGitFileSource, createWalkFileSource, selectFileSource, type FileSource }

export type BuildInventoryOptions = {
  rootDir: string
  ignore?: readonly string[]
  source?: FileSource
  signal?: AbortSignal
}

async function readSlopIgnore(rootDir: string): Promise<string[]> {
  const source = await readFile(join(rootDir, '.slopignore'), 'utf8').catch(() => null)
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

  const patterns = [...slopIgnorePatterns, ...(options.ignore ?? [])]
  const matcher = patterns.length > 0 ? ignore().add(patterns) : null
  const isIgnored = (path: string): boolean => matcher !== null && matcher.ignores(path)
  const languages = new Set<LanguageId>()
  const files: InventoryFile[] = []

  await Promise.all(
    paths.map(async (path) => {
      if (isAlwaysSkippedPath(path) || isIgnored(path)) return
      signal.throwIfAborted()

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
