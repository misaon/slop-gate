import { readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { compareStrings } from '@misaon/slop-gate-core'

export type DiscoverProjectsOptions = {
  readonly rootDir: string
  readonly tsconfigPath: string
  readonly workspaceDirs: readonly string[]
}

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

  for (const reference of references) await collect(await asTsconfigPath(dirname(tsconfigPath), reference), found, seen)
}

async function asTsconfigPath(baseDir: string, reference: string): Promise<string> {
  const target = isAbsolute(reference) ? reference : resolve(baseDir, reference)
  const isDirectory = await stat(target).then((entry) => entry.isDirectory(), () => false)
  return isDirectory ? join(target, 'tsconfig.json') : target
}

function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '')
}

function referencesOf(source: string): readonly string[] {
  const block = /"references"\s*:\s*\[([\s\S]*?)\]/.exec(withoutComments(source))?.[1]
  return block === undefined ? [] : [...block.matchAll(/"path"\s*:\s*"([^"]+)"/g)].map(([, path]) => path ?? '')
}

function declaresOwnInputs(source: string): boolean {
  const scanned = withoutComments(source)
  const emptyFiles = /"files"\s*:\s*\[\s*\]/.test(scanned)
  const hasInclude = /"include"\s*:\s*\[\s*"/.test(scanned)
  return hasInclude || !emptyFiles
}
