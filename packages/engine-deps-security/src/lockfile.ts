import { parse as parseYaml } from 'yaml'
import { compareStrings } from '@misaon/slop-gate-core'

export const LOCKFILES = {
  npm: ['package-lock.json', 'npm-shrinkwrap.json'],
  pnpm: ['pnpm-lock.yaml'],
} as const

export const UNSUPPORTED_LOCKFILES: Readonly<Record<string, string>> = {
  'yarn.lock': 'yarn',
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
}

export type LockfileKind = keyof typeof LOCKFILES

export type ResolvedPackage = {
  readonly name: string
  readonly version: string
  readonly path: readonly string[]
}

export type ParsedLockfile = {
  readonly kind: LockfileKind
  readonly packages: readonly ResolvedPackage[]
  readonly directNames: ReadonlySet<string>
}

export class LockfileParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LockfileParseError'
  }
}

type Edges = Map<string, Map<string, string>>

export function parseLockfile(kind: LockfileKind, source: string): ParsedLockfile {
  return kind === 'npm' ? parseNpmLockfile(source) : parsePnpmLockfile(source)
}

const DEPENDENCY_GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const

type NpmEntry = {
  version?: string
  link?: boolean
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function parseNpmLockfile(source: string): ParsedLockfile {
  let document: { packages?: Record<string, NpmEntry>; lockfileVersion?: number }
  try {
    document = JSON.parse(source) as typeof document
  } catch (error) {
    throw new LockfileParseError(`package-lock.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  const entries = document.packages
  if (entries === undefined) {
    throw new LockfileParseError(
      `this lockfile has no \`packages\` map (lockfileVersion ${document.lockfileVersion ?? 'unknown'}); run \`npm install\` to upgrade it`,
    )
  }

  const versions = new Map<string, string>()
  const edges: Edges = new Map()
  const known = new Set<string>()
  for (const [path, entry] of Object.entries(entries)) {
    if (path === '') continue
    const name = nameFromNpmPath(path)
    if (name === undefined) continue
    known.add(name)
    if (entry.link === true || typeof entry.version !== 'string') continue
    versions.set(path, entry.version)
    edges.set(path, new Map(Object.entries({ ...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies })))
  }

  const root = entries['']
  const directNames = new Set<string>()
  const roots = new Map<string, string>()
  for (const group of DEPENDENCY_GROUPS) {
    for (const name of Object.keys(root?.[group] ?? {})) {
      if (!known.has(name)) continue
      directNames.add(name)
      const resolved = resolveNpmPath('', name, versions)
      if (resolved !== undefined) roots.set(resolved, name)
    }
  }

  const paths = walk(
    roots,
    (path) => {
      const out: { readonly to: string; readonly name: string }[] = []
      for (const name of (edges.get(path) ?? new Map()).keys()) {
        const resolved = resolveNpmPath(path, name, versions)
        if (resolved !== undefined) out.push({ to: resolved, name })
      }
      return out
    },
    [...roots.keys()],
  )

  const packages: ResolvedPackage[] = []
  for (const [path, version] of versions) {
    const name = nameFromNpmPath(path)
    if (name === undefined) continue
    packages.push({ name, version, path: paths.get(path) ?? [] })
  }
  return { kind: 'npm', packages: sortPackages(packages), directNames }
}

function resolveNpmPath(from: string, name: string, versions: ReadonlyMap<string, string>): string | undefined {
  const segments = from === '' ? [] : from.split('/')
  for (let depth = segments.length; depth >= 0; depth--) {
    const prefix = segments.slice(0, depth).join('/')
    const candidate = prefix === '' ? `node_modules/${name}` : `${prefix}/node_modules/${name}`
    if (versions.has(candidate)) return candidate
  }
  return undefined
}

function nameFromNpmPath(path: string): string | undefined {
  const marker = path.lastIndexOf('node_modules/')
  if (marker === -1) return undefined
  const name = path.slice(marker + 'node_modules/'.length)
  return name === '' ? undefined : name
}

type PnpmDocument = {
  importers?: Record<string, Record<string, Record<string, { version?: string }>>>
  snapshots?: Record<string, { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }>
  packages?: Record<string, unknown>
  lockfileVersion?: string | number
}

function parsePnpmLockfile(source: string): ParsedLockfile {
  let document: PnpmDocument
  try {
    // `uniqueKeys` is quadratic and over half the parse — 1,107 ms of immich's lockfile against 540 ms.
    // Off matches pnpm, which takes the last of a duplicate key in a file it generated itself.
    document = parseYaml(source, { uniqueKeys: false }) as PnpmDocument
  } catch (error) {
    throw new LockfileParseError(`pnpm-lock.yaml is not valid YAML: ${error instanceof Error ? error.message : String(error)}`)
  }

  const snapshots = document.snapshots ?? {}
  const nodes = Object.keys(snapshots).length > 0 ? snapshots : ((document.packages ?? {}) as typeof snapshots)

  const edges: Edges = new Map()
  for (const [key, entry] of Object.entries(nodes)) {
    edges.set(key, new Map(Object.entries({ ...entry?.dependencies, ...entry?.optionalDependencies })))
  }

  const directNames = new Set<string>()
  const roots = new Map<string, string>()
  for (const importer of Object.values(document.importers ?? {})) {
    for (const group of DEPENDENCY_GROUPS) {
      for (const [name, spec] of Object.entries(importer?.[group] ?? {})) {
        const version = spec?.version
        if (typeof version !== 'string') continue
        directNames.add(name)
        const key = findPnpmKey(name, version, edges)
        if (key !== undefined && !roots.has(key)) roots.set(key, name)
      }
    }
  }

  const paths = walk(
    roots,
    (key) => {
      const out: { readonly to: string; readonly name: string }[] = []
      for (const [name, version] of edges.get(key) ?? new Map()) {
        const target = findPnpmKey(name, version, edges)
        if (target !== undefined) out.push({ to: target, name })
      }
      return out
    },
    [...roots.keys()],
  )

  const packages: ResolvedPackage[] = []
  for (const key of edges.keys()) {
    const parsed = splitPnpmKey(key)
    if (parsed === undefined) continue
    packages.push({ name: parsed.name, version: parsed.version, path: paths.get(key) ?? [] })
  }
  return { kind: 'pnpm', packages: sortPackages(packages), directNames }
}

function findPnpmKey(name: string, version: string, edges: Edges): string | undefined {
  const exact = `${name}@${version}`
  if (edges.has(exact)) return exact
  const bare = `${name}@${stripPeerSuffix(version)}`
  return edges.has(bare) ? bare : undefined
}

export function splitPnpmKey(key: string): { readonly name: string; readonly version: string } | undefined {
  const bare = stripPeerSuffix(key)
  const separator = bare.lastIndexOf('@')
  if (separator <= 0) return undefined
  const name = bare.slice(0, separator)
  const version = bare.slice(separator + 1)
  if (name === '' || version === '') return undefined
  return { name, version }
}

function stripPeerSuffix(value: string): string {
  const paren = value.indexOf('(')
  return paren === -1 ? value : value.slice(0, paren)
}

function walk(
  roots: ReadonlyMap<string, string>,
  neighbours: (node: string) => readonly { readonly to: string; readonly name: string }[],
  queue: readonly string[],
): Map<string, readonly string[]> {
  const paths = new Map<string, readonly string[]>()
  for (const [node, name] of roots) paths.set(node, [name])

  let frontier = [...queue]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const node of frontier) {
      const prefix = paths.get(node) ?? []
      for (const edge of neighbours(node)) {
        if (paths.has(edge.to)) continue
        paths.set(edge.to, [...prefix, edge.name])
        next.push(edge.to)
      }
    }
    frontier = next
  }
  return paths
}

function sortPackages(packages: readonly ResolvedPackage[]): readonly ResolvedPackage[] {
  return [...packages].sort((left, right) => compareStrings(left.name, right.name) || compareStrings(left.version, right.version))
}

export type ManifestDependency = {
  readonly name: string
  readonly range: string
  readonly group: (typeof DEPENDENCY_GROUPS)[number]
}

export function manifestDependencies(source: string): readonly ManifestDependency[] {
  let manifest: Record<string, Record<string, string> | undefined>
  try {
    manifest = JSON.parse(source) as typeof manifest
  } catch {
    return []
  }

  const out: ManifestDependency[] = []
  for (const group of DEPENDENCY_GROUPS) {
    for (const [name, range] of Object.entries(manifest[group] ?? {})) {
      if (typeof range === 'string') out.push({ name, range, group })
    }
  }
  return out
}
