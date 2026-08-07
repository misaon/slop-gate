import { parseSync } from 'oxc-parser'

export type ObjectEntry = {
  /** The property text, from its first attached comment line through its trailing comma. */
  readonly block: string
  /** The comment lines immediately above the property, or null where it carries none. */
  readonly comment: string | null
  readonly value: string
}

type Located = {
  readonly properties: readonly { readonly key: string; readonly start: number; readonly end: number; readonly valueStart: number }[]
  readonly open: number
  readonly close: number
}

class SourceEditError extends Error {}

function fail(message: string): never {
  throw new SourceEditError(message)
}

function locate(filename: string, source: string, record: string): Located {
  const parsed = parseSync(filename, source, { lang: 'ts' })
  if (parsed.errors.length > 0) fail(`${filename} does not parse: ${parsed.errors[0]?.message ?? 'unknown error'}`)

  for (const statement of parsed.program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration === null || declaration === undefined || declaration.type !== 'VariableDeclaration') continue

    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== 'Identifier' || declarator.id.name !== record) continue
      const init = declarator.init
      if (init === null || init === undefined || init.type !== 'ObjectExpression') {
        fail(`${record} in ${filename} is not initialised with an object literal`)
      }

      const properties = init.properties.map((property) => {
        if (property.type !== 'Property') fail(`${record} in ${filename} holds a spread, which this editor cannot place`)
        const key = property.key
        const name = key.type === 'Literal' ? String(key.value) : key.type === 'Identifier' ? key.name : null
        if (name === null) fail(`${record} in ${filename} holds a computed key, which this editor cannot address`)
        return { key: name, start: property.start, end: property.end, valueStart: property.value.start }
      })

      return { properties, open: init.start, close: init.end - 1 }
    }
  }
  fail(`${filename} declares no ${record}`)
}

const lineStart = (source: string, offset: number): number => source.lastIndexOf('\n', offset - 1) + 1

/** Past the property's trailing comma and the rest of its line, including the newline. */
function blockEnd(source: string, end: number): number {
  let cursor = end
  if (source[cursor] === ',') cursor += 1
  const newline = source.indexOf('\n', cursor)
  return newline === -1 ? source.length : newline + 1
}

/**
 * Comment lines directly above a property belong to it, and a blank line is what separates them from
 * whatever came before — the only signal there is, since a leading comment is not part of the node.
 */
function blockStart(source: string, previousEnd: number, propertyStart: number): number {
  let start = lineStart(source, propertyStart)
  while (start > previousEnd) {
    const above = lineStart(source, start - 1)
    if (above < previousEnd) break
    if (!source.slice(above, start).trimStart().startsWith('//')) break
    start = above
  }
  return start
}

function blockOf(source: string, located: Located, index: number): { readonly start: number; readonly end: number } {
  const property = located.properties[index]!
  const previous = located.properties[index - 1]
  const previousEnd = previous === undefined ? located.open + 1 : blockEnd(source, previous.end)
  return { start: blockStart(source, previousEnd, property.start), end: blockEnd(source, property.end) }
}

/** The entry as it stands, so a caller can keep a comment or a value it is not changing. */
export function readObjectEntry(filename: string, source: string, record: string, key: string): ObjectEntry | null {
  const located = locate(filename, source, record)
  const index = located.properties.findIndex((property) => property.key === key)
  if (index === -1) return null

  const property = located.properties[index]!
  const { start, end } = blockOf(source, located, index)
  const comment = source
    .slice(start, lineStart(source, property.start))
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.trim().replace(/^\/\/ ?/, ''))
    .join('\n')

  return {
    block: source.slice(start, end),
    comment: comment === '' ? null : comment,
    value: source.slice(property.valueStart, property.end),
  }
}

/**
 * Replace, append or remove one property of a top-level object literal, leaving every byte outside it
 * alone. Spans come from the parser; the text between them is spliced rather than reprinted, because
 * these two registry files are hand-wrapped prose and a printer would reflow all of it.
 *
 * `block` is the finished property text — its own leading comment lines, its indentation and its
 * trailing comma — or null to remove the property.
 */
export function editObjectLiteral(
  filename: string,
  source: string,
  record: string,
  key: string,
  block: string | null,
): string {
  const located = locate(filename, source, record)
  const index = located.properties.findIndex((property) => property.key === key)

  if (index !== -1) {
    const { start, end } = blockOf(source, located, index)
    return `${source.slice(0, start)}${block === null ? '' : `${block}\n`}${source.slice(end)}`
  }
  if (block === null) return source

  const last = located.properties.at(-1)
  const at = last === undefined ? lineStart(source, located.close) : blockEnd(source, last.end)
  return `${source.slice(0, at)}${block}\n${source.slice(at)}`
}

/** Single quotes, because that is what both registry files use; a literal newline becomes `\n`. */
export function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`
}

/**
 * The registry's reasons are hand-wrapped concatenations, and `oxfmt` will not rewrap a string, so a
 * generated one has to arrive already wrapped or it lands as a single 900-character line.
 */
export function wrapLiteral(value: string, indent: string, width: number): string {
  const budget = width - indent.length
  const lines: string[] = []
  let current = ''

  for (const word of value.split(' ')) {
    const candidate = current === '' ? word : `${current} ${word}`
    if (current !== '' && quote(`${candidate} `).length > budget) {
      lines.push(`${current} `)
      current = word
      continue
    }
    current = candidate
  }
  lines.push(current)

  return lines.map((line, index) => `${indent}${quote(line)}${index === lines.length - 1 ? '' : ' +'}`).join('\n')
}
