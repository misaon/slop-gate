export type Token = {
  readonly kind: 'text' | 'code'
  readonly value: string
  readonly bold: boolean
}

const CODE_SPAN = /(`[^`]+`)/g

const isCode = (segment: string): boolean => segment.startsWith('`') && segment.endsWith('`')
const BOLD = '**'

/**
 * The withheld reasons are prose written in commit-message markdown. Only two spellings appear —
 * `` `code` `` and `**bold**` — so this reads those and leaves everything else alone.
 *
 * **Code binds tighter than bold**, as in CommonMark, and it has to: the reasons quote glob patterns
 * like `` `**\/*.css` ``, and a bold-first pass reads that leading `**` as an emphasis marker and
 * bolds the rest of the paragraph. Bold still spans a code span, because that also occurs.
 *
 * A paragraph whose `**` do not pair up is rendered literally rather than half-bolded — an unbalanced
 * marker is a typo in the source, and guessing where it closes is worse than showing it.
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
    segment.split(BOLD).forEach((part, index) => {
      if (index > 0) bold = !bold
      if (part !== '') tokens.push({ kind: 'text', value: part, bold })
    })
  }

  return tokens
}

export function paragraphsOf(text: string): string[] {
  return text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim() !== '')
}
