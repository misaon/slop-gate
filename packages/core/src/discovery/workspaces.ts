import { glob, readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import picomatch from 'picomatch'
import { parse as parseYaml } from 'yaml'

export type WorkspaceNode = {
  readonly name: string
  /** Repo-relative POSIX directory; empty string for the root. */
  readonly dir: string
}

export type WorkspaceGraph = {
  readonly nodes: readonly WorkspaceNode[]
  attribute(relativePath: string): WorkspaceNode
}

const toPosix = (value: string): string => value.replaceAll('\\', '/')

const readJson = async (path: string): Promise<Record<string, unknown> | null> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

async function readPatterns(rootDir: string): Promise<string[]> {
  const pnpmFile = join(rootDir, 'pnpm-workspace.yaml')
  try {
    const parsed = parseYaml(await readFile(pnpmFile, 'utf8')) as { packages?: unknown }
    if (Array.isArray(parsed?.packages)) return parsed.packages.filter((p): p is string => typeof p === 'string')
  } catch {
    // No pnpm workspace file; fall through to package.json.
  }

  const rootPackage = await readJson(join(rootDir, 'package.json'))
  const workspaces = rootPackage?.['workspaces']
  if (Array.isArray(workspaces)) return workspaces.filter((p): p is string => typeof p === 'string')
  if (typeof workspaces === 'object' && workspaces !== null) {
    const nested = (workspaces as { packages?: unknown }).packages
    if (Array.isArray(nested)) return nested.filter((p): p is string => typeof p === 'string')
  }
  return []
}

export async function buildWorkspaceGraph(rootDir: string): Promise<WorkspaceGraph> {
  const rootPackage = await readJson(join(rootDir, 'package.json'))
  const rootNode: WorkspaceNode = {
    name: typeof rootPackage?.['name'] === 'string' ? rootPackage['name'] : 'root',
    dir: '',
  }

  const patterns = await readPatterns(rootDir)
  const positive = patterns.filter((p) => !p.startsWith('!'))
  const negated = patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1))
  const isExcluded = negated.length > 0 ? picomatch(negated) : () => false

  const found = new Map<string, WorkspaceNode>()
  for (const pattern of positive) {
    for await (const match of glob(`${pattern}/package.json`, { cwd: rootDir })) {
      const dir = toPosix(dirname(match))
      if (dir === '.' || isExcluded(dir) || found.has(dir)) continue
      const manifest = await readJson(join(rootDir, match))
      const name = typeof manifest?.['name'] === 'string' ? manifest['name'] : dir.slice(dir.lastIndexOf('/') + 1)
      found.set(dir, { name, dir })
    }
  }

  const nodes = [rootNode, ...found.values()]
  const byDepth = [...found.values()].sort((a, b) => b.dir.length - a.dir.length)

  return {
    nodes,
    attribute(relativePath) {
      const path = toPosix(relativePath)
      return byDepth.find((node) => path.startsWith(`${node.dir}/`)) ?? rootNode
    },
  }
}

export function relativePosix(root: string, absolute: string): string {
  return toPosix(relative(root, absolute))
}
