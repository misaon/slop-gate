const IDENTIFIER_CHAR = /[\p{ID_Continue}$]/u

/**
 * Blanks out every comment and every string *body* in `source`, preserving length and preserving the
 * quote characters themselves. Structural scanning then runs over this copy while values are read
 * from the original at the same offsets, which is what lets the scanner below find a property key
 * without a parser and without ever matching one that only appears inside a comment or a string.
 *
 * A template literal is masked like any other string. Its delimiters survive, so the value reader
 * sees a backtick, does not recognise it as a plain literal, and yields nothing — which is the
 * correct answer for `` `./a/${b}` ``: the value is computed, and this probe does not compute.
 */
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

/** Index just past the whitespace run starting at `from`, bounded by `end`. */
function skipSpace(masked: string, from: number, end: number): number {
  let i = from
  while (i < end && /\s/.test(masked[i]!)) i += 1
  return i
}

/**
 * Offset of the colon introducing `key`'s value within `[start, end)`, choosing the **shallowest**
 * match and, among equally shallow ones, the first.
 *
 * Shallowest rather than "at depth zero" because the two callers sit at different depths and neither
 * knows its own: the first segment is looked for in a whole file, where the config object's own
 * braces put its keys one level down (and an `import { defineConfig }` line makes "descend into the
 * first brace" wrong), while later segments are looked for in an object interior, where they sit at
 * depth zero. Picking the minimum handles both, and is what stops `{ snapshot: { path } , path }`
 * from resolving to the nested one.
 *
 * Matches `key:` and `'key':`/`"key":`. A bare identifier is matched against `masked`, so one inside
 * a comment or a string body (both blanked) cannot match; a quoted key is matched against `source`,
 * because masking blanked its body, and is then required to have its closing quote immediately
 * after — which is what rejects the `"migrations: { ... }"` inside a string.
 */
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

/** Interior span of the `{...}` starting at `open`, or `null` if it is never closed. */
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

/**
 * The `literal` probe's whole implementation (spec §23.1): the value of a **string literal** at a
 * dotted property path in a framework's own config file, read **without executing it**. Importing
 * `mikro-orm.config.ts` to learn one path would make `sgate check` open a database connection; this
 * reads the source instead and looks at it.
 *
 * Deliberately not a parser, and deliberately incomplete in one direction only. It answers when the
 * value is written literally and yields `null` for everything else — a variable, a template with an
 * interpolation, a `process.env` lookup, a `join()` call, or a path containing a backslash escape.
 * That is the safe failure direction the design commits to: an unresolvable parameter makes the
 * profile *not apply*, restoring the status quo, rather than applying it against a guessed value and
 * silently moving which files an engine treats as reachable. Never throws — a truncated or
 * unbalanced source is just another `null`.
 */
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
