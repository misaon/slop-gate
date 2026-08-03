/**
 * Terminal display width of a string, in columns — `string.length` counts UTF-16 code units and is wrong for
 * both surrogate-pair emoji (one glyph, two code units) and combining marks (zero columns, one code unit).
 * **Every pad and truncation in this package must go through this**, never `.length`/`.padEnd`/`.padStart`,
 * or one emoji or accented character silently shears every column below it. Segmentation is by grapheme
 * cluster (`Intl.Segmenter`, UAX #29) rather than by code point, which is what makes a flag (two
 * regional-indicator code points), a ZWJ sequence, and a base character plus its combining marks each count
 * as the *one* user-perceived character they render as.
 *
 * ANSI SGR colour escapes are stripped before measuring: `pretty.ts` colours a line's text and *then* pads
 * or truncates it, and an escape byte has no assigned wide/narrow range, so it fell through to the width-1
 * default and inflated any coloured run by several columns — enough to fire `frameRow`'s defensive
 * truncation on a header nowhere near the frame's actual width, and to under-pad every coloured line's
 * trailing border.
 */

const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

// Built from a char code, not a literal escape character, so the byte sequence is unambiguous on review.
// Matches one CSI sequence -- ESC, "[", parameters, a letter terminator (`m` is the SGR/colour code
// `styleText` emits; the wider terminator class costs nothing).
const ESCAPE_CHAR = String.fromCharCode(27)
const ANSI_ESCAPE_PATTERN = new RegExp(ESCAPE_CHAR + '\\[[0-9;]*[a-zA-Z]', 'g')

// A combining mark (Unicode general category M: Mn, Mc, Me) attaches to a preceding base character and
// contributes no width of its own. `Intl.Segmenter` already groups a base with its trailing marks into one
// cluster, so this test exists only to catch a cluster that consists *solely* of marks (a bare combining
// accent at the very start of a string), whose width is zero rather than the width-1 default.
const isCombiningMark = (codePoint: number): boolean => /\p{M}/u.test(String.fromCodePoint(codePoint))

/**
 * True for code points whose EastAsianWidth is Wide or Fullwidth (CJK ideographs, Hangul syllables, fullwidth
 * forms -- two columns in every terminal), or that are emoji with default emoji presentation (the astral
 * emoji planes, roughly U+1F300 upward, plus the regional-indicator pair used for flags). **Deliberately
 * excludes the BMP "symbols and dingbats" ranges** (U+2600-27BF, U+2300-23FF, block elements, geometric
 * shapes, box drawing): those are EastAsianWidth *Ambiguous*, default to narrow outside a CJK locale, and
 * cover the box frame characters (`─│╭╮╰╯`), the file-header mark (`▌`) and the clean-run check (`✓`), all of
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

function clusterWidth(cluster: string): number {
  const codePoint = cluster.codePointAt(0)
  if (codePoint === undefined) return 0
  if (isCombiningMark(codePoint)) return 0
  return isWideCodePoint(codePoint) ? 2 : 1
}

/**
 * True if `text` contains any grapheme cluster this module measures at two columns (see `isWideCodePoint`),
 * with ANSI colour escapes stripped first as in `displayWidth`.
 *
 * Exists for one purpose: **a framed line (`pretty.ts`'s `frameRow`) must never contain one.** The
 * standards-correct count is two, but plenty of real terminals render such a character one column narrower,
 * which shifts a framed line's closing border left of every other line's. That cannot be fixed by measuring
 * better — the only durable fix is keeping these characters out of framed lines, and this function is what
 * lets a test enforce it as an invariant instead of re-litigating it the next time someone adds a glyph to
 * the footer.
 */
export function hasWideOrFullwidthCharacter(text: string): boolean {
  const visible = text.replace(ANSI_ESCAPE_PATTERN, '')
  for (const { segment } of graphemeSegmenter.segment(visible)) {
    if (clusterWidth(segment) === 2) return true
  }
  return false
}

/**
 * True when every code unit is printable ASCII (U+0020..U+007E), for which display width is exactly `length`:
 * each is its own grapheme cluster, none is a combining mark, none is wide, and none is the ESC that
 * `ANSI_ESCAPE_PATTERN` strips.
 *
 * **Printable ASCII rather than "< 0x80" deliberately**: `\r\n` is *one* grapheme cluster (UAX #29 keeps CRLF
 * together) and so measures 1 through the general path but 2 through `length`, so admitting control
 * characters here would change an existing answer rather than reach it faster.
 *
 * Worth the branch: the general path is the hottest self-time frame of a real run — `Intl.Segmenter` plus a
 * `\p{M}` regex test *per cluster*, over strings that are pure ASCII in almost every real case (source
 * lines, repo-relative paths, English rule messages).
 */
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

/** Truncates from the *end* — for free-flowing text (e.g. a concept name) whose start is the identifying part. */
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

/** Truncates from the *start* — for file paths, where the filename at the end matters more than the root. */
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
