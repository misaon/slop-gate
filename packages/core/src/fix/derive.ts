import type { Edit } from '../diagnostics/types.ts'
import { alignLines } from './align.ts'
import { decodeUtf8 } from './apply.ts'

type SourceLine = { readonly text: string; readonly start: number; readonly end: number }

function splitLines(buffer: Uint8Array): SourceLine[] {
  const lines: SourceLine[] = []
  let start = 0
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 0x0A) {
      lines.push({ text: decodeUtf8(buffer.subarray(start, i + 1)), start, end: i + 1 })
      start = i + 1
    }
  }
  if (start < buffer.length) lines.push({ text: decodeUtf8(buffer.subarray(start)), start, end: buffer.length })
  return lines
}

const sameText = (a: SourceLine, b: SourceLine): boolean => a.text === b.text

export function editsFromRewrite(before: Uint8Array, after: Uint8Array): Edit[] {
  const oldLines = splitLines(before)
  const newLines = splitLines(after)
  const { head, tail, oldWindow, newWindow, steps } = alignLines(oldLines, newLines, sameText)
  if (oldWindow.length === 0 && newWindow.length === 0) return []

  const anchor =
    oldWindow[0]?.start ?? oldLines[head - 1]?.end ?? oldLines[oldLines.length - tail]?.start ?? before.length

  if (steps === null) {
    return [narrowEditToChangedBytes(before, oldWindow[0]?.start ?? anchor, oldWindow.at(-1)?.end ?? anchor, newWindow.map((l) => l.text).join(''))]
  }

  const edits: Edit[] = []
  let removed: SourceLine[] = []
  let added: string[] = []
  let pendingAt: number | null = null

  const flush = (): void => {
    if (removed.length === 0 && added.length === 0) return
    if (removed.length === added.length) {
      removed.forEach((line, index) => edits.push(narrowEditToChangedBytes(before, line.start, line.end, added[index]!)))
    } else {
      const start = removed[0]?.start ?? pendingAt ?? anchor
      const end = removed.at(-1)?.end ?? start
      edits.push(narrowEditToChangedBytes(before, start, end, added.join('')))
    }
    removed = []
    added = []
    pendingAt = null
  }

  let cursor = anchor
  for (const step of steps) {
    if (step.kind === 'same') {
      flush()
      cursor = step.line.end
      continue
    }
    if (step.kind === 'removed') {
      removed.push(step.line)
      cursor = step.line.end
      continue
    }
    if (removed.length === 0 && pendingAt === null) pendingAt = cursor
    added.push(step.line.text)
  }
  flush()

  return edits
}

const isContinuation = (byte: number | undefined): boolean => byte !== undefined && (byte & 0xC0) === 0x80

function narrowEditToChangedBytes(before: Uint8Array, start: number, end: number, replacement: string): Edit {
  const removed = before.subarray(start, end)
  const inserted = new TextEncoder().encode(replacement)

  let prefix = 0
  while (prefix < removed.length && prefix < inserted.length && removed[prefix] === inserted[prefix]) prefix += 1
  while (prefix > 0 && (isContinuation(removed[prefix]) || isContinuation(inserted[prefix]))) prefix -= 1

  let suffix = 0
  while (
    suffix < removed.length - prefix &&
    suffix < inserted.length - prefix &&
    removed[removed.length - 1 - suffix] === inserted[inserted.length - 1 - suffix]
  ) {
    suffix += 1
  }
  while (
    suffix > 0 &&
    (isContinuation(removed[removed.length - suffix]) || isContinuation(inserted[inserted.length - suffix]))
  ) {
    suffix -= 1
  }

  return {
    range: { start: start + prefix, end: end - suffix },
    replacement: decodeUtf8(inserted.subarray(prefix, inserted.length - suffix)),
  }
}
