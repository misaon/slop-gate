import { styleText } from 'node:util'
import { padEndDisplay, truncateEnd } from './display-width.ts'

export type Box = { tl: string; tr: string; bl: string; br: string; h: string; v: string }

export const UNICODE_BOX: Box = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }
export const ASCII_BOX: Box = { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' }

export const MIN_FRAME_WIDTH = 60
export const MAX_FRAME_WIDTH = 100

export const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

export type FrameContext = {
  unicode: boolean
  color: boolean
  width: number
  write: (chunk: string) => void
}

export type FrameKit = {
  box: Box
  width: number
  inner: number
  paint: (style: Parameters<typeof styleText>[0], text: string) => string
  frameTop: () => string
  frameRow: (content: string) => string
  frameBottom: () => string
  writeUnit: (lines: readonly string[]) => void
}

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
