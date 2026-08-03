import { glob, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import picomatch from 'picomatch'
import { parse as parseYaml } from 'yaml'
import { ConfigError } from '../errors.ts'
import { relativePosix, toPosix } from '../paths.ts'

export type WorkspaceNode = {
  readonly name: string
  /** Repo-relative POSIX directory; empty string for the root. */
  readonly dir: string
}

export type WorkspaceGraph = {
  readonly nodes: readonly WorkspaceNode[]
  attribute(relativePath: string): WorkspaceNode
}

const readJson = async (path: string): Promise<Record<string, unknown> | null> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

async function readPatterns(rootDir: string): Promise<string[]> {
  const pnpmFile = join(rootDir, 'pnpm-workspace.yaml')
  const pnpmSource = await readFile(pnpmFile, 'utf8').catch(() => null)

  // A missing file legitimately means "not a pnpm workspace". A malformed one does not: swallowing
  // it would silently produce a root-only graph, so every file attributes to the root and any
  // per-workspace config is ignored without explanation.
  if (pnpmSource !== null) {
    let parsed: { packages?: unknown }
    try {
      parsed = parseYaml(pnpmSource) as { packages?: unknown }
    } catch (cause) {
      throw new ConfigError(`${pnpmFile} is not valid YAML`, { cause })
    }
    if (Array.isArray(parsed?.packages)) return parsed.packages.filter((p): p is string => typeof p === 'string')
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
      // Resolve then re-relativise so `..` is collapsed wherever it appears, not just at the
      // start. `WorkspaceNode.dir` is contractually repo-relative and downstream code joins it
      // onto the root, so a pattern like `../shared/*` or `packages/../../shared/*` must not
      // produce a node at all.
      const dir = relativePosix(rootDir, resolve(rootDir, dirname(match)))
      if (dir === '..' || dir.startsWith('../')) {
        throw new ConfigError(`workspace pattern "${pattern}" resolves outside the repository root`)
      }
      if (dir === '' || isExcluded(dir) || found.has(dir)) continue
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
