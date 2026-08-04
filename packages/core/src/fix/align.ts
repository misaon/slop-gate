export type AlignKind = 'same' | 'removed' | 'added'

type AlignStep<T> = {
  readonly kind: AlignKind
  readonly line: T
}

type Alignment<T> = {
  readonly head: number
  readonly tail: number
  readonly oldWindow: readonly T[]
  readonly newWindow: readonly T[]
  readonly steps: readonly AlignStep<T>[] | null
}

const MAX_CELLS = 4_000_000

export function alignLines<T>(before: readonly T[], after: readonly T[], same: (a: T, b: T) => boolean): Alignment<T> {
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
  if (oldWindow.length * newWindow.length > MAX_CELLS) return { head, tail, oldWindow, newWindow, steps: null }

  const width = newWindow.length + 1
  const table = new Int32Array((oldWindow.length + 1) * width)
  for (let i = oldWindow.length - 1; i >= 0; i -= 1) {
    const oldLine = oldWindow[i]!
    const row = i * width
    const below = row + width
    let right = 0
    let belowRight = 0
    for (let j = newWindow.length - 1; j >= 0; j -= 1) {
      const belowValue = table[below + j]!
      const value = same(oldLine, newWindow[j]!) ? belowRight + 1 : Math.max(belowValue, right)
      table[row + j] = value
      right = value
      belowRight = belowValue
    }
  }

  const steps: AlignStep<T>[] = []
  let i = 0
  let j = 0
  while (i < oldWindow.length || j < newWindow.length) {
    if (i < oldWindow.length && j < newWindow.length && same(oldWindow[i]!, newWindow[j]!)) {
      steps.push({ kind: 'same', line: oldWindow[i]! })
      i += 1
      j += 1
      continue
    }
    if (j >= newWindow.length || (i < oldWindow.length && table[(i + 1) * width + j]! >= table[i * width + j + 1]!)) {
      steps.push({ kind: 'removed', line: oldWindow[i]! })
      i += 1
      continue
    }
    steps.push({ kind: 'added', line: newWindow[j]! })
    j += 1
  }

  return { head, tail, oldWindow, newWindow, steps }
}
