import { alignLines, type AlignKind } from './align.ts'
import { decodeUtf8 } from './apply.ts'

const CONTEXT_LINES = 3

type Line = { readonly text: string; readonly newline: boolean }

function toLines(buffer: Uint8Array): Line[] {
  const text = decodeUtf8(buffer)
  if (text === '') return []
  const endsWithNewline = text.endsWith('\n')
  const body = endsWithNewline ? text.slice(0, -1) : text
  const parts = body.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
  return parts.map((part, index) => ({ text: part, newline: endsWithNewline || index < parts.length - 1 }))
}

type Op = { readonly kind: ' ' | '-' | '+'; readonly line: Line }

const same = (a: Line, b: Line): boolean => a.text === b.text && a.newline === b.newline

const OP_KIND: Record<AlignKind, Op['kind']> = { same: ' ', removed: '-', added: '+' }

function diffLines(before: readonly Line[], after: readonly Line[]): Op[] {
  const { head, tail, oldWindow, newWindow, steps } = alignLines(before, after, same)

  const ops: Op[] = before.slice(0, head).map((line) => ({ kind: ' ' as const, line }))
  if (steps === null) {
    ops.push(...oldWindow.map((line) => ({ kind: '-' as const, line })))
    ops.push(...newWindow.map((line) => ({ kind: '+' as const, line })))
  } else {
    for (const step of steps) ops.push({ kind: OP_KIND[step.kind], line: step.line })
  }
  ops.push(...before.slice(before.length - tail).map((line) => ({ kind: ' ' as const, line })))
  return ops
}

export function unifiedDiff(file: string, before: Uint8Array, after: Uint8Array): string {
  const ops = diffLines(toLines(before), toLines(after))
  if (!ops.some((op) => op.kind !== ' ')) return ''

  const changed = ops.map((op, index) => (op.kind === ' ' ? -1 : index)).filter((index) => index >= 0)
  const groups: { start: number; end: number }[] = []
  for (const index of changed) {
    const last = groups.at(-1)
    if (last !== undefined && index - last.end <= 2 * CONTEXT_LINES) last.end = index
    else groups.push({ start: index, end: index })
  }

  const lines = [`--- a/${file}`, `+++ b/${file}`]
  for (const group of groups) {
    const from = Math.max(0, group.start - CONTEXT_LINES)
    const to = Math.min(ops.length - 1, group.end + CONTEXT_LINES)

    let oldStart = 0
    let newStart = 0
    for (const op of ops.slice(0, from)) {
      if (op.kind !== '+') oldStart += 1
      if (op.kind !== '-') newStart += 1
    }

    const slice = ops.slice(from, to + 1)
    const oldCount = slice.filter((op) => op.kind !== '+').length
    const newCount = slice.filter((op) => op.kind !== '-').length

    lines.push(`@@ -${oldCount === 0 ? 0 : oldStart + 1},${oldCount} +${newCount === 0 ? 0 : newStart + 1},${newCount} @@`)
    for (const op of slice) {
      lines.push(`${op.kind}${op.line.text}`)
      if (!op.line.newline) lines.push(String.raw`\ No newline at end of file`)
    }
  }

  return `${lines.join('\n')}\n`
}
