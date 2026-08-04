const IDENTIFIER_CHAR = /[\p{ID_Continue}$]/u

function maskSource(source: string): string {
  const out = [...source]
  const blank = (from: number, to: number): void => {
    for (let i = from; i < to && i < out.length; i += 1) if (out[i] !== '\n') out[i] = ' '
  }

  let i = 0
  while (i < source.length) {
    const two = source.slice(i, i + 2)
    if (two === '//') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      blank(i, stop)
      i = stop
      continue
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      blank(i, stop)
      i = stop
      continue
    }
    const quote = source[i]
    if (quote === "'" || quote === '"' || quote === '`') {
      let j = i + 1
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === quote) break
        j += 1
      }
      blank(i + 1, Math.min(j, source.length))
      i = Math.min(j + 1, source.length)
      continue
    }
    i += 1
  }
  return out.join('')
}

function skipSpace(masked: string, from: number, end: number): number {
  let i = from
  while (i < end && /\s/.test(masked[i]!)) i += 1
  return i
}

function findKeyColon(source: string, masked: string, key: string, start: number, end: number): number {
  let depth = 0
  let best = -1
  let bestDepth = Number.POSITIVE_INFINITY

  for (let i = start; i < end; i += 1) {
    const char = masked[i]!
    if (char === '{' || char === '[' || char === '(') depth += 1
    else if (char === '}' || char === ']' || char === ')') depth -= 1
    if (depth >= bestDepth) continue

    const before = masked[i - 1]
    const quoted = before === "'" || before === '"'
    if (!(quoted ? source.startsWith(key, i) : masked.startsWith(key, i))) continue

    const after = source[i + key.length]
    if (quoted ? after !== before : after !== undefined && IDENTIFIER_CHAR.test(after)) continue
    if (!quoted && before !== undefined && IDENTIFIER_CHAR.test(before)) continue

    const cursor = skipSpace(masked, i + key.length + (quoted ? 1 : 0), end)
    if (masked[cursor] !== ':') continue
    best = cursor
    bestDepth = depth
  }
  return best
}

function braceInterior(masked: string, open: number, end: number): { start: number; end: number } | null {
  let depth = 0
  for (let i = open; i < end; i += 1) {
    if (masked[i] === '{') depth += 1
    else if (masked[i] === '}') {
      depth -= 1
      if (depth === 0) return { start: open + 1, end: i }
    }
  }
  return null
}

function readQuoted(source: string, masked: string, open: number, end: number): string | null {
  const quote = masked[open]
  if (quote !== "'" && quote !== '"') return null
  const close = masked.indexOf(quote, open + 1)
  if (close === -1 || close >= end) return null
  const literal = source.slice(open + 1, close)
  return literal.includes('\\') ? null : literal
}

export type StringListResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'values'; readonly values: readonly string[] }
  | { readonly kind: 'unreadable' }

export function extractStringList(source: string, propertyPath: readonly string[]): StringListResult {
  if (propertyPath.length === 0) return { kind: 'absent' }
  const masked = maskSource(source)

  let span = { start: 0, end: masked.length }
  for (const [index, key] of propertyPath.entries()) {
    const colon = findKeyColon(source, masked, key, span.start, span.end)
    if (colon === -1) return { kind: 'absent' }
    const value = skipSpace(masked, colon + 1, span.end)

    if (index < propertyPath.length - 1) {
      if (masked[value] !== '{') return { kind: 'unreadable' }
      const interior = braceInterior(masked, value, span.end)
      if (interior === null) return { kind: 'unreadable' }
      span = interior
      continue
    }

    if (masked[value] !== '[') {
      const single = readQuoted(source, masked, value, span.end)
      return single === null ? { kind: 'unreadable' } : { kind: 'values', values: [single] }
    }

    const close = masked.indexOf(']', value + 1)
    if (close === -1 || close >= span.end) return { kind: 'unreadable' }
    const values: string[] = []
    let cursor = skipSpace(masked, value + 1, close)
    while (cursor < close) {
      const element = readQuoted(source, masked, cursor, close)
      if (element === null) return { kind: 'unreadable' }
      cursor = skipSpace(masked, masked.indexOf(masked[cursor]!, cursor + 1) + 1, close)
      if (masked[cursor] === ',') cursor = skipSpace(masked, cursor + 1, close)
      values.push(element)
    }
    return { kind: 'values', values }
  }
  return { kind: 'absent' }
}

export function extractStringLiteral(source: string, propertyPath: readonly string[]): string | null {
  if (propertyPath.length === 0) return null
  const masked = maskSource(source)

  let span = { start: 0, end: masked.length }
  for (const [index, key] of propertyPath.entries()) {
    const colon = findKeyColon(source, masked, key, span.start, span.end)
    if (colon === -1) return null
    const value = skipSpace(masked, colon + 1, span.end)

    if (index < propertyPath.length - 1) {
      if (masked[value] !== '{') return null
      const interior = braceInterior(masked, value, span.end)
      if (interior === null) return null
      span = interior
      continue
    }

    const quote = masked[value]
    if (quote !== "'" && quote !== '"') return null
    const close = masked.indexOf(quote, value + 1)
    if (close === -1 || close >= span.end) return null
    const literal = source.slice(value + 1, close)
    return literal.includes('\\') ? null : literal
  }
  return null
}
