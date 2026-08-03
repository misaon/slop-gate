import { styleText } from 'node:util'
import { padEndDisplay, truncateEnd } from './display-width.ts'

export type Box = { tl: string; tr: string; bl: string; br: string; h: string; v: string }

export const UNICODE_BOX: Box = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }
export const ASCII_BOX: Box = { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' }

/** Drawable frame width is clamped to this range regardless of the reported terminal width — narrow enough
 *  that a giant monitor does not stretch the box across the whole screen, wide enough that a narrow one
 *  never collapses it below something legible. */
export const MIN_FRAME_WIDTH = 60
export const MAX_FRAME_WIDTH = 100

export const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

export type FrameContext = {
  unicode: boolean
  color: boolean
  /** Terminal width in columns, before clamping — supplied by the caller (or fixed in tests) so frame width
   *  is deterministic and never read from `process.stdout` inside rendering code. */
  width: number
  write: (chunk: string) => void
}

export type FrameKit = {
  box: Box
  /** `context.width` clamped to `[MIN_FRAME_WIDTH, MAX_FRAME_WIDTH]`. */
  width: number
  /** `width - 2`: the content width between the two border columns. */
  inner: number
  /** Deliberately `validateStream: false`: `styleText` otherwise re-derives colour support from
   *  `process.stdout.isTTY` itself, overriding `context.color` in exactly the one case that flag exists to
   *  handle (`FORCE_COLOR` while piped). */
  paint: (style: Parameters<typeof styleText>[0], text: string) => string
  frameTop: () => string
  /** Pads or truncates `content` to `inner` and wraps it between the frame's two border columns. */
  frameRow: (content: string) => string
  frameBottom: () => string
  /** One printed unit: each precedes itself with exactly one blank line and appends none of its own, which
   *  is what produces blank-line-separated blocks regardless of how many units get flushed. */
  writeUnit: (lines: readonly string[]) => void
}

/** The framed-box primitives shared by `pretty.ts` and the `sgate rules list`/`why`/`conflicts` renderers —
 *  one copy of this logic in the package, not a hand-rolled box per command. */
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
