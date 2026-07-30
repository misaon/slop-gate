import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export type FileSource = {
  readonly id: 'git' | 'walk'
  list(rootDir: string, signal: AbortSignal): Promise<string[]>
}

const ALWAYS_SKIPPED = new Set(['.git', 'node_modules', '.turbo', 'dist', '.slop-gate'])

const toPosix = (value: string): string => value.replaceAll('\\', '/')

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

export function createWalkFileSource(): FileSource {
  return {
    id: 'walk',
    async list(rootDir, signal) {
      const found: string[] = []

      const visit = async (relativeDir: string): Promise<void> => {
        signal.throwIfAborted()
        const entries = await readdir(join(rootDir, relativeDir), { withFileTypes: true })
        await Promise.all(
          entries.map(async (entry) => {
            if (ALWAYS_SKIPPED.has(entry.name)) return
            const child = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`
            if (entry.isDirectory()) return visit(child)
            if (entry.isFile()) found.push(child)
          }),
        )
      }

      await visit('')
      return found.map(toPosix)
    },
  }
}

export async function selectFileSource(rootDir: string): Promise<FileSource> {
  try {
    await stat(join(rootDir, '.git'))
    await run('git', ['--version'])
    return createGitFileSource()
  } catch {
    return createWalkFileSource()
  }
}
