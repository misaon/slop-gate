import { styleText } from 'node:util'
import { padEndDisplay, truncateEnd } from './display-width.ts'

export type Box = { tl: string; tr: string; bl: string; br: string; h: string; v: string }

export const UNICODE_BOX: Box = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }
export const ASCII_BOX: Box = { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' }

/**
 * Drawable frame width is clamped to this range regardless of the reported terminal width — narrow
 * enough that a giant monitor's terminal does not stretch the box across the whole screen, wide
 * enough that a narrow one never collapses it below something legible.
 */
export const MIN_FRAME_WIDTH = 60
export const MAX_FRAME_WIDTH = 100

export const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

export type FrameContext = {
  /** Draw Unicode box-drawing characters (`UNICODE_BOX`) or fall back to ASCII (`ASCII_BOX`,
   *  `TERM=dumb`). */
  unicode: boolean
  /** Whether to emit ANSI colour escapes at all — independent of `unicode` (see `ReporterContext`'s
   *  own doc comment on the same two fields). */
  color: boolean
  /** Terminal width in columns, before clamping — the caller supplies `process.stdout.columns ??
   *  80` (or a fixed value in tests) so frame width is deterministic and never read from
   *  `process.stdout` inside rendering code. */
  width: number
  write: (chunk: string) => void
}

export type FrameKit = {
  box: Box
  /** `context.width` clamped to `[MIN_FRAME_WIDTH, MAX_FRAME_WIDTH]`. */
  width: number
  /** `width - 2`: the content width between the two border columns. */
  inner: number
  /** Applies an ANSI style, or returns `text` unchanged when `context.color` is false. Deliberately
   *  `validateStream: false` — see the equivalent note this replaces in `pretty.ts`'s own history:
   *  `styleText` otherwise re-derives colour support from `process.stdout.isTTY` itself, overriding
   *  `context.color` in exactly the one case that flag exists to handle (`FORCE_COLOR` while piped). */
  paint: (style: Parameters<typeof styleText>[0], text: string) => string
  frameTop: () => string
  /** Pads or truncates `content` to `inner` and wraps it between the frame's two border columns. */
  frameRow: (content: string) => string
  frameBottom: () => string
  /**
   * Writes one printed unit: a leading blank line, `lines` joined, then one trailing newline —
   * every unit precedes itself with exactly one blank line and appends none of its own, which is
   * what produces blank-line-separated blocks regardless of how many units get flushed.
   */
  writeUnit: (lines: readonly string[]) => void
}

/**
 * The framed-box rendering primitives `pretty.ts`'s `check` reporter draws its header and footer
 * with — extracted so `sgate rules list`/`why`/`conflicts` render the same header/footer language
 * instead of a second, hand-rolled box-drawing implementation. `pretty.ts` itself now calls this
 * too; there is exactly one copy of this logic in the package.
 */
export function createFrameKit(context: FrameContext): FrameKit {
  const box = context.unicode ? UNICODE_BOX : ASCII_BOX
  const width = Math.max(MIN_FRAME_WIDTH, Math.min(context.width, MAX_FRAME_WIDTH))
  const inner = width - 2

  const paint = (style: Parameters<typeof styleText>[0], text: string): string =>
    context.color ? styleText(style, text, { validateStream: false }) : text

  return {
    box,
    width,
    inner,
    paint,
    frameTop: () => `  ${box.tl}${box.h.repeat(inner)}${box.tr}`,
    frameRow: (content: string) => `  ${box.v}${padEndDisplay(truncateEnd(content, inner), inner)}${box.v}`,
    frameBottom: () => `  ${box.bl}${box.h.repeat(inner)}${box.br}`,
    writeUnit: (lines: readonly string[]) => context.write(`\n${lines.join('\n')}\n`),
  }
}
