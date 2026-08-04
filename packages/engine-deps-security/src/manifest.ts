import type { ByteRange } from '@misaon/slop-gate-core'

const DEPENDENCY_KEYS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const

export function findDependencyRange(source: string, name: string): ByteRange | undefined {
  const needle = JSON.stringify(name)
  for (const group of DEPENDENCY_KEYS) {
    const span = locateGroup(source, group)
    if (span === undefined) continue
    const found = locateKey(source, needle, span.start, span.end)
    if (found !== undefined) return { start: byteOffset(source, found), end: byteOffset(source, found + needle.length) }
  }
  return undefined
}

type Span = { readonly start: number; readonly end: number }

function locateGroup(source: string, group: string): Span | undefined {
  const key = `"${group}"`
  let depth = 0
  let inString = false

  for (let at = 0; at < source.length; at++) {
    const character = source[at]
    if (inString) {
      if (character === '\\') at++
      else if (character === '"') inString = false
      continue
    }
    if (character === '{') depth++
    else if (character === '}') depth--
    else if (character === '"') {
      inString = true
      if (depth !== 1 || !source.startsWith(key, at)) continue
      const colon = skipSpace(source, at + key.length)
      if (source[colon] !== ':') continue
      const brace = skipSpace(source, colon + 1)
      if (source[brace] !== '{') continue
      const end = matchBrace(source, brace)
      return end === undefined ? undefined : { start: brace + 1, end }
    }
  }
  return undefined
}

function locateKey(source: string, needle: string, start: number, end: number): number | undefined {
  for (let at = source.indexOf(needle, start); at !== -1 && at < end; at = source.indexOf(needle, at + 1)) {
    if (source[skipSpace(source, at + needle.length)] === ':') return at
  }
  return undefined
}

function matchBrace(source: string, open: number): number | undefined {
  let depth = 0
  let inString = false
  for (let at = open; at < source.length; at++) {
    const character = source[at]
    if (inString) {
      if (character === '\\') at++
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') depth++
    else if (character === '}' && --depth === 0) return at
  }
  return undefined
}

function skipSpace(source: string, from: number): number {
  let at = from
  while (at < source.length && /\s/.test(source[at] ?? '')) at++
  return at
}

function byteOffset(source: string, index: number): number {
  return new TextEncoder().encode(source.slice(0, index)).length
}
