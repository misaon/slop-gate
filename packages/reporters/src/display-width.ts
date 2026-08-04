const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

const ESCAPE_CHAR = String.fromCharCode(27)
const ANSI_ESCAPE_PATTERN = new RegExp(ESCAPE_CHAR + '\\[[0-9;]*[a-zA-Z]', 'g')

const isCombiningMark = (codePoint: number): boolean => /\p{M}/u.test(String.fromCodePoint(codePoint))

function isWideCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0x303e) ||
    (codePoint >= 0x3041 && codePoint <= 0x33ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  )
}

function clusterWidth(cluster: string): number {
  const codePoint = cluster.codePointAt(0)
  if (codePoint === undefined) return 0
  if (isCombiningMark(codePoint)) return 0
  return isWideCodePoint(codePoint) ? 2 : 1
}

export function hasWideOrFullwidthCharacter(text: string): boolean {
  const visible = text.replace(ANSI_ESCAPE_PATTERN, '')
  for (const { segment } of graphemeSegmenter.segment(visible)) {
    if (clusterWidth(segment) === 2) return true
  }
  return false
}

function isPrintableAscii(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code < 0x20 || code > 0x7e) return false
  }
  return true
}

export function displayWidth(text: string): number {
  if (isPrintableAscii(text)) return text.length
  const visible = text.replace(ANSI_ESCAPE_PATTERN, '')
  let width = 0
  for (const { segment } of graphemeSegmenter.segment(visible)) width += clusterWidth(segment)
  return width
}

export function padEndDisplay(text: string, width: number): string {
  const current = displayWidth(text)
  return current >= width ? text : text + ' '.repeat(width - current)
}

export function padStartDisplay(text: string, width: number): string {
  const current = displayWidth(text)
  return current >= width ? text : ' '.repeat(width - current) + text
}

export function truncateEnd(text: string, maxWidth: number, ellipsis = '…'): string {
  if (displayWidth(text) <= maxWidth) return text
  const budget = maxWidth - displayWidth(ellipsis)
  if (budget <= 0) return ellipsis
  let result = ''
  for (const { segment } of graphemeSegmenter.segment(text)) {
    if (displayWidth(result + segment) > budget) break
    result += segment
  }
  return result + ellipsis
}

export function truncateStart(text: string, maxWidth: number, ellipsis = '…'): string {
  if (displayWidth(text) <= maxWidth) return text
  const budget = maxWidth - displayWidth(ellipsis)
  if (budget <= 0) return ellipsis
  const clusters = [...graphemeSegmenter.segment(text)].map(({ segment }) => segment)
  let result = ''
  for (let index = clusters.length - 1; index >= 0; index -= 1) {
    const candidate = clusters[index] + result
    if (displayWidth(candidate) > budget) break
    result = candidate
  }
  return ellipsis + result
}
