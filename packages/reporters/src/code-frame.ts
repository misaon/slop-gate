import { styleText } from 'node:util'
import type { Position } from '@misaon/slop-gate-core'

const CONTEXT_LINES = 1

export function renderCodeFrame(
  source: string,
  position: Position,
  options: { color?: boolean } = {},
): string {
  const color = options.color ?? false
  const paint = (style: Parameters<typeof styleText>[0], text: string): string =>
    color ? styleText(style, text) : text

  const lines = source.split('\n')
  const first = Math.max(1, position.startLine - CONTEXT_LINES)
  const last = Math.min(lines.length, position.startLine + CONTEXT_LINES)
  const gutterWidth = String(last).length

  const out: string[] = []
  for (let lineNumber = first; lineNumber <= last; lineNumber += 1) {
    const text = (lines[lineNumber - 1] ?? '').replace(/\r$/, '')
    const gutter = String(lineNumber).padStart(gutterWidth, ' ')
    out.push(`${paint('dim', `${gutter} |`)} ${text}`)

    if (lineNumber !== position.startLine) continue

    const endColumn = position.endLine === position.startLine ? position.endColumn : text.length + 1
    const width = Math.max(1, endColumn - position.startColumn)
    const pad = ' '.repeat(gutterWidth) + paint('dim', ' |') + ' ' + ' '.repeat(position.startColumn - 1)
    out.push(`${pad}${paint('red', '^'.repeat(width))}`)
  }

  return out.join('\n')
}
