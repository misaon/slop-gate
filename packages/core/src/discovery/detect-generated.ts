const GENERATED_PATH_MARKERS = /(^|\/)__generated__\/|\.(gen|generated)\.[^/]+$/

export function isGeneratedPath(path: string): boolean {
  return GENERATED_PATH_MARKERS.test(path)
}

const HEADER_LINES = 5
const COMMENT_OPENER = /^\s*(\/\/|\/\*+|\*|#|<!--)/
const SIGNED_SOURCE = /@generated\b/
const GENERATED_BY = /\b(?:auto[-\s]?)?gener(?:ated|ator)\b/i
const DO_NOT_EDIT = /\bdo\s+not\s+(?:edit|modify|change)\b|\bdon'?t\s+edit\b/i

/**
 * A generated file almost always says so in its first comment. Tools converge on two spellings: the
 * bare `@generated` tag, and a sentence pairing "generated" with "do not edit". Both are required to
 * sit in a comment in the head of the file, so prose mentioning either further down cannot trip it.
 */
export function isGeneratedSource(source: string): boolean {
  let offset = 0
  for (let line = 0; line < HEADER_LINES; line += 1) {
    const newline = source.indexOf('\n', offset)
    const text = source.slice(offset, newline === -1 ? undefined : newline)
    if (!COMMENT_OPENER.test(text)) {
      if (text.trim() !== '') return false
    } else if (SIGNED_SOURCE.test(text) || (GENERATED_BY.test(text) && DO_NOT_EDIT.test(text))) {
      return true
    }
    if (newline === -1) return false
    offset = newline + 1
  }
  return false
}
