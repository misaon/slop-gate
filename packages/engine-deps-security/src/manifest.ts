import type { ByteRange } from '@misaon/slop-gate-core'

const DEPENDENCY_KEYS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const

/**
 * The byte range of one dependency's key inside a `package.json`. A finding that points at byte zero is one nobody
 * can act on, and the dependency is a named key in a file already read — but a general position-preserving JSON
 * parser is real unstarted work, so this does the bounded thing and returns nothing rather than guess at an offset.
 *
 * Quotes are tracked while counting braces so a value containing `{` or `}` cannot end the group early —
 * `"start": "node -e '{}'"` is ordinary in a scripts block and would otherwise close it.
 */
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
  for (let from = source.indexOf(key); from !== -1; from = source.indexOf(key, from + 1)) {
    const colon = skipSpace(source, from + key.length)
    if (source[colon] !== ':') continue
    const brace = skipSpace(source, colon + 1)
    if (source[brace] !== '{') continue
    const end = matchBrace(source, brace)
    if (end !== undefined) return { start: brace + 1, end }
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

/**
 * Spec §10: `RawDiagnostic.range` is UTF-8 bytes while a JavaScript string index counts UTF-16 code units. They
 * agree on the ASCII a package name is made of, and diverge the moment anything *above* it in the manifest holds a
 * non-ASCII character — an author's name or a description, both routine.
 */
function byteOffset(source: string, index: number): number {
  return new TextEncoder().encode(source.slice(0, index)).length
}
