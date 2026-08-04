import { realpath } from 'node:fs/promises'
import { relative } from 'node:path'

export function toPosix(value: string): string {
  return value.replaceAll('\\', '/')
}

export function relativePosix(root: string, absolute: string): string {
  return toPosix(relative(root, absolute))
}

export function toRepoRelative(filename: string, rootDir: string): string {
  const normalized = toPosix(filename)
  if (!normalized.startsWith('/') && !/^[a-z]:\//i.test(normalized)) return normalized
  return relativePosix(toPosix(rootDir), normalized)
}

export async function absolutePrefixes(dirs: { readonly rootDir: string; readonly tmpDir: string }): Promise<readonly string[]> {
  const declared = [dirs.rootDir, dirs.tmpDir]
  const prefixes = [...declared]
  for (const path of declared) {
    try {
      prefixes.push(await realpath(path))
    } catch {
    }
  }
  return prefixes
}
