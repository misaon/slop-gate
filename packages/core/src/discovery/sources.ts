import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import ignore, { type Ignore } from 'ignore'
import { toPosix } from '../paths.ts'

const run = promisify(execFile)

export type FileSource = {
  readonly id: 'git' | 'walk'
  list(rootDir: string, signal: AbortSignal): Promise<string[]>
}

const ALWAYS_SKIPPED = new Set(['.git', 'node_modules', '.turbo', 'dist', '.slop-gate'])

export function isAlwaysSkippedPath(path: string): boolean {
  return path.split('/').some((segment) => ALWAYS_SKIPPED.has(segment))
}

export function createGitFileSource(): FileSource {
  return {
    id: 'git',
    async list(rootDir, signal) {
      const { stdout } = await run(
        'git',
        ['ls-files', '-co', '--exclude-standard', '-z', '--deduplicate'],
        { cwd: rootDir, signal, maxBuffer: 1024 * 1024 * 256, encoding: 'utf8' },
      )
      return stdout.split('\0').filter((entry) => entry.length > 0)
    },
  }
}

type GitignoreLevel = { readonly base: string; readonly matcher: Ignore }

async function readGitignore(rootDir: string, relativeDir: string): Promise<Ignore | null> {
  const content = await readFile(join(rootDir, relativeDir, '.gitignore'), 'utf8').catch(() => null)
  return content === null ? null : ignore().add(content)
}

function isGitignored(levels: readonly GitignoreLevel[], path: string, isDirectory: boolean): boolean {
  let ignored = false
  for (const { base, matcher } of levels) {
    const relative = base === '' ? path : path.slice(base.length + 1)
    const result = matcher.test(isDirectory ? `${relative}/` : relative)
    if (result.ignored) ignored = true
    else if (result.unignored) ignored = false
  }
  return ignored
}

export function createWalkFileSource(): FileSource {
  return {
    id: 'walk',
    async list(rootDir, signal) {
      const found: string[] = []

      const visit = async (relativeDir: string, levels: readonly GitignoreLevel[]): Promise<void> => {
        signal.throwIfAborted()
        const [entries, here] = await Promise.all([
          readdir(join(rootDir, relativeDir), { withFileTypes: true }),
          readGitignore(rootDir, relativeDir),
        ])
        const nextLevels = here === null ? levels : [...levels, { base: relativeDir, matcher: here }]

        await Promise.all(
          entries.map(async (entry) => {
            if (ALWAYS_SKIPPED.has(entry.name)) return
            const child = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`
            const isDirectory = entry.isDirectory()
            if (isGitignored(nextLevels, child, isDirectory)) return
            if (isDirectory) return visit(child, nextLevels)
            if (entry.isFile()) found.push(child)
          }),
        )
      }

      await visit('', [])
      return found.map(toPosix)
    },
  }
}

export async function selectFileSource(rootDir: string): Promise<FileSource> {
  try {
    const { stdout } = await run('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: rootDir,
      encoding: 'utf8',
    })
    return stdout.trim() === 'true' ? createGitFileSource() : createWalkFileSource()
  } catch {
    return createWalkFileSource()
  }
}
