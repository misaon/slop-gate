/**
 * Terminal display width of a string, in columns — as opposed to `string.length`, which counts
 * UTF-16 code units and is wrong for both surrogate-pair emoji (one visual glyph, two code units)
 * and combining marks (zero visual columns, one code unit). Every pad and truncation in this
 * package must go through this rather than `.length` or `.padEnd`/`.padStart`, or a line containing
 * an emoji or an accented character silently shears every column below it.
 *
 * Segmentation is by Unicode grapheme cluster (`Intl.Segmenter`, UAX #29), not by code point: this
 * is what makes a flag (two regional-indicator code points), a ZWJ sequence, and a base character
 * plus its combining marks each count as the *one* user-perceived character they render as, rather
 * than as their constituent code points summed independently.
 *
 * ANSI SGR colour escape sequences (what Node's `styleText` emits) are stripped before measuring.
 * Found the hard way, empirically: `pretty.ts` colours a line's text and *then* pads or truncates
 * it to fit a frame, so `displayWidth` was seeing the escape bytes too — each one is invisible but
 * has no assigned wide/narrow Unicode range, so it fell through to the width-1 default and inflated
 * the measured width of any coloured run by several columns. That miscount was large enough to make
 * `frameRow`'s defensive truncation fire on a header nowhere near the frame's actual width, and to
 * under-pad every coloured line's trailing border. Confirmed by running the real CLI, not by
 * reasoning about the code: a coloured header rendered with a stray ellipsis and a misaligned right
 * border before this fix, and does not after it.
 */

const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

// Built from a char code, not a literal escape character in this source file, so the byte sequence
// is unambiguous on review. Matches one CSI sequence -- ESC, "[", parameters, a letter terminator
// (`m` for the SGR/colour codes `styleText` emits; the wider terminator class costs nothing and
// covers any other CSI sequence that might reach this function).
const ESCAPE_CHAR = String.fromCharCode(27)
const ANSI_ESCAPE_PATTERN = new RegExp(ESCAPE_CHAR + '\\[[0-9;]*[a-zA-Z]', 'g')

// A character is a combining mark (Unicode general category M: Mn, Mc or Me) when it attaches to
// a preceding base character and contributes no width of its own. `Intl.Segmenter` already groups
// a base character with its trailing marks into one cluster -- this test exists only to catch a
// cluster that consists *solely* of marks (nothing to attach to, e.g. a bare combining accent at
// the very start of a string), whose width is zero rather than falling through to the width-1
// default a wide/narrow codepoint check would otherwise give it.
const isCombiningMark = (codePoint: number): boolean => /\p{M}/u.test(String.fromCodePoint(codePoint))

/**
 * True for code points whose EastAsianWidth is Wide or Fullwidth (CJK ideographs, Hangul syllables,
 * fullwidth forms -- unambiguously two columns in every terminal), or that are emoji with default
 * emoji presentation (the astral emoji planes, roughly U+1F300 upward, plus the regional-indicator
 * pair used for flags). Deliberately excludes the BMP "symbols and dingbats" ranges (U+2600-27BF,
 * U+2300-23FF, block elements, geometric shapes, box drawing): those are EastAsianWidth *Ambiguous*
 * and default to narrow outside a CJK locale, and -- concretely for this package -- cover the box
 * frame characters (`─│╭╮╰╯`), the file-header mark (`▌`) and the clean-run check (`✓`), all of
 * which this codebase renders as one column. Widening this range would misalign every frame.
 */
function isWideCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) || // Hangul Jamo
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0x303e) || // CJK Radicals..CJK Symbols and Punctuation
    (codePoint >= 0x3041 && codePoint <= 0x33ff) || // Hiragana..CJK Compatibility
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // CJK Unified Ideographs Extension A
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK Unified Ideographs
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) || // Yi Syllables and Radicals
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // Hangul Syllables
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK Compatibility Ideographs
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) || // CJK Compatibility Forms
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // Fullwidth Forms
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) || // Regional indicators (flag pairs)
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) || // Emoji: pictographs, emoticons, transport..
    (codePoint >= 0x20000 && codePoint <= 0x3fffd) // CJK Unified Ideographs Extension B and beyond
  )
}

/** Terminal display width, in columns, of one grapheme cluster (as segmented by `Intl.Segmenter`). */
function clusterWidth(cluster: string): number {
  const codePoint = cluster.codePointAt(0)
  if (codePoint === undefined) return 0
  if (isCombiningMark(codePoint)) return 0
  return isWideCodePoint(codePoint) ? 2 : 1
}

export function displayWidth(text: string): number {
  const visible = text.replace(ANSI_ESCAPE_PATTERN, '')
  let width = 0
  for (const { segment } of graphemeSegmenter.segment(visible)) width += clusterWidth(segment)
  return width
}

/** Right-pads `text` with spaces so its display width reaches `width` (a no-op if already wider). */
export function padEndDisplay(text: string, width: number): string {
  const current = displayWidth(text)
  return current >= width ? text : text + ' '.repeat(width - current)
}

/** Left-pads `text` with spaces so its display width reaches `width` (a no-op if already wider). */
export function padStartDisplay(text: string, width: number): string {
  const current = displayWidth(text)
  return current >= width ? text : ' '.repeat(width - current) + text
}

/**
 * Truncates `text` from the *end*, keeping the head and appending an ellipsis, so its display
 * width fits within `maxWidth`. For free-flowing text (e.g. a concept name) where the start of the
 * string is the more identifying part.
 */
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

/**
 * Truncates `text` from the *start*, keeping the tail and prefixing an ellipsis, so its display
 * width fits within `maxWidth`. For file paths, where the filename at the end matters more than
 * the root at the start.
 */
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
