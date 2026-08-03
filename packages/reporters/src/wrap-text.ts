import { displayWidth } from './display-width.ts'

/**
 * Wraps `text` to fit within `width` display columns, breaking only at whitespace. A single word wider than
 * `width` (a long path, a minified identifier) is emitted whole on its own line rather than split
 * mid-character — an overlong line reads as a minor layout hiccup, but a chopped identifier is actively
 * misleading about what the token was.
 *
 * **Callers that colour their text must wrap the plain text first and paint each returned line afterward**:
 * colouring first would let an escape sequence's start and end land on two different lines.
 */
export function wrapText(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width)
  const words = text.split(/\s+/).filter((word) => word.length > 0)
  if (words.length === 0) return ['']

  const lines: string[] = []
  let line = ''
  let lineWidth = 0

  for (const word of words) {
    const wordWidth = displayWidth(word)
    if (line === '') {
      line = word
      lineWidth = wordWidth
      continue
    }
    const candidateWidth = lineWidth + 1 + wordWidth
    if (candidateWidth > safeWidth) {
      lines.push(line)
      line = word
      lineWidth = wordWidth
    } else {
      line = `${line} ${word}`
      lineWidth = candidateWidth
    }
  }
  lines.push(line)
  return lines
}
