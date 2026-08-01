import { decodeUtf8 } from './apply.ts'

/** Unchanged lines shown either side of a change, and the gap below which two hunks merge. */
const CONTEXT_LINES = 3

type Line = { readonly text: string; readonly newline: boolean }

/**
 * Splits into lines while remembering whether the buffer ended with a newline, so a file that gains
 * or loses its trailing one shows the change instead of rendering identically. `\r` is stripped from
 * the line content and re-derived nowhere: a CRLF file would otherwise put a carriage return on the
 * end of every context line in the diff, which a terminal renders as the cursor jumping to column
 * zero mid-hunk. The diff is a human-readable report, not a patch to be applied, so dropping it
 * costs nothing — `applyEdits` is what writes bytes, and it never sees this.
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

/**
 * Longest common subsequence over lines, after trimming the common head and tail.
 *
 * The trim is what makes an O(n·m) table affordable on a real source file: a fix changes a handful
 * of lines, so the window that actually differs is tiny even in a thousand-line file. `MAX_CELLS`
 * bounds the pathological case (a whole file rewritten) by falling back to "delete everything, add
 * everything", which is correct output, just not a minimal one.
 */
const MAX_CELLS = 4_000_000

function diffLines(before: readonly Line[], after: readonly Line[]): Op[] {
  let head = 0
  while (head < before.length && head < after.length && same(before[head]!, after[head]!)) head += 1

  let tail = 0
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    same(before[before.length - 1 - tail]!, after[after.length - 1 - tail]!)
  ) {
    tail += 1
  }

  const oldWindow = before.slice(head, before.length - tail)
  const newWindow = after.slice(head, after.length - tail)

  const ops: Op[] = before.slice(0, head).map((line) => ({ kind: ' ' as const, line }))

  if (oldWindow.length * newWindow.length > MAX_CELLS) {
    ops.push(...oldWindow.map((line) => ({ kind: '-' as const, line })))
    ops.push(...newWindow.map((line) => ({ kind: '+' as const, line })))
  } else {
    const table: number[][] = Array.from({ length: oldWindow.length + 1 }, () => Array.from<number>({ length: newWindow.length + 1 }).fill(0))
    for (let i = oldWindow.length - 1; i >= 0; i -= 1) {
      for (let j = newWindow.length - 1; j >= 0; j -= 1) {
        table[i]![j] = same(oldWindow[i]!, newWindow[j]!)
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
      }
    }

    let i = 0
    let j = 0
    while (i < oldWindow.length && j < newWindow.length) {
      if (same(oldWindow[i]!, newWindow[j]!)) {
        ops.push({ kind: ' ', line: oldWindow[i]! })
        i += 1
        j += 1
      } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
        ops.push({ kind: '-', line: oldWindow[i]! })
        i += 1
      } else {
        ops.push({ kind: '+', line: newWindow[j]! })
        j += 1
      }
    }
    for (; i < oldWindow.length; i += 1) ops.push({ kind: '-', line: oldWindow[i]! })
    for (; j < newWindow.length; j += 1) ops.push({ kind: '+', line: newWindow[j]! })
  }

  ops.push(...before.slice(before.length - tail).map((line) => ({ kind: ' ' as const, line })))
  return ops
}

/**
 * Renders a `git diff`-shaped unified diff between two versions of one file — what `sgate fix
 * --dry-run` prints instead of writing (spec §11).
 *
 * Written here rather than taken as a dependency because the output is the *whole* product of
 * `--dry-run`: the one thing a user reads to decide whether to let the tool touch their source. A
 * diff library would be a third-party formatting decision sitting on that seam, and the trimmed-LCS
 * this needs is smaller than the wrapper around one would be.
 *
 * Paths are rendered `a/<path>` and `b/<path>` from the repo-relative POSIX path the diagnostic
 * already carries, so the output pastes into `git apply` and reads the way `git diff` does.
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
