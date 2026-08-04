import { displayWidth } from './display-width.ts'

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
