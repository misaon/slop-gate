import { alignLines, type AlignKind } from './align.ts'
import { decodeUtf8 } from './apply.ts'

/** Unchanged lines shown either side of a change, and the gap below which two hunks merge. */
const CONTEXT_LINES = 3

type Line = { readonly text: string; readonly newline: boolean }

/**
 * Splits into lines, remembering whether the buffer ended with a newline. `\r` is stripped and re-derived
 * nowhere: a CRLF file would otherwise put a carriage return on the end of every context line, which a
 * terminal renders as the cursor jumping to column zero mid-hunk. The diff is a human-readable report, not
 * a patch — `applyEdits` writes the bytes and never sees this.
 */
function toLines(buffer: Uint8Array): Line[] {
  const text = decodeUtf8(buffer)
  if (text === '') return []
  const endsWithNewline = text.endsWith('\n')
  const body = endsWithNewline ? text.slice(0, -1) : text
  const parts = body.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
  return parts.map((part, index) => ({ text: part, newline: endsWithNewline || index < parts.length - 1 }))
}

type Op = { readonly kind: ' ' | '-' | '+'; readonly line: Line }

/** Two lines are the same only if their trailing-newline status matches too — that is what makes a
 *  file gaining or losing its final newline show up as a change rather than rendering identically. */
const same = (a: Line, b: Line): boolean => a.text === b.text && a.newline === b.newline

const OP_KIND: Record<AlignKind, Op['kind']> = { same: ' ', removed: '-', added: '+' }

/**
 * Lines paired up by `alignLines`, then relabelled into diff vocabulary. The alignment lives in `align.ts`
 * because `editsFromRewrite` needs exactly the same one and the two disagreeing is a real defect — see that
 * module. When the window is too large to align, this renders "delete everything, add everything": correct
 * output, just not a minimal one.
 */
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

/**
 * Renders a `git diff`-shaped unified diff between two versions of one file — what `sgate fix --dry-run`
 * prints instead of writing (spec §11). Hand-written rather than a dependency because this output is the
 * *whole* product of `--dry-run`. Paths are `a/<path>` and `b/<path>` off the repo-relative POSIX path the
 * diagnostic already carries, so the result pastes into `git apply`.
 */
export function unifiedDiff(file: string, before: Uint8Array, after: Uint8Array): string {
  const ops = diffLines(toLines(before), toLines(after))
  if (!ops.some((op) => op.kind !== ' ')) return ''

  const changed = ops.map((op, index) => (op.kind === ' ' ? -1 : index)).filter((index) => index >= 0)
  const groups: Array<{ start: number; end: number }> = []
  for (const index of changed) {
    const last = groups.at(-1)
    // `2 * CONTEXT_LINES` is the merge threshold rather than one: two changes closer than that would
    // render overlapping context, and git merges them for the same reason.
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

    // An empty side is numbered from 0, matching git: `@@ -0,0 +1,3 @@` for a created file.
    lines.push(`@@ -${oldCount === 0 ? 0 : oldStart + 1},${oldCount} +${newCount === 0 ? 0 : newStart + 1},${newCount} @@`)
    for (const op of slice) {
      lines.push(`${op.kind}${op.line.text}`)
      if (!op.line.newline) lines.push('\\ No newline at end of file')
    }
  }

  return `${lines.join('\n')}\n`
}
