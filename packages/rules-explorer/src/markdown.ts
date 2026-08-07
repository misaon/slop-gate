export type Token = {
  readonly kind: 'text' | 'code'
  readonly value: string
  readonly bold: boolean
}

const CODE_SPAN = /(`[^`]+`)/g

const isCode = (segment: string): boolean => segment.startsWith('`') && segment.endsWith('`')
const BOLD = '**'

/**
 * Code binds tighter than bold, and must: the reasons quote globs like `` `**\/*.css` ``, whose leading
 * `**` a bold-first pass reads as emphasis and bolds the rest of the paragraph. Unpaired `**` renders
 * literally — an unbalanced marker is a typo, and guessing where it closes is worse than showing it.
 */
export function tokenise(paragraph: string): Token[] {
  const segments = paragraph.split(CODE_SPAN).filter((segment) => segment !== '')

  const markers = segments
    .filter((segment) => !isCode(segment))
    .reduce((total, segment) => total + segment.split(BOLD).length - 1, 0)
  const paired = markers > 0 && markers % 2 === 0

  const tokens: Token[] = []
  let bold = false

  for (const segment of segments) {
    if (isCode(segment)) {
      tokens.push({ kind: 'code', value: segment.slice(1, -1), bold })
      continue
    }
    if (!paired) {
      tokens.push({ kind: 'text', value: segment, bold: false })
      continue
    }
    for (const [index, part] of segment.split(BOLD).entries()) {
      if (index > 0) bold = !bold
      if (part !== '') tokens.push({ kind: 'text', value: part, bold })
    }
  }

  return tokens
}

export function paragraphsOf(text: string): string[] {
  return text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim() !== '')
}
